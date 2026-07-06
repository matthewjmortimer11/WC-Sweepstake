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
    """Map each third-place R32 match id to the qualifying team code.

    Each slot accepts thirds only from a fixed set of candidate groups, so this
    is a bipartite assignment, not a per-slot pick: a naive greedy ("give each
    slot its best eligible team") can strand a third whose group fits only one
    already-taken slot, leaving that team out of the bracket even though a full
    assignment exists. We use maximum bipartite matching (Kuhn's algorithm),
    which the FIFA slot template guarantees can place all eight qualified thirds.
    Thirds are considered best-rank-first so the matching is deterministic and
    tends to seat higher-ranked teams in the earlier slots.
    """
    ranked = sorted(
        (t for t in thirds if t.qualifies),
        key=lambda t: (t.rank if t.rank is not None else 999, t.team_id),
    )
    slot_order = [match_id for match_id, _ in THIRD_SLOT_ORDER]
    slot_groups: Dict[str, set] = {mid: set(c) for mid, c in THIRD_SLOT_ORDER}
    group_of: Dict[str, str] = {t.team_id: t.group for t in ranked}
    third_of_slot: Dict[str, str] = {}   # match_id -> team_id
    slot_of_third: Dict[str, str] = {}   # team_id -> match_id

    # Greedy first: give each slot (in match order) its best-ranked eligible third.
    # This seats stronger teams in the earlier slots, matching FIFA's ordering.
    used: set = set()
    for match_id in slot_order:
        pick = next(
            (t for t in ranked if t.team_id not in used and t.group in slot_groups[match_id]),
            None,
        )
        if pick is not None:
            third_of_slot[match_id] = pick.team_id
            slot_of_third[pick.team_id] = match_id
            used.add(pick.team_id)

    # Greedy can strand a third whose group fits only an already-taken slot. Place
    # any such team with an augmenting path — reshuffling minimally so all eight are
    # seated, without disturbing the greedy ordering elsewhere.
    def _augment(team_id: str, seen: set) -> bool:
        for match_id in slot_order:
            if match_id in seen or group_of[team_id] not in slot_groups[match_id]:
                continue
            seen.add(match_id)
            holder = third_of_slot.get(match_id)
            if holder is None or _augment(holder, seen):
                third_of_slot[match_id] = team_id
                slot_of_third[team_id] = match_id
                return True
        return False

    for t in ranked:
        if t.team_id not in slot_of_third:
            _augment(t.team_id, set())
    return third_of_slot


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
        a = _resolve_slot(home_slot, winners, runners, third_by_match, third_key) or "TBD"
        b = _resolve_slot(away_slot, winners, runners, third_by_match, third_key) or "TBD"
        ties.append({
            "id": f"proj-{match_id}",
            "a": a,
            "b": b,
            "stage": "r32",
            "status": "upcoming",
            "score": None,
            "winner": None,
            "projectedPairing": a != "TBD" or b != "TBD",
        })
    return ties
