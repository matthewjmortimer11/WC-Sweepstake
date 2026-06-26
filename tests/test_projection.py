"""Tests for the Monte-Carlo qualification projection."""

import pytest

from qualification.engine import Fixture, Team
from qualification.projection import project


def _done(fid, g, h, a, hg, ag):
    return Fixture(id=fid, home=h, away=a, status="done", group=g, home_goals=hg, away_goals=ag)


def _up(fid, g, h, a):
    return Fixture(id=fid, home=h, away=a, status="upcoming", group=g)


def _four(g, codes):
    return [Team(id=c, name=c, group=g) for c in codes]


def _group_c_complete():
    teams = _four("C", ["BRA", "MAR", "SCO", "HAI"])
    fixtures = [
        _done("c1", "C", "BRA", "MAR", 1, 0),
        _done("c2", "C", "BRA", "SCO", 2, 0),
        _done("c3", "C", "BRA", "HAI", 3, 0),
        _done("c4", "C", "MAR", "SCO", 2, 0),
        _done("c5", "C", "MAR", "HAI", 2, 0),
        _done("c6", "C", "SCO", "HAI", 1, 0),
    ]
    return teams, fixtures


def test_decided_when_no_games_left_and_qualified():
    # Scotland win the group → no pending games → chance is exactly 100%.
    teams = _four("C", ["SCO", "BRA", "MAR", "HAI"])
    fixtures = [
        _done("c1", "C", "SCO", "BRA", 1, 0),
        _done("c2", "C", "SCO", "MAR", 1, 0),
        _done("c3", "C", "SCO", "HAI", 1, 0),
        _done("c4", "C", "BRA", "MAR", 1, 0),
        _done("c5", "C", "BRA", "HAI", 1, 0),
        _done("c6", "C", "MAR", "HAI", 1, 0),
    ]
    proj = project(teams, fixtures, "SCO")
    assert proj.decided is True
    assert proj.chance == 1.0
    assert proj.impacts == []


def test_decided_when_no_games_left_and_eliminated():
    # Scotland finish bottom of a completed group, only group → out, 0%.
    teams = _four("C", ["BRA", "MAR", "HAI", "SCO"])
    fixtures = [
        _done("c1", "C", "BRA", "MAR", 1, 0),
        _done("c2", "C", "BRA", "HAI", 1, 0),
        _done("c3", "C", "BRA", "SCO", 1, 0),
        _done("c4", "C", "MAR", "HAI", 1, 0),
        _done("c5", "C", "MAR", "SCO", 1, 0),
        _done("c6", "C", "HAI", "SCO", 1, 0),
    ]
    proj = project(teams, fixtures, "SCO")
    assert proj.decided is True
    assert proj.chance == 0.0


def test_chance_is_a_probability():
    teams, fixtures = _group_c_complete()
    # Add a rival group still to play so there's uncertainty.
    teams += _four("D", ["DW", "DX", "DY", "DB"])
    fixtures += [_up(f"d{i}", "D", *p) for i, p in enumerate(
        [("DW", "DX"), ("DY", "DB"), ("DW", "DY"), ("DX", "DB"), ("DW", "DB"), ("DX", "DY")]
    )]
    proj = project(teams, fixtures, "SCO", cutoff=1, trials=2000)
    assert 0.0 <= proj.chance <= 1.0
    assert not proj.decided
    assert len(proj.impacts) == 6


def test_decisive_game_shows_full_swing_and_right_direction():
    """A single decider where Scotland need DY not to win: chance is high if DY
    fail to win and ~0 if they win."""
    teams, fixtures = _group_c_complete()           # SCO third, 3 pts
    teams += _four("D", ["DW", "DX", "DY", "DB"])
    fixtures += [
        _done("d1", "D", "DW", "DX", 0, 0),
        _done("d2", "D", "DX", "DB", 3, 0),
        _done("d3", "D", "DW", "DB", 3, 0),
        _done("d4", "D", "DX", "DY", 2, 0),
        _done("d5", "D", "DY", "DB", 1, 1),         # DY 1 pt
        _up("d6", "D", "DY", "DW"),                 # DY win bumps Scotland (cutoff 1)
    ]
    proj = project(teams, fixtures, "SCO", cutoff=1, trials=4000)
    impact = next(i for i in proj.impacts if i.fixture_id == "d6")
    assert impact.matters
    # DY are home: a home win is bad for Scotland, draw/away win are good.
    assert impact.chance_if_home_win < 0.05
    assert impact.chance_if_draw > 0.9
    assert impact.chance_if_away_win > 0.9
    assert impact.favoured_outcome in ("draw", "away")
    assert impact.swing > 0.8


