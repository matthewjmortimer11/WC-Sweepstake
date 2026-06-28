"""Tests for knockout bracket from group standings + feed."""

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


def test_projected_bracket_synthesises_r32_without_winner_pick():
    teams, fixtures = _four_group("A", ["A1", "A2", "A3", "A4"])
    proj = build_projected_bracket(teams, fixtures)
    assert "r32" in proj["rounds"]
    assert len(proj["rounds"]["r32"]) == 16
    resolved = [t for t in proj["rounds"]["r32"] if t["a"] != "TBD" or t["b"] != "TBD"]
    assert resolved
    assert resolved[0]["winner"] is None
    assert not resolved[0]["projectedWinner"]


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
    tie = next(t for t in proj["rounds"]["r32"] if t["a"] == "AAA" and t["b"] == "BBB")
    assert tie["winner"] == "AAA"
    assert tie["done"] is True
    assert not tie["projectedWinner"]


def test_projected_bracket_includes_later_rounds_from_feed_only():
    teams = [_team("W1", "A"), _team("W2", "B")]
    fixtures = [
        {
            "id": "sf1", "a": "W1", "b": "W2", "stage": "sf", "status": "upcoming",
            "score": None, "dateISO": "2026-07-10", "time": "20:00",
        },
    ]
    proj = build_projected_bracket(teams, fixtures)
    assert "sf" in proj["rounds"]
    assert proj["rounds"]["sf"][0]["winner"] is None
    assert "final" not in proj["rounds"]


def test_partial_r32_feed_merged_with_standings():
    teams, fixtures = _four_group("A", ["A1", "A2", "A3", "A4"])
    teams_b, fixtures_b = _four_group("B", ["B1", "B2", "B3", "B4"])
    teams = teams + teams_b
    fixtures = fixtures + fixtures_b
    fixtures.append({
        "id": "feed-r32-0", "a": "A2", "b": "B2", "stage": "r32",
        "status": "upcoming", "score": None,
        "dateISO": "2026-06-28", "time": "16:00",
    })
    proj = build_projected_bracket(teams, fixtures)
    r32 = proj["rounds"]["r32"]
    feed_tie = next(t for t in r32 if t["a"] == "A2" and t["b"] == "B2")
    assert feed_tie["id"] == "feed-r32-0"
    assert feed_tie["winner"] is None


def test_done_flag_without_status_sets_winner():
    teams = [_team("AAA", "A", "+100"), _team("BBB", "B", "+500")]
    fixtures = [
        {
            "id": "ko1", "a": "AAA", "b": "BBB", "stage": "r32",
            "done": True, "score": [2, 1], "winner": "HOME",
            "dateISO": "2026-07-01", "time": "20:00",
        },
    ]
    proj = build_projected_bracket(teams, fixtures)
    tie = next(t for t in proj["rounds"]["r32"] if t["id"] == "ko1")
    assert tie["done"] is True
    assert tie["winner"] == "AAA"


def test_r32_feed_home_away_swap_merges():
    teams, fixtures = _four_group("A", ["A1", "A2", "A3", "A4"])
    teams_b, fixtures_b = _four_group("B", ["B1", "B2", "B3", "B4"])
    teams = teams + teams_b
    fixtures = fixtures + fixtures_b
    fixtures.append({
        "id": "feed-r32-0", "a": "B2", "b": "A2", "stage": "r32",
        "status": "upcoming", "score": None,
        "dateISO": "2026-06-28", "time": "16:00",
    })
    proj = build_projected_bracket(teams, fixtures)
    feed_tie = next(
        t for t in proj["rounds"]["r32"]
        if {t["a"], t["b"]} == {"A2", "B2"}
    )
    assert feed_tie["id"] == "feed-r32-0"
    assert feed_tie.get("projectedPairing") is not True


def test_projected_r32_opponent_skips_tbd():
    from bracket_projection import projected_r32_opponent

    teams, fixtures = _four_group("A", ["A1", "A2", "A3", "A4"])
    opp = projected_r32_opponent("A2", teams, fixtures)
    assert opp != "TBD"


def test_live_r32_has_no_projected_winner():
    teams = [_team("AAA", "A", "+100"), _team("BBB", "B", "+500")]
    fixtures = [
        {
            "id": "ko1", "a": "AAA", "b": "BBB", "stage": "r32",
            "status": "live", "score": [1, 0],
            "dateISO": "2026-07-01", "time": "20:00",
        },
    ]
    proj = build_projected_bracket(teams, fixtures)
    tie = next(t for t in proj["rounds"]["r32"] if t["id"] == "ko1")
    assert tie["winner"] is None
    assert not tie["projectedWinner"]


def test_partial_r32_feed_keeps_sixteen_slots():
    """Partial one-team R32 feed rows must not inflate the bracket past 16 ties."""
    teams, fixtures = _four_group("A", ["A1", "A2", "A3", "A4"])
    teams_b, fixtures_b = _four_group("B", ["B1", "B2", "B3", "B4"])
    teams = teams + teams_b
    fixtures = fixtures + fixtures_b
    fixtures.append({
        "id": "feed-r32-partial", "a": "A2", "b": "TBD", "stage": "r32",
        "status": "upcoming", "score": None,
        "dateISO": "2026-06-28", "time": "16:00",
    })
    proj = build_projected_bracket(teams, fixtures)
    assert len(proj["rounds"]["r32"]) == 16
    partial = next(t for t in proj["rounds"]["r32"] if t.get("id") == "feed-r32-partial" or t.get("a") == "A2")
    assert partial["a"] == "A2"


def test_full_r32_feed_keeps_sixteen_slots():
    """Feed-only ties must not inflate R32 beyond 16 when teams sat in separate projected slots."""
    teams = [_team("AAA", "A", "+100"), _team("BBB", "B", "+500")]
    fixtures = [
        {
            "id": "ko1", "a": "AAA", "b": "BBB", "stage": "r32",
            "status": "done", "score": [2, 1], "winner": "HOME",
            "dateISO": "2026-07-01", "time": "20:00",
        },
    ]
    proj = build_projected_bracket(teams, fixtures)
    assert len(proj["rounds"]["r32"]) == 16
    tie = next(t for t in proj["rounds"]["r32"] if t["a"] == "AAA" and t["b"] == "BBB")
    assert tie["winner"] == "AAA"
