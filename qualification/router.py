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

import math
import statistics
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse

import sync
from wc_data import generate_wc_data

from . import engine, projection
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


def _american_to_prob(odds: Any) -> Optional[float]:
    """American moneyline odds → implied win probability. None if unparseable."""
    if odds is None:
        return None
    s = str(odds).strip()
    if not s:
        return None
    try:
        n = int(s.lstrip("+-"))
    except ValueError:
        return None
    if n <= 0:
        return None
    return n / (n + 100) if s.startswith("-") else 100 / (n + 100)


def _team_ratings() -> Dict[str, float]:
    """Strength ratings (mean 0, ~unit spread) from the config's title odds.

    A team's tournament-winner price is a usable proxy for overall strength. We
    take log(implied probability) and standardise it, so the Monte-Carlo model
    weights matches by how good the teams actually are — Brazil are not Haiti.
    Teams without odds get a neutral 0.
    """
    z: Dict[str, float] = {}
    for code, meta in _TEAM_META.items():
        p = _american_to_prob(meta.get("odds"))
        if p is not None:
            z[code] = math.log(p)
    if len(z) < 2:
        return {code: 0.0 for code in _TEAM_META}
    mean = statistics.fmean(z.values())
    sd = statistics.pstdev(z.values()) or 1.0
    return {code: ((z[code] - mean) / sd if code in z else 0.0) for code in _TEAM_META}


_RATINGS: Dict[str, float] = _team_ratings()


def _base_fixtures() -> List[Dict[str, Any]]:
    """The same source the rest of the app reads: live cache, else baseline."""
    return sync.fixture_cache if sync.fixture_cache else generate_wc_data()["fixtures"]


def _group_done_count(group: str, fixtures: List[Fixture]) -> int:
    return sum(1 for f in fixtures if f.group == group and f.status == "done")


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


def _serialise_third(
    s: engine.ThirdPlaceStanding, target: str, played_by: Dict[str, int]
) -> Dict[str, Any]:
    card = _team_card(s.team_id)
    return {
        **card,
        "group": s.group,
        "played": played_by.get(s.team_id),
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


def _impact_read(i: projection.GameImpact) -> tuple:
    """Return (wants_text_template, good_outcomes) for one game.

    ``good_outcomes`` are the results within a small margin of the best for the
    target — these get highlighted together so the wording and the bars agree.
    The text uses {home}/{away} placeholders filled in by the caller.
    """
    rates = {"home": i.chance_if_home_win, "draw": i.chance_if_draw, "away": i.chance_if_away_win}
    best = max(rates.values())
    good = {k for k, v in rates.items() if v >= best - 0.04}
    if good == {"home"}:
        text = "{home} to win"
    elif good == {"away"}:
        text = "{away} to win"
    elif good == {"draw"}:
        text = "{home} and {away} to draw"
    elif good == {"home", "draw"}:
        text = "{home} to avoid defeat"
    elif good == {"away", "draw"}:
        text = "{away} to avoid defeat"
    elif good == {"home", "away"}:          # a draw is the only bad result
        text = "anything but a draw"
    else:
        text = "the result barely matters"
    return text, sorted(good)


def _serialise_impact(i: projection.GameImpact, target_name: str) -> Dict[str, Any]:
    home = _team_card(i.home)
    away = _team_card(i.away)
    text, good = _impact_read(i)
    return {
        "fixtureId": i.fixture_id,
        "group": i.group,
        "home": home,
        "away": away,
        "chanceIfHomeWin": round(i.chance_if_home_win * 100),
        "chanceIfDraw": round(i.chance_if_draw * 100),
        "chanceIfAwayWin": round(i.chance_if_away_win * 100),
        "swing": round(i.swing * 100),
        "favouredOutcome": i.favoured_outcome,
        "goodOutcomes": good,
        "wants": text.format(home=home["name"], away=away["name"]),
        "matters": i.matters,
    }


def _serialise_result(f: Dict[str, Any]) -> Dict[str, Any]:
    score = f.get("score") or [None, None]
    return {
        "fixtureId": f.get("id"),
        "group": f.get("group"),
        "matchday": f.get("matchday"),
        "home": _team_card(f.get("a")),
        "away": _team_card(f.get("b")),
        "homeGoals": score[0],
        "awayGoals": score[1],
        "status": f.get("status"),
        "dateLabel": f.get("dateLabel"),
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

    # Monte-Carlo projection: the target's qualification chance and how each
    # remaining game swings it. This is what makes the tracker answer the real
    # question — which results elsewhere matter, and which way.
    proj = projection.project(
        teams, fixtures, target_team_id=target, cutoff=cutoff, ratings=_RATINGS
    )

    # Group games with a score to show: completed plus any in-progress (live /
    # half-time), so the results board reflects what's happening right now.
    results = [
        f for f in rows
        if f.get("stage") == "group"
        and f.get("status") in ("done", "live", "halfTime")
        and isinstance(f.get("score"), (list, tuple))
    ]
    results.sort(key=lambda f: (f.get("group") or "~", f.get("matchday") or 0))
    games_total = sum(1 for f in rows if f.get("stage") == "group")
    games_played = sum(
        1 for f in rows if f.get("stage") == "group" and f.get("status") == "done"
    )

    target_group_rows = tables.get(status.group, [])
    played_by = {row.team_id: row.played for grp in tables.values() for row in grp}

    # How much of the group stage is actually settled. The best-thirds table is
    # only final once all groups are complete; until then it's provisional and
    # the UI says so (a third on 3 pts can look "in" simply because rival groups
    # haven't kicked off yet).
    all_groups = {t.group for t in teams}
    groups_complete = sum(
        1 for g in all_groups if _group_done_count(g, fixtures) >= engine._GROUP_GAMES
    )

    return {
        "target": target,
        "targetName": status.name,
        "cutoff": cutoff,
        "groupsComplete": groups_complete,
        "groupsTotal": len(all_groups),
        "provisional": groups_complete < len(all_groups),
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
        "chance": {
            "percent": round(proj.chance * 100),
            "decided": proj.decided,
            "trials": proj.trials,
        },
        "thirdPlaceTable": [_serialise_third(s, target, played_by) for s in thirds],
        "targetGroupTable": [_serialise_group_row(s, target) for s in target_group_rows],
        "remainingGames": [_serialise_impact(i, status.name) for i in proj.impacts],
        "results": [_serialise_result(f) for f in results],
        "gamesPlayed": games_played,
        "gamesTotal": games_total,
        "meta": _data_freshness(rows),
        "generatedAt": datetime.now(tz=timezone.utc).isoformat(),
    }


# ── Routes ───────────────────────────────────────────────────────────────────

# Served at both the generic path and the Scotland-branded public URL
# (wheesht.xyz/scotland-qualification). Same page either way — it defaults to
# Scotland and accepts ?target= for any other team.
@router.get("/qualification", response_class=HTMLResponse)
@router.get("/scotland-qualification", response_class=HTMLResponse)
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
