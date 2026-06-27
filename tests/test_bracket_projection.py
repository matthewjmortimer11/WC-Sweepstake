"""Tests for projected knockout bracket from group standings."""

from bracket_projection import build_projected_bracket


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


def test_projected_bracket_synthesises_r32_from_standings():
    teams, fixtures = _four_group("A", ["A1", "A2", "A3", "A4"])
    proj = build_projected_bracket(teams, fixtures)
    assert "r32" in proj["rounds"]
    assert len(proj["rounds"]["r32"]) >= 1
    first = proj["rounds"]["r32"][0]
    assert first["winner"] in (first["a"], first["b"])


def test_projected_bracket_uses_finished_r32_result():
    teams = [_team("AAA", "A", "+100"), _team("BBB", "B", "+500")]
    fixtures = [
        {
            "id": "ko1", "a": "AAA", "b": "BBB", "stage": "r32", "group": None,
            "status": "done", "score": [2, 1], "winner": "HOME",
            "dateISO": "2026-07-01", "time": "20:00",
        },
    ]
    proj = build_projected_bracket(teams, fixtures)
    assert proj["rounds"]["r32"][0]["winner"] == "AAA"
    assert proj["rounds"]["r32"][0]["done"] is True
    assert not proj["rounds"]["r32"][0]["projectedWinner"]


def test_projected_bracket_r32_only_no_later_rounds():
    teams = [
        _team("W1", "A", "+100"), _team("L1", "A", "+900"),
        _team("W2", "B", "+100"), _team("L2", "B", "+900"),
    ]
    fixtures = [
        {"id": "sf1", "a": "W1", "b": "W2", "stage": "sf", "status": "upcoming",
         "score": None, "dateISO": "2026-07-10", "time": "20:00"},
    ]
    proj = build_projected_bracket(teams, fixtures)
    assert "r32" in proj["rounds"]
    assert "final" not in proj["rounds"]
    assert "r16" not in proj["rounds"]
