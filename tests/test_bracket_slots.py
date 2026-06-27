"""Tests for FIFA R32 slot mapping."""

from bracket_projection import build_projected_bracket
from bracket_slots import R32_TEMPLATE, assign_third_place_slots
from qualification.engine import ThirdPlaceStanding


def _team(code, group="A", odds="+1000"):
    return {"code": code, "name": code, "group": group, "alive": True, "stage": "group", "rounds": 0, "odds": odds}


def _gf(a, b, group="A", md=1, score=None, status="done"):
    return {
        "id": f"{a}-{b}-{group}-{md}",
        "a": a, "b": b, "stage": "group", "group": group, "matchday": md,
        "status": status, "score": score, "dateISO": "2026-06-11", "time": "16:00",
    }


def _four_group(g, codes):
    teams = [_team(c, g, odds=f"+{1000 + i * 100}") for i, c in enumerate(codes)]
    a, b, c, d = codes
    fixtures = [
        _gf(a, b, g, 1, [2, 0]),
        _gf(a, c, g, 2, [2, 0]),
        _gf(a, d, g, 3, [2, 0]),
        _gf(b, c, g, 1, [1, 0]),
        _gf(b, d, g, 2, [1, 0]),
        _gf(c, d, g, 3, [1, 0]),
    ]
    return teams, fixtures


def test_r32_template_has_sixteen_matches():
    assert len(R32_TEMPLATE) == 16


def test_r32_emits_sixteen_template_rows():
    from bracket_slots import build_r32_ties_from_standings
    from bracket_projection import _to_qual_fixture, _to_qual_team

    teams, fixtures = _four_group("A", ["A1", "A2", "A3", "A4"])
    ties = build_r32_ties_from_standings(
        teams, fixtures, to_qual_team=_to_qual_team, to_qual_fixture=_to_qual_fixture,
    )
    assert len(ties) == 16


def test_projected_r32_uses_2a_vs_2b():
    teams_a, fix_a = _four_group("A", ["A1", "A2", "A3", "A4"])
    teams_b, fix_b = _four_group("B", ["B1", "B2", "B3", "B4"])
    teams = teams_a + teams_b
    fixtures = fix_a + fix_b
    proj = build_projected_bracket(teams, fixtures)
    r32 = proj["rounds"]["r32"]
    assert len(r32) == 16
    match_73 = next(t for t in r32 if t["a"] == "A2" and t["b"] == "B2")
    assert match_73["a"] == "A2"
    assert match_73["b"] == "B2"


def test_third_place_assigned_in_match_order():
    thirds = [
        ThirdPlaceStanding("T3C", "C", 3, 0, 2, rank=1, qualifies=True),
        ThirdPlaceStanding("T3A", "A", 3, -1, 1, rank=2, qualifies=True),
        ThirdPlaceStanding("T3X", "X", 3, -2, 0, rank=9, qualifies=False),
    ]
    assigned = assign_third_place_slots(thirds)
    # M74 candidates ABCDF — best eligible is 3C (rank 1)
    assert assigned["r32-74"] == "T3C"


def test_group_winner_faces_assigned_third():
    teams_e, fix_e = _four_group("E", ["E1", "E2", "E3", "E4"])
    teams_a, fix_a = _four_group("A", ["A1", "A2", "A3", "A4"])
    teams = teams_e + teams_a
    fixtures = fix_e + fix_a
    proj = build_projected_bracket(teams, fixtures)
    r32 = proj["rounds"]["r32"]
    m74 = next((t for t in r32 if t["a"] == "E1"), None)
    assert m74 is not None
    assert m74["b"] in ("A3",)  # third from A in this mini tournament
