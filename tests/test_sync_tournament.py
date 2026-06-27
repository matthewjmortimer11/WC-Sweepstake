"""Integration-style tests: tournament meta, adapter fixtures, knockout progression."""

from __future__ import annotations

import pytest

import standings
from adapters.mock import MockAdapter
from main import _tournament_fixture_meta


def _team(code: str, group: str = "A") -> dict:
    return {"code": code, "name": code, "group": group, "alive": True, "stage": "group", "rounds": 0}


def _fx(
    a: str,
    b: str,
    *,
    stage: str = "group",
    group: str | None = "A",
    status: str = "done",
    score=None,
    winner=None,
) -> dict:
    return {
        "id": f"{a}-{b}-{stage}",
        "a": a,
        "b": b,
        "stage": stage,
        "group": group,
        "status": status,
        "score": score,
        "winner": winner,
    }


LADDER = ["group", "r32", "r16", "qf", "sf", "final", "winner"]
LABELS = {
    "r32": "Round of 32",
    "r16": "Round of 16",
    "qf": "Quarter-final",
    "sf": "Semi-final",
    "final": "Final",
}


def test_knockouts_in_feed_without_full_r32():
    """Partial provider feed (e.g. QF only) should expose knockouts without r32Published."""
    fixtures = [
        _fx("AAA", "BBB", stage="qf", group=None, status="upcoming", score=None),
        _fx("CCC", "DDD", stage="qf", group=None, status="upcoming", score=None),
    ]
    teams = [_team("AAA"), _team("BBB"), _team("CCC"), _team("DDD")]
    meta = _tournament_fixture_meta(fixtures, teams, "live", LABELS)
    assert meta["r32Published"] is False
    assert meta["knockoutsInFeed"] is True
    assert meta["knockoutRound"] == "qf"


def test_r32_published_requires_sixteen_paired_ties():
    fixtures = [_fx(f"A{i}", f"B{i}", stage="r32", group=None) for i in range(8)]
    teams = [_team(f"A{i}") for i in range(8)] + [_team(f"B{i}") for i in range(8)]
    meta = _tournament_fixture_meta(fixtures, teams, "live", LABELS)
    assert meta["r32Published"] is False
    assert meta["knockoutsInFeed"] is True


def test_knockout_progression_r32_to_final():
    """Scripted tournament: winner advances through each knockout round."""
    codes = [f"T{i:02d}" for i in range(1, 33)]
    teams = [_team(c, "Z") for c in codes]
    fixtures = []
    survivors = codes[:]
    for stage, n in (("r32", 16), ("r16", 8), ("qf", 4), ("sf", 2)):
        next_survivors = []
        for i in range(n):
            a, b = survivors[i * 2], survivors[i * 2 + 1]
            fixtures.append(_fx(a, b, stage=stage, group=None, score=[2, 0], winner="HOME"))
            next_survivors.append(a)
        survivors = next_survivors
    a, b = survivors
    fixtures.append(_fx(a, b, stage="final", group=None, score=[1, 0], winner="HOME"))
    champion = a

    out = standings.compute_team_status(teams, fixtures, LADDER)
    by = {t["code"]: t for t in out}
    assert by[champion]["alive"] is True
    assert by[champion]["stage"] == "winner"
    assert by[champion]["rounds"] == 6
    losers = [c for c in codes if c != champion]
    assert all(by[c]["alive"] is False for c in losers)


@pytest.mark.asyncio
async def test_mock_adapter_returns_group_and_knockout_stages():
    adapter = MockAdapter()
    fixtures = await adapter.get_fixtures("world-cup-2026", "WC")
    assert len(fixtures) >= 72
    stages = {f.stage for f in fixtures}
    assert "group" in stages
