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
    assert by["BBB"]["stage"] == "out-r16"
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


def test_group_winner_stays_alive_when_knockout_bracket_incomplete():
    """A lone later-round fixture must not knock out group winners whose R32 tie
    is not in the feed yet (the Brazil false-elimination bug)."""
    teams = [_team("BRA", "D"), _team("D2", "D"), _team("D3", "D"), _team("D4", "D")]
    fixtures = [
        _fx("BRA", "D2", group="D", score=[2, 0]),
        _fx("BRA", "D3", group="D", score=[3, 0]),
        _fx("BRA", "D4", group="D", score=[1, 0]),
        _fx("D2", "D3", group="D", score=[1, 1]),
        _fx("D2", "D4", group="D", score=[2, 0]),
        _fx("D3", "D4", group="D", score=[1, 0]),
        _fx("X1", "X2", stage="r16", score=[1, 0]),
    ]
    out = standings.compute_team_status(teams, fixtures, LADDER)
    by = {t["code"]: t for t in out}
    assert by["BRA"]["alive"] is True
    assert by["D4"]["alive"] is False


def _full_r32_bracket(teams_codes):
    """Build 16 R32 ties covering 32 distinct team codes."""
    fixtures = []
    for i in range(0, 32, 2):
        a, b = teams_codes[i], teams_codes[i + 1]
        # Home team wins each tie by default.
        fixtures.append(_fx(a, b, stage="r32", score=[1, 0]))
    return fixtures


def test_group_straggler_out_once_opening_bracket_complete():
    """Once all 16 R32 ties exist, a team that never appears is out."""
    # Put T01 as home in the last tie so they advance.
    ko_codes = [f"K{i:02d}" for i in range(1, 31)] + ["T01", "K31"]
    teams = [_team(f"T{i:02d}", "A") for i in range(1, 5)]
    teams += [_team(f"T{i:02d}", "B") for i in range(5, 9)]
    teams += [_team(c, "Z") for c in ko_codes if c.startswith("K")]
    ga = [
        _fx("T01", "T02", group="A", score=[3, 0]),
        _fx("T01", "T03", group="A", score=[3, 0]),
        _fx("T01", "T04", group="A", score=[3, 0]),
        _fx("T02", "T03", group="A", score=[1, 1]),
        _fx("T02", "T04", group="A", score=[2, 0]),
        _fx("T03", "T04", group="A", score=[1, 0]),
    ]
    fixtures = ga + _full_r32_bracket(ko_codes)
    out = standings.compute_team_status(teams, fixtures, LADDER)
    by = {t["code"]: t for t in out}
    assert by["T01"]["alive"] is True
    assert by["T01"]["stage"] == "r32"
    assert by["T04"]["alive"] is False


def test_grade_winner_prediction_when_champion_known():
    teams = [
        {**_team("WIN"), "stage": "winner", "alive": True, "rounds": 6},
        {**_team("LOS"), "stage": "final", "alive": False, "rounds": 5},
    ]
    fixtures = [_fx("WIN", "LOS", stage="final", score=[2, 1], winner="HOME")]
    preds = [{"key": "winner", "kind": "team", "options": ["WIN", "LOS"], "answer": None, "points": 10}]
    graded = standings.grade_predictions(preds, teams, fixtures, LADDER)
    assert graded[0]["answer"] == "WIN"


def test_apply_pred_scores_from_graded_markets():
    preds = [{"key": "winner", "kind": "team", "options": ["AAA", "BBB"], "answer": "AAA", "points": 10}]
    people = [{"id": "p1", "name": "A", "picks": {"winner": "AAA"}, "predScore": 0}]
    out = standings.apply_pred_scores(people, preds)
    assert out[0]["predScore"] == 10


def test_apply_to_people_mirrors_team_status():
    teams = [{**_team("SCO"), "alive": False, "stage": "out-r16"}]
    people = [{"id": "p1", "name": "Davie", "team": "SCO", "alive": True, "stage": "group"}]
    out = standings.apply_to_people(people, teams)
    assert out[0]["alive"] is False
    assert out[0]["stage"] == "out-r16"


