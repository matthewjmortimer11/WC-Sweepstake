"""
Knockout bracket from live group standings + feed fixtures.

R32 pairings are derived from group tables (FIFA slot rules) and merged with
partial feed data as ties publish. Later rounds come from the feed only — no
synthetic advancement and no predicted winners.
"""

from __future__ import annotations

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

_KO_STAGES = ("r32", "r16", "qf", "sf", "final", "third")
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


def _fixture_winner(f: Dict[str, Any]) -> Optional[str]:
    side = standings._winner_of(f)
    if side == "HOME":
        return f.get("a")
    if side == "AWAY":
        return f.get("b")
    return None


def _kickoff_key(f: Dict[str, Any]) -> Tuple[str, str]:
    return (str(f.get("dateISO") or ""), str(f.get("time") or ""))


def _pair_key(f: Dict[str, Any]) -> Tuple[str, str]:
    return tuple(sorted([str(f.get("a") or ""), str(f.get("b") or "")]))  # type: ignore[return-value]


def _projected_qualifiers(
    teams: List[Dict[str, Any]],
    fixtures: List[Dict[str, Any]],
) -> List[str]:
    """32 team codes projected to advance (top two per group + eight best thirds)."""
    qual_teams = [_to_qual_team(t) for t in teams]
    qual_fixtures = [_to_qual_fixture(f) for f in fixtures if f.get("stage") == "group"]
    tables = build_group_tables(qual_teams, qual_fixtures, include_live=True)
    thirds = rank_third_placed_teams(get_third_placed_teams(tables), cutoff=8)

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


def _r32_sort_key(f: Dict[str, Any]) -> Tuple[int, Tuple[str, str]]:
    fid = str(f.get("id") or "")
    slot = 9999
    if fid.startswith("proj-r32-"):
        try:
            slot = int(fid.split("proj-r32-", 1)[1])
        except ValueError:
            pass
    return slot, _kickoff_key(f)


def _feed_fills_r32_slot(slot: Dict[str, Any], feed: Dict[str, Any]) -> bool:
    fa, fb = feed.get("a"), feed.get("b")
    ta, tb = slot.get("a"), slot.get("b")
    if {fa, fb} == {ta, tb}:
        return True
    known = [c for c in (ta, tb) if c and c != "TBD"]
    if len(known) != 1:
        return False
    feed_teams = [c for c in (fa, fb) if c and c != "TBD"]
    if len(feed_teams) != 1:
        return False
    return feed_teams[0] == known[0]


def _clear_partial_r32_slots(merged: List[Dict[str, Any]], teams: List[str]) -> None:
    """Drop stale one-team TBD slots when a full feed pairing arrives."""
    team_set = set(teams)
    for i, m in enumerate(merged):
        ma, mb = m.get("a"), m.get("b")
        known = {c for c in (ma, mb) if c and c != "TBD"}
        if known & team_set and len(known) == 1:
            fid = str(m.get("id") or f"pad-r32-{i}")
            merged[i] = {
                "id": fid,
                "a": "TBD",
                "b": "TBD",
                "stage": "r32",
                "status": "upcoming",
                "score": None,
                "winner": None,
                "projectedPairing": False,
            }


def _merge_r32_feed(
    synth: List[Dict[str, Any]],
    feed: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Fill all 16 R32 slots from standings; overlay feed fixtures when published."""
    if not synth:
        return sorted(feed, key=_r32_sort_key)
    merged: List[Dict[str, Any]] = [dict(t) for t in synth]
    for f in feed:
        placed = False
        for i, t in enumerate(merged):
            if _feed_fills_r32_slot(t, f):
                out = dict(f)
                out["projectedPairing"] = False
                merged[i] = out
                placed = True
                break
        if not placed:
            fa, fb = f.get("a"), f.get("b")
            feed_teams = [c for c in (fa, fb) if c and c != "TBD"]
            if any({m.get("a"), m.get("b")} == {fa, fb} for m in merged):
                continue
            if len(feed_teams) == 2:
                _clear_partial_r32_slots(merged, feed_teams)
                out = dict(f)
                out["projectedPairing"] = False
                merged.append(out)
            else:
                dup = any(
                    c in (m.get("a"), m.get("b"))
                    for m in merged
                    for c in feed_teams
                )
                if not dup:
                    out = dict(f)
                    out["projectedPairing"] = False
                    merged.append(out)
    return sorted(merged, key=_r32_sort_key)


def _resolve_tie(f: Dict[str, Any]) -> Dict[str, Any]:
    """Return tie dict with winner only when the fixture is finished."""
    done = _norm_status(f.get("status")) == "done" or bool(f.get("done"))
    score = f.get("score")
    winner = _fixture_winner(f) if done else None
    out = dict(f)
    out["done"] = done
    out["winner"] = winner
    out["projectedWinner"] = False
    out["pens"] = bool(done and score and score[0] == score[1] and f.get("winner"))
    if out.get("projectedPairing") is None and str(out.get("id", "")).startswith("proj-"):
        out["projectedPairing"] = True
    return out


def build_projected_bracket(
    teams: List[Dict[str, Any]],
    fixtures: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Build knockout bracket from R32 standings pairings + feed fixtures.

    R32 uses FIFA slot rules merged with partial feed data. R16 onward are
    feed-only. No predicted winners — only actual results fill in winners.
    """
    qualifiers = _projected_qualifiers(teams, fixtures)
    synth_r32 = _synth_r32_ties(teams, fixtures)
    feed_r32 = [f for f in fixtures if f.get("stage") == "r32"]
    r32_merged = _merge_r32_feed(synth_r32, feed_r32)

    rounds: Dict[str, List[Dict[str, Any]]] = {}
    if r32_merged:
        rounds["r32"] = [_resolve_tie(dict(f)) for f in r32_merged]

    for stage in _KO_STAGES:
        if stage == "r32":
            continue
        feed = sorted([f for f in fixtures if f.get("stage") == stage], key=_kickoff_key)
        if feed:
            rounds[stage] = [_resolve_tie(dict(f)) for f in feed]

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
    for tie in build_projected_bracket(teams, fixtures).get("rounds", {}).get("r32", []):
        if tie.get("a") == team_code:
            opp = tie.get("b")
        elif tie.get("b") == team_code:
            opp = tie.get("a")
        else:
            continue
        if opp and opp != "TBD":
            return opp
    return None
