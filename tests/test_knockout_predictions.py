"""Tests for knockout bracket prediction market injection."""

import knockout_predictions as kp
import standings


def _team(code, group="A"):
    return {"code": code, "name": code, "group": group, "flag": code[:1]}


def _fx(a, b, stage="r16", fid=None, status="upcoming", score=None, winner=None):
    return {
        "id": fid or f"{a}-{b}-{stage}",
        "a": a, "b": b, "stage": stage,
        "status": status, "score": score, "winner": winner,
        "dateISO": "2026-07-05", "time": "20:00",
    }


def test_disabled_returns_empty():
    fixtures = [_fx("AAA", "BBB")]
    out = kp.knockout_prediction_markets(
        fixtures, {"AAA": _team("AAA"), "BBB": _team("BBB")},
        {"enabled": False},
        status_is_done=standings._fixture_finished,
        winner_of=standings._winner_of,
    )
    assert out == []


def test_injects_winner_market_for_r16():
    fixtures = [_fx("AAA", "BBB", stage="r16")]
    teams = {"AAA": _team("AAA"), "BBB": _team("BBB")}
    out = kp.knockout_prediction_markets(
        fixtures, teams,
        {"enabled": True, "fromStage": "r16", "toStage": "final", "points": 5},
        status_is_done=standings._fixture_finished,
        winner_of=standings._winner_of,
    )
    assert len(out) == 1
    assert out[0]["key"].startswith("ko_")
    assert out[0]["kind"] == "team"
    assert out[0]["points"] == 5
    assert out[0]["options"] == ["AAA", "BBB"]
    assert out[0]["fixture_id"] == fixtures[0]["id"]


def test_skips_tbd_and_out_of_range():
    fixtures = [
        _fx("AAA", "TBD", stage="r16"),
        _fx("CCC", "DDD", stage="r32"),
    ]
    teams = {"AAA": _team("AAA"), "CCC": _team("CCC"), "DDD": _team("DDD")}
    out = kp.knockout_prediction_markets(
        fixtures, teams,
        {"enabled": True, "fromStage": "r16", "toStage": "final", "points": 5},
        status_is_done=standings._fixture_finished,
        winner_of=standings._winner_of,
    )
    assert out == []


def test_r32_to_final_range():
    fixtures = [
        _fx("A1", "A2", stage="r32", fid="r32-1"),
        _fx("B1", "B2", stage="r16", fid="r16-1"),
        _fx("C1", "C2", stage="final", fid="final-1"),
    ]
    teams = {c: _team(c) for c in ("A1", "A2", "B1", "B2", "C1", "C2")}
    out = kp.knockout_prediction_markets(
        fixtures, teams,
        {"enabled": True, "fromStage": "r32", "toStage": "final", "points": 7},
        status_is_done=standings._fixture_finished,
        winner_of=standings._winner_of,
    )
    assert len(out) == 3
    assert all(m["points"] == 7 for m in out)
    assert [m["stage"] for m in out] == ["r32", "r16", "final"]


def test_grades_finished_winner():
    fixtures = [_fx("AAA", "BBB", stage="qf", status="done", score=[2, 1], winner="HOME")]
    teams = {"AAA": _team("AAA"), "BBB": _team("BBB")}
    out = kp.knockout_prediction_markets(
        fixtures, teams,
        {"enabled": True, "fromStage": "qf", "toStage": "final", "points": 5},
        status_is_done=standings._fixture_finished,
        winner_of=standings._winner_of,
    )
    assert out[0]["answer"] == "AAA"


def test_dedupes_existing_fixture_ids():
    fixtures = [_fx("AAA", "BBB", stage="r16", fid="fix-1")]
    teams = {"AAA": _team("AAA"), "BBB": _team("BBB")}
    out = kp.knockout_prediction_markets(
        fixtures, teams,
        {"enabled": True, "fromStage": "r16", "toStage": "final"},
        existing_fixture_ids={"fix-1"},
        status_is_done=standings._fixture_finished,
        winner_of=standings._winner_of,
    )
    assert out == []


def test_normalise_swaps_inverted_range():
    cfg = kp.normalise_knockout_predictions({"enabled": True, "fromStage": "final", "toStage": "r16"})
    assert cfg["fromStage"] == "r16"
    assert cfg["toStage"] == "final"


def test_scoreline_type():
    fixtures = [_fx("AAA", "BBB", stage="sf", status="done", score=[1, 0])]
    teams = {"AAA": _team("AAA"), "BBB": _team("BBB")}
    out = kp.knockout_prediction_markets(
        fixtures, teams,
        {"enabled": True, "fromStage": "sf", "toStage": "final", "type": "scoreline", "points": 10},
        status_is_done=standings._fixture_finished,
        winner_of=standings._winner_of,
    )
    assert out[0]["kind"] == "scoreline"
    assert out[0]["answer"] == "1-0"


def test_fixture_status_done_when_done_flag_only():
    fixtures = [_fx("AAA", "BBB", stage="r16", status="upcoming", score=[2, 1], winner="HOME")]
    fixtures[0]["done"] = True
    teams = {"AAA": _team("AAA"), "BBB": _team("BBB")}
    out = kp.knockout_prediction_markets(
        fixtures, teams,
        {"enabled": True, "fromStage": "r16", "toStage": "final"},
        status_is_done=standings._fixture_finished,
        winner_of=standings._winner_of,
    )
    assert out[0]["fixture_status"] == "done"
    assert out[0]["answer"] == "AAA"
    assert out[0]["dateISO"] == "2026-07-05"


def test_ko_scores_when_answer_set_despite_stale_status():
    preds = [{
        "key": "ko_fix1", "kind": "team", "points": 5, "answer": "AAA",
        "fixture_status": "upcoming", "fixture_id": "fix1",
    }]
    people = [{"id": "p1", "picks": {"ko_fix1": "AAA"}, "predScore": 0}]
    out = standings.apply_pred_scores(people, preds)
    assert out[0]["predScore"] == 5
