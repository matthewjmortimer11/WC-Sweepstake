"""Contract tests for the Football-Data.org adapter (recorded payloads, no live API)."""

from adapters.football_data_org import _match_to_canonical, _normalise_tla


def _sample_match(**overrides):
    base = {
        "id": 9001,
        "stage": "GROUP_STAGE",
        "status": "FINISHED",
        "group": "GROUP_C",
        "matchday": 1,
        "utcDate": "2026-06-15T19:00:00Z",
        "venue": "Test Stadium",
        "homeTeam": {"tla": "SCO"},
        "awayTeam": {"tla": "BRA"},
        "score": {
            "winner": "AWAY_TEAM",
            "duration": "REGULAR",
            "fullTime": {"home": 0, "away": 2},
        },
    }
    base.update(overrides)
    return base


def test_group_stage_mapping():
    cf = _match_to_canonical(_sample_match(), "world-cup-2026")
    assert cf is not None
    assert cf.stage == "group"
    assert cf.group_name == "C"
    assert cf.home_team == "SCO"
    assert cf.away_team == "BRA"
    assert cf.status == "done"
    assert cf.winner == "AWAY"
    assert cf.home_goals == 0
    assert cf.away_goals == 2


def test_r32_mapping():
    cf = _match_to_canonical(
        _sample_match(stage="ROUND_OF_32", group=None, matchday=None),
        "world-cup-2026",
    )
    assert cf.stage == "r32"
    assert cf.group_name is None


def test_third_place_not_final():
    cf = _match_to_canonical(_sample_match(stage="THIRD_PLACE", group=None), "world-cup-2026")
    assert cf.stage == "third"


def test_penalty_shootout_winner():
    cf = _match_to_canonical(
        _sample_match(
            stage="ROUND_OF_16",
            group=None,
            score={
                "winner": "HOME_TEAM",
                "duration": "PENALTY_SHOOTOUT",
                "fullTime": {"home": 1, "away": 1},
            },
        ),
        "world-cup-2026",
    )
    assert cf.stage == "r16"
    assert cf.winner == "HOME"
    assert cf.after_extra_time is True
    assert cf.home_goals == 1 and cf.away_goals == 1


def test_tla_override_saudi():
    assert _normalise_tla("SAU") == "KSA"


def test_unknown_stage_skipped():
    assert _match_to_canonical(_sample_match(stage="MYSTERY_ROUND"), "world-cup-2026") is None
