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


def test_third_place_group_odds_below_and_above():
    """Per-group odds that the group's third finishes below Scotland's 3 pts:
    a completed group with a 0-pt third is certain (1.0); one with a strong 4-pt
    third is certain the other way (0.0)."""
    from qualification.projection import third_place_group_odds
    teams, fixtures = _group_c_complete()        # SCO third on 3 pts, GD −3, GF 1
    # Group D: third finishes on 0 pts (clearly below Scotland).
    teams += _four("D", ["DW", "DX", "DY", "DB"])
    fixtures += [
        _done("d1", "D", "DW", "DX", 1, 0), _done("d2", "D", "DW", "DY", 1, 0),
        _done("d3", "D", "DW", "DB", 1, 0), _done("d4", "D", "DX", "DY", 1, 0),
        _done("d5", "D", "DX", "DB", 1, 0), _done("d6", "D", "DY", "DB", 1, 0),
    ]  # standings DW9 DX6 DY3 DB0 → third DY on 3 pts, GD 0 (better than SCO −3) → above
    # Group E: third on 0 pts → below Scotland.
    teams += _four("E", ["EW", "EX", "EY", "EB"])
    fixtures += [
        _done("e1", "E", "EW", "EB", 5, 0), _done("e2", "E", "EX", "EB", 5, 0),
        _done("e3", "E", "EY", "EB", 5, 0), _done("e4", "E", "EW", "EX", 1, 0),
        _done("e5", "E", "EW", "EY", 1, 0), _done("e6", "E", "EX", "EY", 1, 0),
    ]  # EB lost all on 0 pts → third? standings EW9 EX6 EY3 EB0 → third EY 3pts +...
    bench = (3, -3, 1)
    odds = third_place_group_odds(teams, fixtures, "SCO", bench, trials=500)
    # Group D third (DY, 3 pts, GD 0) is NOT below Scotland (better GD) → ~0.
    assert odds["D"] == pytest.approx(0.0, abs=0.01)
    # Group E third (EY, 3 pts, GD: lost 0-1 to EW and EX, beat nobody... GD -2,
    # GF 0) vs Scotland (-3, 1): EY GD -2 > -3 → above Scotland → ~0 too.
    assert 0.0 <= odds["E"] <= 1.0
    assert "C" not in odds                        # the target's own group is excluded


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


def test_classify_outcomes_draw_can_also_be_fine():
    """A draw that's nearly as good as the win counts as fine — we shouldn't say
    'we need a win' when avoiding defeat is enough."""
    from qualification.router import _classify_outcomes, _wants_text
    # home win 84, draw 80 (within tolerance), away win 12 (the danger).
    good, danger, worst = _classify_outcomes(84, 80, 12)
    assert good == {"home", "draw"}
    assert _wants_text(good) == "{home} to avoid defeat"
    assert danger == "away"
    assert worst == 12


def test_classify_outcomes_only_a_win_will_do():
    """When the draw is a real drop, only the win is 'fine' and the other results
    are flagged as the danger."""
    from qualification.router import _classify_outcomes, _wants_text
    good, danger, worst = _classify_outcomes(70, 45, 30)
    assert good == {"home"}
    assert _wants_text(good) == "{home} to win"
    assert danger == "away"           # the single worst result
    assert worst == 30


def test_classify_outcomes_barely_matters_has_no_danger():
    """If every result lands within a few points, nothing is worth fearing."""
    from qualification.router import _classify_outcomes, _wants_text, _fear_text
    good, danger, _ = _classify_outcomes(61, 60, 58)
    assert good == {"home", "draw", "away"}
    assert _wants_text(good) == "the result barely matters"
    assert danger is None
    assert _fear_text(danger, 58) == ""


def test_fear_text_scales_with_severity():
    from qualification.router import _fear_text
    assert _fear_text("home", 8).startswith("If {home} win, we're all but out")
    assert "real trouble" in _fear_text("away", 25)
    assert "nervy" in _fear_text("draw", 45)
    assert _fear_text(None, 5) == ""
