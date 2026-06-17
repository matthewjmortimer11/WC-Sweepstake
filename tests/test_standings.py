"""Unit tests for the rules engine (standings.py)."""

import standings


def _team(code, group="A"):
    return {"code": code, "name": code, "group": group, "alive": True, "stage": "group", "rounds": 0}


def _fx(a, b, stage="group", group="A", status="done", score=None, winner=None):
    return {
        "id": f"{a}-{b}-{stage}",
        "a": a, "b": b, "stage": stage, "group": group,
        "status": status, "score": score, "winner": winner,
    }


LADDER = ["group", "r32", "r16", "qf", "sf", "final", "winner"]


def test_knockout_loss_eliminates_loser():
    teams = [_team("AAA"), _team("BBB")]
    fixtures = [
        _fx("AAA", "BBB", stage="r16", status="done", score=[2, 0], winner="HOME"),
    ]
    out = standings.compute_team_status(teams, fixtures, LADDER)
    by = {t["code"]: t for t in out}
    assert by["AAA"]["alive"] is True
    assert by["BBB"]["alive"] is False
    assert by["AAA"]["stage"] == "r16"


def test_group_bottom_eliminated_when_group_complete():
    teams = [_team("A1", "A"), _team("A2", "A"), _team("A3", "A"), _team("A4", "A")]
    fixtures = [
        _fx("A1", "A2", score=[3, 0]),
        _fx("A1", "A3", score=[3, 0]),
        _fx("A1", "A4", score=[3, 0]),
        _fx("A2", "A3", score=[1, 1]),
        _fx("A2", "A4", score=[2, 1]),
        _fx("A3", "A4", score=[1, 0]),
    ]
    out = standings.compute_team_status(teams, fixtures, LADDER)
    by = {t["code"]: t for t in out}
    assert by["A1"]["alive"] is True
    assert by["A4"]["alive"] is False


def test_grade_winner_prediction_when_champion_known():
    teams = [
        {**_team("WIN"), "stage": "winner", "alive": True, "rounds": 6},
        {**_team("LOS"), "stage": "final", "alive": False, "rounds": 5},
    ]
    fixtures = [_fx("WIN", "LOS", stage="final", score=[2, 1], winner="HOME")]
    preds = [{"key": "winner", "kind": "team", "options": ["WIN", "LOS"], "answer": None, "points": 10}]
    graded = standings.grade_predictions(preds, teams, fixtures, LADDER)
    assert graded[0]["answer"] == "WIN"


def test_apply_to_people_mirrors_team_status():
    teams = [{**_team("SCO"), "alive": False, "stage": "out-r16"}]
    people = [{"id": "p1", "name": "Davie", "team": "SCO", "alive": True, "stage": "group"}]
    out = standings.apply_to_people(people, teams)
    assert out[0]["alive"] is False
    assert out[0]["stage"] == "out-r16"