def test_penalty_knockout_eliminates_loser():
    teams = [_team("AAA"), _team("BBB")]
    fixtures = [
        _fx("AAA", "BBB", stage="r16", status="done", score=[1, 1], winner="AWAY"),
    ]
    out = standings.compute_team_status(teams, fixtures, LADDER)
    by = {t["code"]: t for t in out}
    assert by["BBB"]["alive"] is True
    assert by["AAA"]["alive"] is False


def test_champion_gets_winner_stage():
    teams = [_team("AAA"), _team("BBB")]
    fixtures = [
        _fx("AAA", "BBB", stage="final", status="done", score=[2, 1], winner="HOME"),
    ]
    out = standings.compute_team_status(teams, fixtures, LADDER)
    by = {t["code"]: t for t in out}
    assert by["AAA"]["stage"] == "winner"
    assert by["AAA"]["alive"] is True
    assert by["BBB"]["alive"] is False


def test_groups_complete_eliminates_non_qualifiers_from_projection(monkeypatch):
    """When every group is finished, non-qualifying thirds are cut even before
    the full R32 draw is in the feed."""
    teams = []
    fixtures = []
    for g in "ABCDEFGH":
        codes = [f"{g}1", f"{g}2", f"{g}3", f"{g}4"]
        for c in codes:
            teams.append(_team(c, g))
        a, b, c3, d = codes
        fixtures.extend([
            _fx(a, b, group=g, score=[3, 0]),
            _fx(a, c3, group=g, score=[3, 0]),
            _fx(a, d, group=g, score=[3, 0]),
            _fx(b, c3, group=g, score=[2, 1]),
            _fx(b, d, group=g, score=[2, 0]),
            _fx(c3, d, group=g, score=[1, 0]),
        ])

    def fake_qualifiers(teams, fixtures):
        return [t["code"] for t in teams if t["code"] != "H3"]

    monkeypatch.setattr(standings, "_projected_qualifier_codes", fake_qualifiers)
    out = standings.compute_team_status(teams, fixtures, LADDER)
    by = {t["code"]: t for t in out}
    assert by["H4"]["alive"] is False
    assert by["H3"]["alive"] is False
    assert by["H3"]["stage"] == "out-group"
    assert by["H1"]["alive"] is True
    assert by["H2"]["alive"] is True


def test_partial_r32_keeps_third_alive():
    teams = [_team("A1", "A"), _team("A2", "A"), _team("A3", "A"), _team("A4", "A")]
    fixtures = [
        _fx("A1", "A2", score=[1, 0]),
        _fx("A1", "A3", score=[1, 0]),
        _fx("A1", "A4", score=[1, 0]),
        _fx("A2", "A3", score=[1, 1]),
        _fx("A2", "A4", score=[1, 0]),
        _fx("A3", "A4", score=[1, 0]),
        _fx("A1", "A2", stage="r32", score=[1, 0]),
        _fx("A3", "A4", stage="r32", score=[1, 0]),
    ]
    out = standings.compute_team_status(teams, fixtures, LADDER)
    by = {t["code"]: t for t in out}
    assert by["A3"]["alive"] is True


def test_final_market_ignores_third_place_fixture():
    teams = [
        {**_team("AAA"), "stage": "final", "rounds": 5},
        {**_team("BBB"), "stage": "final", "rounds": 5},
        _team("CCC"),
        _team("DDD"),
    ]
    fixtures = [
        _fx("CCC", "DDD", stage="third", score=[2, 1], winner="HOME"),
        _fx("AAA", "BBB", stage="final", score=[3, 2], winner="HOME"),
    ]
    preds = [{"key": "final", "kind": "team2", "options": ["AAA", "BBB", "CCC", "DDD"], "answer": None, "points": 10}]
    graded = standings.grade_predictions(preds, teams, fixtures, LADDER)
    assert sorted(graded[0]["answer"]) == ["AAA", "BBB"]
