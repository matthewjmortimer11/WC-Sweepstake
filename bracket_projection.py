"""
Projected knockout bracket from live group standings.

Uses qualification.engine for group tables and best-third ranking, then simulates
knockout rounds: finished ties use actual results; upcoming ties advance the
pre-tournament odds favourite. When the feed publishes real KO pairings, those
pairings are used for structure.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

import standings
from bracket_slots import build_r32_ties_from_standings
from qualification.engine import (
    Fixture,
    Team,
    build_group_tables,
    get_third_placed_teams,
    rank_third_placed_teams,
)

_DONE = frozenset({"done", "ft", "fulltime", "full_time", "full-time", "finished"})
_LIVE = frozenset({"live", "halftime", "half_time", "half-time", "ht", "paused", "1h", "2h"})


def _norm_status(raw: Any) -> str:
    st = str(raw or "upcoming").strip().lower()
    if st in _DONE:
        return "done"
    if st in _LIVE:
        return "live"
    return st


def _to_qual_team(t: Dict[str, Any]) -> Team:
    return Team(id=t["code"], name=t.get("name") or t["code"], group=t.get("group") or "?")


def _to_qual_fixture(f: Dict[str, Any]) -> Fixture:
    st = _norm_status(f.get("status"))
    if st == "live":
        qst: str = "live"
    elif st == "done":
        qst = "done"
    else:
        qst = "upcoming"
    score = f.get("score")
    hg = ag = None
    if isinstance(score, (list, tuple)) and len(score) == 2:
        hg, ag = score[0], score[1]
    return Fixture(
        id=str(f.get("id") or ""),
        home=f["a"],
        away=f["b"],
        status=qst,  # type: ignore[arg-type]
        group=f.get("group"),
        home_goals=hg,
        away_goals=ag,
        stage=str(f.get("stage") or "group"),
    )


def _odds_rank(t: Dict[str, Any]) -> int:
    raw = str(t.get("odds") or "")
    m = re.search(r"\d+", raw)
    return int(m.group()) if m else 999_999


def _pick_favourite(a: str, b: str, by_code: Dict[str, Dict[str, Any]]) -> str:
    ta, tb = by_code.get(a), by_code.get(b)
    if not ta:
        return b
    if not tb:
        return a
    return a if _odds_rank(ta) <= _odds_rank(tb) else b


def _fixture_winner(f: Dict[str, Any]) -> Optional[str]:
    side = standings._winner_of(f)
    if side == "HOME":
        return f.get("a")
    if side == "AWAY":
        return f.get("b")
    return None


def _kickoff_key(f: Dict[str, Any]) -> Tuple[str, str]:
    return (str(f.get("dateISO") or ""), str(f.get("time") or ""))


def _projected_qualifiers(
    teams: List[Dict[str, Any]],
    fixtures: List[Dict[str, Any]],
) -> List[str]:
    """32 team codes projected to advance (top two per group + eight best thirds)."""
    qual_teams = [_to_qual_team(t) for t in teams]
    qual_fixtures = [_to_qual_fixture(f) for f in fixtures if f.get("stage") == "group"]
    tables = build_group_tables(qual_teams, qual_fixtures, include_live=True)
    thirds = rank_third_placed_teams(get_third_placed_teams(tables), cutoff=8)
    qualifying_thirds = {t.team_id for t in thirds if t.qualifies}

    ordered: List[str] = []
    for group in sorted(tables.keys()):
        rows = tables[group]
        first = next((r for r in rows if r.rank == 1), None)
        second = next((r for r in rows if r.rank == 2), None)
        if first:
            ordered.append(first.team_id)
        if second:
            ordered.append(second.team_id)
    for t in thirds:
        if t.qualifies:
            ordered.append(t.team_id)

    seen = set()
    out: List[str] = []
    for code in ordered:
        if code not in seen:
            seen.add(code)
            out.append(code)
    for t in teams:
        if len(out) >= 32:
            break
        if t["code"] not in seen:
            seen.add(t["code"])
            out.append(t["code"])
    return out[:32]


def _synth_r32_ties(
    teams: List[Dict[str, Any]],
    fixtures: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    ties = build_r32_ties_from_standings(
        teams, fixtures,
        to_qual_team=_to_qual_team,
        to_qual_fixture=_to_qual_fixture,
    )
    if ties:
        return ties
    # Fallback if group tables aren't ready yet.
    qualifiers = _projected_qualifiers(teams, fixtures)
    legacy: List[Dict[str, Any]] = []
    for i in range(0, min(len(qualifiers), 32), 2):
        if i + 1 >= len(qualifiers):
            break
        legacy.append({
            "id": f"proj-r32-{i // 2}",
            "a": qualifiers[i],
            "b": qualifiers[i + 1],
            "stage": "r32",
            "status": "upcoming",
            "score": None,
            "winner": None,
            "projectedPairing": True,
        })
    return legacy


def _resolve_tie(
    f: Dict[str, Any],
    by_code: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    """Return tie dict with winner filled (actual or projected)."""
    a, b = f.get("a"), f.get("b")
    done = _norm_status(f.get("status")) == "done"
    score = f.get("score")
    winner = _fixture_winner(f) if done else None
    projected_win = False
    if not winner and a and b:
        winner = _pick_favourite(a, b, by_code)
        projected_win = True
    out = dict(f)
    out["done"] = done
    out["winner"] = winner
    out["projectedWinner"] = projected_win and not done
    out["pens"] = bool(done and score and score[0] == score[1] and f.get("winner"))
    return out


def build_projected_bracket(
    teams: List[Dict[str, Any]],
    fixtures: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Predict Round of 32 pairings and winners from current group standings.

    Pairings use FIFA slot rules (or feed R32 fixtures when published).
    Unfinished ties get a predicted winner (pre-tournament odds favourite).
    Later knockout rounds are intentionally omitted — this is a prediction,
    not a projected path to the final.

    Returns {"rounds": {"r32": [tie, ...]}, "qualifierCount": int}.
    """
    by_code = {t["code"]: t for t in teams}
    qualifiers = _projected_qualifiers(teams, fixtures)
    feed_r32 = sorted(
        [f for f in fixtures if f.get("stage") == "r32"],
        key=_kickoff_key,
    )
    feed = feed_r32 if feed_r32 else _synth_r32_ties(teams, fixtures)
    rounds: Dict[str, List[Dict[str, Any]]] = {}
    if feed:
        rounds["r32"] = [_resolve_tie(dict(f), by_code) for f in feed]

    return {
        "rounds": rounds,
        "qualifierCount": len(qualifiers),
        "source": "standings",
    }


def projected_r32_opponent(
    team_code: str,
    teams: List[Dict[str, Any]],
    fixtures: List[Dict[str, Any]],
) -> Optional[str]:
    """Projected Round of 32 opponent from current group standings."""
    for tie in _synth_r32_ties(teams, fixtures):
        if tie.get("a") == team_code:
            return tie.get("b")
        if tie.get("b") == team_code:
            return tie.get("a")
    return None
