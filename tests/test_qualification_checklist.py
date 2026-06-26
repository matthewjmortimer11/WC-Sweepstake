"""Tests for the Sky-style qualification checklist."""

from qualification import engine
from qualification.router import (
    _band_to_sky_line,
    _build_checklist,
    _wants_to_sky_line,
)
from qualification.engine import Band


def test_wants_to_sky_line_win_and_avoid_defeat():
    assert _wants_to_sky_line("Egypt to win", "Egypt", "Iran") == "Iran lose to Egypt"
    assert _wants_to_sky_line("Spain to win", "Uruguay", "Spain") == "Uruguay lose to Spain"
    assert _wants_to_sky_line("Iraq to avoid defeat", "Senegal", "Iraq") == "Senegal fail to beat Iraq"
    assert _wants_to_sky_line("Uzbekistan to avoid defeat", "DR Congo", "Uzbekistan") == (
        "DR Congo fail to beat Uzbekistan"
    )


def test_band_to_sky_line_win_by():
    band = Band(kind="win_by", k=2, goal_dependent=False)
    assert _band_to_sky_line(band, "Austria", "Algeria") == "Austria beat Algeria by 2+ goals"


def test_band_to_sky_line_interval():
    band = engine.Band(kind="interval", lo=-2, hi=0, goal_dependent=False)
    assert _band_to_sky_line(band, "Senegal", "Iraq") == "Senegal fail to beat Iraq"


def test_win_would_exceed_bench():
    from qualification.router import _win_would_exceed_bench

    bench = (3, -3, 1)
    assert _win_would_exceed_bench(2, 0, 1, bench) is True
    assert _win_would_exceed_bench(0, -4, 1, bench) is False


def test_build_checklist_own_group_mode():
    from qualification.router import _engine_teams, _base_fixtures, _engine_fixtures, _CUTOFF
    from qualification import projection

    teams = _engine_teams()
    fixtures = _engine_fixtures(_base_fixtures())
    status = engine.get_target_team_status(teams, fixtures, "SCO", _CUTOFF)
    proj = projection.project(teams, fixtures, "SCO", _CUTOFF, trials=500)
    cl = _build_checklist(teams, fixtures, "SCO", "Scotland", _CUTOFF, status, None, proj.impacts)
    assert cl is not None
    assert cl["mode"] == "own_group"
    assert cl["items"]
    assert cl["pendingItems"] == cl["items"]
    assert cl["settledSummary"] is None
    assert all(item["outcome"] == "pending" for item in cl["items"])


def test_build_checklist_splits_pending_and_settled():
    from qualification.router import _build_checklist

    race = {
        "applicable": True,
        "benchmark": {"points": 3, "goalDifference": -3, "goalsFor": 1},
        "needTotal": 4,
        "needMore": 2,
        "banked": 2,
        "groups": [
            {"group": "A", "outcome": "banked", "third": {"name": "Wales", "points": 2}},
            {"group": "B", "outcome": "pending", "third": {"name": "France", "points": 3}, "probGood": 55},
            {"group": "C", "outcome": "lost", "third": {"name": "Spain", "points": 6}},
        ],
    }
    cl = _build_checklist([], [], "SCO", "Scotland", 8, None, race, [])
    assert cl["mode"] == "best_thirds"
    assert len(cl["pendingItems"]) == 1
    assert cl["pendingItems"][0]["group"] == "B"
    assert cl["settledSummary"]["bankedCount"] == 1
    assert cl["settledSummary"]["lostCount"] == 1
    assert "context" not in cl
