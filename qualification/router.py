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
from dataclasses import replace
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


def _config_cutoff() -> int:
    """How many third-placed teams advance — from the tournament config, not
    hardcoded, so a different tournament just needs a different config file."""
    try:
        q = generate_wc_data().get("meta", {}).get("qualification", {})
        n = int(q.get("best_third_qualifiers", engine.DEFAULT_CUTOFF))
        return n if n > 0 else engine.DEFAULT_CUTOFF
    except Exception:
        return engine.DEFAULT_CUTOFF


_TEAM_META: Dict[str, Dict[str, Any]] = _load_team_meta()
_CUTOFF: int = _config_cutoff()
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


def _wants_text(good: set) -> str:
    if good == {"home"}:
        return "{home} to win"
    if good == {"away"}:
        return "{away} to win"
    if good == {"draw"}:
        return "{home} and {away} to draw"
    if good == {"home", "draw"}:
        return "{home} to avoid defeat"
    if good == {"away", "draw"}:
        return "{away} to avoid defeat"
    if good == {"home", "away"}:            # a draw is the only result that hurts
        return "anything but a draw"
    return "the result barely matters"      # nothing clearly improves the chance


# How close to the best available result an outcome must land to count as "fine"
# for us: within a few points of qualification chance is practically as good, so
# a draw that's nearly as useful as a win is acknowledged, not ignored.
_GOOD_TOL = 6
# How far below the best a result must drop before we name it as the danger —
# enough of a gap that it's worth a warning rather than crying wolf.
_DANGER_DROP = 12


def _classify_outcomes(h: int, dr: int, a: int):
    """From the qualification chance (%) under each result of a game, work out
    which results we're happy with and which single result is the one to fear.

    "Good" = every result within a few points of the best available (so a draw
    that's nearly as good as a win counts). "Danger" = the worst result, but only
    when it drops us clearly below what we want — answering "are we screwed if
    they win?" without flagging every game. Returns (good_set, danger_key|None,
    worst_pct).
    """
    outcomes = [("home", h), ("draw", dr), ("away", a)]
    best = max(p for _, p in outcomes)
    good = {k for k, p in outcomes if p >= best - _GOOD_TOL}
    worst_key, worst = min(outcomes, key=lambda kv: kv[1])
    danger = worst_key if (best - worst >= _DANGER_DROP and worst_key not in good) else None
    return good, danger, worst


def _fear_text(danger: Optional[str], worst_pct: int) -> str:
    """A short 'the result that hurts us' line, e.g. 'If {home} win, we're in real
    trouble'. Severity scales with how low our chance falls in that case."""
    if not danger:
        return ""
    clause = {"home": "{home} win", "away": "{away} win", "draw": "it's a draw"}[danger]
    if worst_pct <= 10:
        sev = "we're all but out"
    elif worst_pct <= 30:
        sev = "we're in real trouble"
    elif worst_pct <= 50:
        sev = "it gets nervy"
    else:
        sev = "we take a hit"
    return "If " + clause + ", " + sev


