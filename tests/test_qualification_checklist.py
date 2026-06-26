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
    assert all(item["outcome"] == "pending" for item in cl["items"])
