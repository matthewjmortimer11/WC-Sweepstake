"""
Qualification tracker — FastAPI router.

A thin shell around the pure engine (``qualification/engine.py``). It does no
maths of its own: it converts the *existing* fixture data layer
(``sync.fixture_cache``, populated by the Football-Data.org / mock adapter via
``sync.start_sync``) plus the tournament's team list into the engine's plain
types, runs the scenario engine, and serves the result as JSON + a mobile-first
page. No second provider, no API key on the client.
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse

import sync
from wc_data import generate_wc_data

from . import engine
from .engine import Fixture, Team

router = APIRouter()

_TEMPLATE = Path("templates/qualification.html")

# Self-contained page: inline styles + a small inline script (no bundler, like
# the rest of the app). Locked down to exactly what the page loads.
_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
    "font-src 'self' https://fonts.gstatic.com; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "base-uri 'self'; form-action 'self'; object-src 'none'; frame-ancestors 'none'"
)

# Poll cadence: brisk while anything is live, relaxed otherwise.
_LIVE_POLL_MS = 30_000          # 30 s
_IDLE_POLL_MS = 5 * 60_000      # 5 min
# Data older than this (and no live games) is surfaced as stale in the UI.
_STALE_AFTER_S = 15 * 60


# ── Tournament team list (static per process; read once from config) ─────────

def _load_team_meta() -> Dict[str, Dict[str, Any]]:
    data = generate_wc_data()
    return {t["code"]: t for t in data["teams"]}


_TEAM_META: Dict[str, Dict[str, Any]] = _load_team_meta()
_DEFAULT_TARGET = engine.DEFAULT_TARGET if engine.DEFAULT_TARGET in _TEAM_META else (
    next(iter(_TEAM_META), engine.DEFAULT_TARGET)
)


def _engine_teams() -> List[Team]:
    # Fair-play data isn't published by the current provider, so it's left as
    # None — the engine then falls back gracefully through GD / goals / fallback.
    return [
        Team(id=t["code"], name=t["name"], group=t["group"], fair_play=t.get("fairPlay"))
        for t in _TEAM_META.values()
    ]


def _base_fixtures() -> List[Dict[str, Any]]:
    """The same source the rest of the app reads: live cache, else baseline."""
    return sync.fixture_cache if sync.fixture_cache else generate_wc_data()["fixtures"]


def _engine_fixtures(rows: List[Dict[str, Any]]) -> List[Fixture]:
    out: List[Fixture] = []
    for f in rows:
        if f.get("stage") != "group":
            continue
        score = f.get("score")
        hg = ag = None
        if isinstance(score, (list, tuple)) and len(score) == 2:
            hg, ag = score[0], score[1]
        out.append(
            Fixture(
                id=str(f.get("id")),
                home=f.get("a"),
                away=f.get("b"),
                status=f.get("status", "upcoming"),
                group=f.get("group"),
                home_goals=hg,
                away_goals=ag,
                stage="group",
            )
        )
    return out


# ── Serialisation helpers ────────────────────────────────────────────────────

def _team_card(team_id: str) -> Dict[str, Any]:
    meta = _TEAM_META.get(team_id, {})
    return {"id": team_id, "name": meta.get("name", team_id), "flag": meta.get("flag", "")}


def _serialise_third(s: engine.ThirdPlaceStanding, target: str) -> Dict[str, Any]:
    card = _team_card(s.team_id)
    return {
        **card,
        "group": s.group,
        "points": s.points,
        "goalDifference": s.goal_difference,
        "goalsFor": s.goals_for,
        "fairPlay": s.fair_play,
        "rank": s.rank,
        "qualifies": s.qualifies,
        "isTarget": s.team_id == target,
    }


def _serialise_group_row(s: engine.GroupStanding, target: str) -> Dict[str, Any]:
    card = _team_card(s.team_id)
    return {
        **card,
        "rank": s.rank,
        "played": s.played,
        "won": s.won,
        "drawn": s.drawn,
        "lost": s.lost,
        "goalsFor": s.goals_for,
        "goalsAgainst": s.goals_against,
        "goalDifference": s.goal_difference,
        "points": s.points,
        "isTarget": s.team_id == target,
    }


def _serialise_requirement(r: engine.ScenarioRequirement) -> Dict[str, Any]:
    return {
        "fixtureId": r.fixture_id,
        "group": r.group,
        "home": _team_card(r.home),
        "away": _team_card(r.away),
        "text": r.text,
        "bandKind": r.band.kind,
        "combine": r.combine,
    }


def _data_freshness(rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    stamps = []
    for f in rows:
        ts = f.get("updatedAt")
        if not ts:
            continue
        try:
            stamps.append(datetime.fromisoformat(ts.replace("Z", "+00:00")))
        except (ValueError, AttributeError):
            continue
    last = max(stamps) if stamps else None
    live = any(f.get("status") in ("live", "halfTime") for f in rows)
    using_cache = bool(sync.fixture_cache)
    age = None
    stale = not using_cache
    if last is not None:
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        age = (datetime.now(tz=timezone.utc) - last).total_seconds()
        if not live and age > _STALE_AFTER_S:
            stale = True
    return {
        "lastUpdated": last.isoformat() if last else None,
        "ageSeconds": age,
        "live": live,
        "stale": stale,
        "usingLiveData": using_cache,
        "pollIntervalMs": _LIVE_POLL_MS if live else _IDLE_POLL_MS,
    }


def _build_payload(target: str) -> Dict[str, Any]:
    teams = _engine_teams()
    if target not in {t.id for t in teams}:
        raise HTTPException(status_code=404, detail=f"Unknown team: {target}")

    rows = _base_fixtures()
    fixtures = _engine_fixtures(rows)
    cutoff = engine.DEFAULT_CUTOFF

    tables = engine.build_group_tables(teams, fixtures)
    status = engine.get_target_team_status(teams, fixtures, target_team_id=target, cutoff=cutoff)
    thirds = engine.rank_third_placed_teams(engine.get_third_placed_teams(tables), cutoff)
    requirements = engine.calculate_what_target_needs(teams, fixtures, target_team_id=target, cutoff=cutoff)

    target_group_rows = tables.get(status.group, [])

    return {
        "target": target,
        "targetName": status.name,
        "cutoff": cutoff,
        "status": {
            "teamId": status.team_id,
            "name": status.name,
            "flag": _team_card(status.team_id)["flag"],
            "group": status.group,
            "groupRank": status.group_rank,
            "points": status.group_points,
            "goalDifference": status.group_goal_difference,
            "goalsFor": status.group_goals_for,
            "positionLabel": status.position_label,
            "thirdPlaceRank": status.third_place_rank,
            "qualified": status.qualified,
            "groupComplete": status.group_complete,
            "state": status.status,
            "headline": status.headline,
        },
        "thirdPlaceTable": [_serialise_third(s, target) for s in thirds],
        "targetGroupTable": [_serialise_group_row(s, target) for s in target_group_rows],
        "requirements": [_serialise_requirement(r) for r in requirements],
        "meta": _data_freshness(rows),
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(),
    }


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/qualification", response_class=HTMLResponse)
async def qualification_page() -> HTMLResponse:
    if not _TEMPLATE.is_file():
        raise HTTPException(status_code=404, detail="not found")
    return HTMLResponse(
        _TEMPLATE.read_text(encoding="utf-8"),
        headers={"Content-Security-Policy": _CSP},
    )


@router.get("/api/qualification")
async def qualification_state(
    target: Optional[str] = Query(default=None, max_length=8),
) -> JSONResponse:
    team = (target or _DEFAULT_TARGET).upper()
    return JSONResponse(_build_payload(team))
