"""
FIFA World Cup 2026 Round of 32 slot template.

The 16 R32 pairings are fixed before kick-off. Group winners (1X) and runners-up
(2X) map directly; the eight best third-placed teams are assigned to the eight
third-place slots in match-number order (M74, M77, …) from each slot's candidate
group list — the same rule FIFA describes in Annex C without storing all 495 rows.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

from qualification.engine import (
    ThirdPlaceStanding,
    build_group_tables,
    get_third_placed_teams,
    rank_third_placed_teams,
)

# (match_id, home_slot, away_slot, third_slot_key or None)
# Slots: ("1"|"2", group_letter) or ("3", candidate_groups) for a third-place bucket.
R32_TEMPLATE: List[Tuple[str, Tuple[str, str], Tuple[str, str], Optional[str]]] = [
    ("r32-73", ("2", "A"), ("2", "B"), None),
    ("r32-74", ("1", "E"), ("3", "ABCDF"), "r32-74"),
    ("r32-75", ("1", "F"), ("2", "C"), None),
    ("r32-76", ("1", "C"), ("2", "F"), None),
    ("r32-77", ("1", "I"), ("3", "CDFGH"), "r32-77"),
    ("r32-78", ("2", "E"), ("2", "I"), None),
    ("r32-79", ("1", "A"), ("3", "CEFHI"), "r32-79"),
    ("r32-80", ("1", "L"), ("3", "EHIJK"), "r32-80"),
    ("r32-81", ("1", "D"), ("3", "BEFIJ"), "r32-81"),
    ("r32-82", ("1", "G"), ("3", "AEHIJ"), "r32-82"),
    ("r32-83", ("2", "K"), ("2", "L"), None),
    ("r32-84", ("1", "H"), ("2", "J"), None),
    ("r32-85", ("1", "B"), ("3", "EFGIJ"), "r32-85"),
    ("r32-86", ("1", "J"), ("2", "H"), None),
    ("r32-87", ("1", "K"), ("3", "DEIJL"), "r32-87"),
    ("r32-88", ("2", "D"), ("2", "G"), None),
]

THIRD_SLOT_ORDER: List[Tuple[str, str]] = [
    ("r32-74", "ABCDF"),
    ("r32-77", "CDFGH"),
    ("r32-79", "CEFHI"),
    ("r32-80", "EHIJK"),
    ("r32-81", "BEFIJ"),
    ("r32-82", "AEHIJ"),
    ("r32-85", "EFGIJ"),
    ("r32-87", "DEIJL"),
]


def assign_third_place_slots(
    thirds: List[ThirdPlaceStanding],
) -> Dict[str, str]:
    """Map each third-place R32 match id to the qualifying team code."""
    ranked = [t for t in thirds if t.qualifies]
    used: set[str] = set()
    out: Dict[str, str] = {}
    for match_id, candidates in THIRD_SLOT_ORDER:
        groups = set(candidates)
        eligible = [
            t for t in ranked
            if t.team_id not in used and t.group in groups
        ]
        if not eligible:
            continue
        pick = min(eligible, key=lambda t: t.rank or 999)
        out[match_id] = pick.team_id
        used.add(pick.team_id)
    return out


def _group_leaders(
    tables: Dict[str, List[Any]],
) -> Tuple[Dict[str, str], Dict[str, str]]:
    winners: Dict[str, str] = {}
    runners: Dict[str, str] = {}
    for group, rows in tables.items():
        for row in rows:
            if row.rank == 1:
                winners[group] = row.team_id
            elif row.rank == 2:
                runners[group] = row.team_id
    return winners, runners


def _resolve_slot(
    slot: Tuple[str, str],
    winners: Dict[str, str],
    runners: Dict[str, str],
    third_by_match: Dict[str, str],
    third_key: Optional[str],
) -> Optional[str]:
    pos, label = slot
    if pos == "1":
        return winners.get(label)
    if pos == "2":
        return runners.get(label)
    if pos == "3" and third_key:
        return third_by_match.get(third_key)
    return None


def build_r32_ties_from_standings(
    teams: List[Dict[str, Any]],
    fixtures: List[Dict[str, Any]],
    *,
    to_qual_team,
    to_qual_fixture,
) -> List[Dict[str, Any]]:
    """
    Build 16 projected R32 ties using the FIFA slot template.

    ``to_qual_team`` / ``to_qual_fixture`` are callables matching bracket_projection.
    """
    qual_teams = [to_qual_team(t) for t in teams]
    qual_fixtures = [to_qual_fixture(f) for f in fixtures if f.get("stage") == "group"]
    tables = build_group_tables(qual_teams, qual_fixtures, include_live=True)
    thirds = rank_third_placed_teams(get_third_placed_teams(tables), cutoff=8)
    third_by_match = assign_third_place_slots(thirds)
    winners, runners = _group_leaders(tables)

    ties: List[Dict[str, Any]] = []
    for match_id, home_slot, away_slot, third_key in R32_TEMPLATE:
        a = _resolve_slot(home_slot, winners, runners, third_by_match, third_key)
        b = _resolve_slot(away_slot, winners, runners, third_by_match, third_key)
        if not a or not b:
            continue
        ties.append({
            "id": f"proj-{match_id}",
            "a": a,
            "b": b,
            "stage": "r32",
            "status": "upcoming",
            "score": None,
            "winner": None,
            "projectedPairing": True,
        })
    return ties