def test_irrelevant_game_has_negligible_swing():
    """Scotland already group winners; a far-off group's game can't change a
    thing → ~zero swing, flagged as not mattering."""
    teams = _four("C", ["SCO", "BRA", "MAR", "HAI"])
    fixtures = [
        _done("c1", "C", "SCO", "BRA", 5, 0),
        _done("c2", "C", "SCO", "MAR", 5, 0),
        _done("c3", "C", "SCO", "HAI", 5, 0),       # SCO 9 pts, +15 — uncatchable
        _done("c4", "C", "BRA", "MAR", 1, 0),
        _done("c5", "C", "BRA", "HAI", 1, 0),
        _up("c6", "C", "MAR", "HAI"),               # dead rubber for Scotland
    ]
    proj = project(teams, fixtures, "SCO", trials=2000)
    impact = next(i for i in proj.impacts if i.fixture_id == "c6")
    assert impact.swing < 0.02
    assert impact.matters is False
    assert proj.chance == pytest.approx(1.0)


def test_seed_makes_it_deterministic():
    teams, fixtures = _group_c_complete()
    teams += _four("D", ["DW", "DX", "DY", "DB"])
    fixtures += [_up("d6", "D", "DY", "DW")]
    a = project(teams, fixtures, "SCO", cutoff=1, trials=1000, seed=42)
    b = project(teams, fixtures, "SCO", cutoff=1, trials=1000, seed=42)
    assert a.chance == b.chance


def test_unknown_target_raises():
    teams, fixtures = _group_c_complete()
    with pytest.raises(ValueError):
        project(teams, fixtures, "NOPE")


def test_ratings_favour_the_stronger_team():
    """With strength ratings, the stronger team in a group has a higher chance
    than a weaker one; with no ratings the model is symmetric."""
    teams = _four("C", ["STRONG", "MID", "WEAK", "MINNOW"])
    # All to play — a full round-robin still to come.
    fixtures = [
        _up("c1", "C", "STRONG", "MID"),
        _up("c2", "C", "WEAK", "MINNOW"),
        _up("c3", "C", "STRONG", "WEAK"),
        _up("c4", "C", "MID", "MINNOW"),
        _up("c5", "C", "STRONG", "MINNOW"),
        _up("c6", "C", "MID", "WEAK"),
    ]
    ratings = {"STRONG": 1.5, "MID": 0.3, "WEAK": -0.6, "MINNOW": -1.4}
    strong = project(teams, fixtures, "STRONG", cutoff=2, trials=3000, ratings=ratings).chance
    minnow = project(teams, fixtures, "MINNOW", cutoff=2, trials=3000, ratings=ratings).chance
    assert strong > minnow + 0.2          # clearly separated by strength

    # Same fixtures, no ratings → roughly symmetric (within Monte-Carlo noise).
    s2 = project(teams, fixtures, "STRONG", cutoff=2, trials=3000).chance
    m2 = project(teams, fixtures, "MINNOW", cutoff=2, trials=3000).chance
    assert abs(s2 - m2) < 0.08


def test_live_scores_feed_projection_base_table():
    """Live scores must count in the headline % — not be re-sampled as if unplayed."""
    teams_c, fixtures_c = _group_c_complete()   # SCO third, 3 pts
    teams_d = _four("D", ["DW", "DX", "DY", "DB"])
    base_d = [
        _done("d1", "D", "DW", "DX", 0, 0),
        _done("d2", "D", "DX", "DB", 3, 0),
        _done("d3", "D", "DW", "DB", 3, 0),
        _done("d4", "D", "DX", "DY", 3, 0),
        _done("d5", "D", "DB", "DY", 2, 0),
    ]
    teams = teams_c + teams_d

    def _live(hg, ag):
        return base_d + [
            Fixture(id="d6", home="DY", away="DW", status="live", group="D",
                    home_goals=hg, away_goals=ag, stage="group"),
        ]

    in_live = project(teams, fixtures_c + _live(0, 0), "SCO", cutoff=1, trials=4000, seed=11)
    out_live = project(teams, fixtures_c + _live(2, 0), "SCO", cutoff=1, trials=4000, seed=11)
    assert in_live.chance > out_live.chance + 0.5
    assert any(i.fixture_id == "d6" for i in in_live.impacts)


def test_provisional_third_place_badges_not_all_in():
    from qualification.router import _serialise_third
    from qualification.engine import ThirdPlaceStanding

    thirds = [
        ThirdPlaceStanding("AAA", "A", 3, 1, 4, rank=1, qualifies=True),
        ThirdPlaceStanding("BBB", "B", 3, 0, 3, rank=2, qualifies=True),
        ThirdPlaceStanding("CCC", "C", 3, -1, 2, rank=3, qualifies=True),
    ]
    rows = [_serialise_third(s, "CCC", {}, provisional=True) for s in thirds]
    assert all(not r["qualifies"] for r in rows)
    rows_final = [_serialise_third(s, "CCC", {}, provisional=False) for s in thirds]
    assert rows_final[0]["qualifies"] is True
    assert rows_final[2]["qualifies"] is True


def test_american_odds_conversion():
    from qualification.router import _american_to_prob
    assert _american_to_prob("+100") == pytest.approx(0.5)
    assert _american_to_prob("-200") == pytest.approx(200 / 300)
    assert _american_to_prob("+900") == pytest.approx(0.1)
    assert _american_to_prob("") is None
    assert _american_to_prob(None) is None