def _serialise_impact(
    i: projection.GameImpact,
    target_name: str,
    base_pct: int,
    row: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    home = _team_card(i.home)
    away = _team_card(i.away)
    h = round(i.chance_if_home_win * 100)
    dr = round(i.chance_if_draw * 100)
    a = round(i.chance_if_away_win * 100)
    # The result(s) we're happy with = every outcome within a few points of the
    # best available — so a draw that's nearly as good as a win is shown as fine,
    # rather than insisting on a win. We also surface the single result to fear,
    # so "if Belgium win, are we screwed?" is answered on the card itself.
    good_set, danger, worst_pct = _classify_outcomes(h, dr, a)
    good = sorted(good_set)
    text = _wants_text(good_set)
    fear = _fear_text(danger, worst_pct).format(home=home["name"], away=away["name"])
    row = row or {}
    return {
        "fixtureId": i.fixture_id,
        "group": i.group,
        "home": home,
        "away": away,
        "chanceIfHomeWin": h,
        "chanceIfDraw": dr,
        "chanceIfAwayWin": a,
        "swing": round(i.swing * 100),
        "favouredOutcome": i.favoured_outcome,
        "goodOutcomes": good,
        "wants": text.format(home=home["name"], away=away["name"]),
        "fear": fear,
        "matters": i.matters,
        # When the game is — so the UI can order chronologically and show the time.
        "kickoff": _kickoff_key(row),
        "dateLabel": row.get("dateLabel"),
        "time": row.get("time"),
        "status": row.get("status", "upcoming"),
        "live": row.get("status") in ("live", "halfTime"),
    }


def _kickoff_key(f: Dict[str, Any]) -> str:
    return (f.get("dateISO") or "") + "T" + (f.get("time") or "00:00")


def _build_race(teams, fixtures, status, tables, cutoff: int) -> Optional[Dict[str, Any]]:
    """The "lifeline" survival view: how many of the other groups still need to
    produce a third-placed team below the target. Only applies when the target
    has finished its group in 3rd — that's when its fate is purely in other
    groups' hands. Auto-resolves as groups finish (✓ banked / ✗ lost / pending).
    """
    if not (status.group_rank == 3 and status.group_complete):
        return None

    bench = (status.group_points, status.group_goal_difference, status.group_goals_for)
    all_groups = sorted(tables.keys())
    others = [g for g in all_groups if g != status.group]
    need_total = max(0, len(all_groups) - cutoff)   # 12 − 8 = 4 must finish below us

    odds = projection.third_place_group_odds(
        teams, fixtures, status.team_id, bench, ratings=_RATINGS, trials=5000
    )

    banked = lost = level = 0
    above_now: List[Dict[str, Any]] = []
    group_rows: List[Dict[str, Any]] = []
    for g in others:
        rows = tables.get(g, [])
        third = next((r for r in rows if r.rank == 3), None)
        complete = _group_done_count(g, fixtures) >= engine._GROUP_GAMES
        prob = odds.get(g, 0.0)
        tstat = (third.points, third.goal_difference, third.goals_for) if third else None
        if complete and third and tstat is not None:
            if tstat < bench:
                outcome, banked = "banked", banked + 1
            elif tstat > bench:
                outcome, lost = "lost", lost + 1
                above_now.append({**_team_card(third.team_id), "group": g,
                                  "points": third.points, "goalDifference": third.goal_difference,
                                  "goalsFor": third.goals_for})
            else:
                outcome, level = "level", level + 1
        else:
            outcome = "pending"
        group_rows.append({
            "group": g,
            "complete": complete,
            "outcome": outcome,                  # banked | lost | level | pending
            "third": ({**_team_card(third.team_id), "points": third.points,
                       "goalDifference": third.goal_difference, "goalsFor": third.goals_for}
                      if third else None),
            "probGood": round(prob * 100),       # chance this group ends up below us
        })

    in_play = [r for r in group_rows if r["outcome"] == "pending"]
    possible = sum(1 for r in in_play if r["probGood"] >= 1)
    need_more = max(0, need_total - banked)

    if banked >= need_total:
        survival = "qualified"
    elif banked + possible < need_total:
        survival = "eliminated"
    else:
        likely = sum(1 for r in in_play if r["probGood"] >= 50)
        expected = banked + sum(r["probGood"] / 100 for r in in_play)
        survival = "alive" if (likely >= need_more or expected >= need_total) else "thread"

    # Order the cards: still-in-play first (biggest hope first), then settled.
    order = {"pending": 0, "banked": 1, "level": 2, "lost": 3}
    group_rows.sort(key=lambda r: (order[r["outcome"]], -r["probGood"], r["group"]))

    return {
        "applicable": True,
        "benchmark": {"points": bench[0], "goalDifference": bench[1], "goalsFor": bench[2]},
        "needTotal": need_total,
        "needMore": need_more,
        "banked": banked,
        "lost": lost,
        "level": level,
        "inPlay": len(in_play),
        "survival": survival,            # qualified | alive | thread | eliminated
        "aboveNow": above_now,
        "groups": group_rows,
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
        "live": f.get("status") in ("live", "halfTime"),
        "dateLabel": f.get("dateLabel"),
        "time": f.get("time"),
        "kickoff": _kickoff_key(f),
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
    row_by_id = {str(f.get("id")): f for f in rows}
    cutoff = _CUTOFF

    tables = engine.build_group_tables(teams, fixtures)
    status = engine.get_target_team_status(teams, fixtures, target_team_id=target, cutoff=cutoff)
    thirds = engine.rank_third_placed_teams(engine.get_third_placed_teams(tables), cutoff)

    # Monte-Carlo projection: the target's qualification chance and how each
    # remaining game swings it. This is what makes the tracker answer the real
    # question — which results elsewhere matter, and which way.
    proj = projection.project(
        teams, fixtures, target_team_id=target, cutoff=cutoff, ratings=_RATINGS, trials=6000
    )

    # Exact certainty from the target's own group (overrides the estimate when the
    # maths is settled): clinched top two, or can't even reach third.
    certainty = engine.assess_group_certainty(teams, fixtures, target_team_id=target)
    if certainty == "through":
        chance_pct, decided, guaranteed = 100, True, True
    elif certainty == "eliminated":
        chance_pct, decided, guaranteed = 0, True, True
    else:
        chance_pct, decided, guaranteed = round(proj.chance * 100), proj.decided, False

    # "As it stands": if the in-progress games ended at their current score right
    # now, what would the chance be? We lock the live scores as final and project
    # from there. Only meaningful while something is live and not already decided.
    live_ids = {
        f.id for f in fixtures
        if f.status in ("live", "halfTime") and f.home_goals is not None and f.away_goals is not None
    }
    as_it_stands = None
    if live_ids and not guaranteed:
        locked = [replace(f, status="done") if f.id in live_ids else f for f in fixtures]
        # Secondary single number — fewer trials keep the live endpoint snappy.
        proj_now = projection.project(
            teams, locked, target_team_id=target, cutoff=cutoff, ratings=_RATINGS, trials=2500
        )
        as_it_stands = round(proj_now.chance * 100)

    # Group games with a score to show: completed plus any in-progress (live /
    # half-time), newest first — so the board shows what's just happened / live.
    results = [
        f for f in rows
        if f.get("stage") == "group"
        and f.get("status") in ("done", "live", "halfTime")
        and isinstance(f.get("score"), (list, tuple))
    ]
    results.sort(
        key=lambda f: (f.get("status") in ("live", "halfTime"), _kickoff_key(f)),
        reverse=True,
    )
    games_total = sum(1 for f in rows if f.get("stage") == "group")
    games_played = sum(
        1 for f in rows if f.get("stage") == "group" and f.get("status") == "done"
    )

    target_group_rows = tables.get(status.group, [])
    played_by = {row.team_id: row.played for grp in tables.values() for row in grp}

    # "Lifeline" survival view — the "we need N of the other groups to go our way"
    # framing, live and auto-resolving. Only when we've finished 3rd in our group.
    race = _build_race(teams, fixtures, status, tables, cutoff)

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
            "certainty": certainty,
        },
        "chance": {
            "percent": chance_pct,
            "decided": decided,
            "guaranteed": guaranteed,
            "trials": proj.trials,
            "asItStands": as_it_stands,
            "hasLive": bool(live_ids),
        },
        "thirdPlaceTable": [_serialise_third(s, target, played_by) for s in thirds],
        "targetGroupTable": [_serialise_group_row(s, target) for s in target_group_rows],
        "remainingGames": [
            _serialise_impact(i, status.name, chance_pct, row_by_id.get(i.fixture_id))
            for i in proj.impacts
        ],
        "results": [_serialise_result(f) for f in results],
        "gamesPlayed": games_played,
        "gamesTotal": games_total,
        "race": race,
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
