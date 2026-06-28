"""Wheesht Pro: league upgrade, feature gates, OI grandfathering."""

import pytest

import main
from conftest import add_participant, make_league


async def test_pro_checkout_requires_stripe_config(client):
    lg = await make_league(client)
    r = await client.post(
        f"/api/leagues/{lg['code']}/pro/checkout",
        headers={"X-Wheesht-Admin-Token": lg["adminToken"]},
        json={"successPath": "/", "cancelPath": "/"},
    )
    assert r.status_code == 503


async def test_free_league_pick_requires_pro(client):
    lg = await make_league(client)
    ent = await add_participant(client, lg["code"], "Picker Pat")
    r = await client.put(
        f"/api/leagues/{lg['code']}/participants/{ent['id']}/picks",
        headers={"X-Wheesht-Session-Token": ent["sessionToken"]},
        json={"key": "winner", "value": "BRA"},
    )
    assert r.status_code == 402
    assert r.json()["detail"] == "pro_required"


async def test_granted_league_allows_picks(client, monkeypatch):
    # _DEV_KEY is read once at import, so patch the resolved value directly
    # rather than the environment variable.
    monkeypatch.setattr(main, "_DEV_KEY", "dev-test-key")
    lg = await make_league(client)
    grant = await client.post(
        f"/api/leagues/{lg['code']}/pro/grant",
        headers={"X-Wheesht-Dev-Key": "dev-test-key"},
    )
    assert grant.status_code == 200
    ent = await add_participant(client, lg["code"], "Pro Pat")
    r = await client.put(
        f"/api/leagues/{lg['code']}/participants/{ent['id']}/picks",
        headers={"X-Wheesht-Session-Token": ent["sessionToken"]},
        json={"key": "winner", "value": "BRA"},
    )
    assert r.status_code == 200


async def test_state_exposes_pro_meta(client):
    lg = await make_league(client)
    state = await client.get(f"/api/leagues/{lg['code']}/state")
    meta = state.json()["meta"]
    assert meta["hasPro"] is False
    assert meta["proStatus"] == "free"
    assert "collectPayments" not in meta


async def test_analytics_requires_pro(client):
    lg = await make_league(client)
    r = await client.get(
        f"/api/leagues/{lg['code']}/analytics",
        headers={"X-Wheesht-Admin-Token": lg["adminToken"]},
    )
    assert r.status_code == 402


async def test_ko_pick_rejected_after_kickoff(client, monkeypatch):
    monkeypatch.setattr(main, "_DEV_KEY", "dev-test-key")
    fake_fix = {
        "id": "test-ko-r16", "a": "MEX", "b": "KOR", "stage": "r16",
        "status": "upcoming", "dateISO": "2020-01-01", "time": "12:00",
        "score": [None, None], "dateLabel": "Test", "timeLabel": "12:00",
    }
    monkeypatch.setattr(main, "_base_fixtures", lambda: [fake_fix])
    lg = await make_league(client)
    grant = await client.post(
        f"/api/leagues/{lg['code']}/pro/grant",
        headers={"X-Wheesht-Dev-Key": "dev-test-key"},
    )
    assert grant.status_code == 200
    admin = await client.get(
        f"/api/leagues/{lg['code']}/admin",
        headers={"X-Wheesht-Admin-Token": lg["adminToken"]},
    )
    data = admin.json()
    meta = dict(data.get("meta") or {})
    meta["knockoutPredictions"] = {
        "enabled": True, "fromStage": "r16", "toStage": "final", "type": "winner", "points": 5,
    }
    save = await client.put(
        f"/api/leagues/{lg['code']}/admin",
        headers={"X-Wheesht-Admin-Token": lg["adminToken"]},
        json={
            "teams": data.get("teams") or {},
            "fixtures": data.get("fixtures") or {},
            "predictions": data.get("predictions") or {},
            "meta": meta,
        },
    )
    assert save.status_code == 200
    state = await client.get(f"/api/leagues/{lg['code']}/state")
    ko = next(m for m in state.json()["predictions"] if str(m.get("key", "")).startswith("ko_"))
    ent = await add_participant(client, lg["code"], "Late Picker")
    r = await client.put(
        f"/api/leagues/{lg['code']}/participants/{ent['id']}/picks",
        headers={"X-Wheesht-Session-Token": ent["sessionToken"]},
        json={"key": ko["key"], "value": "MEX"},
    )
    assert r.status_code == 400
    assert "locked" in r.json()["detail"].lower()


async def test_oi_grandfathered_has_pro(client):
    code = main._CONFIG_LEAGUE_CODE
    state = await client.get(f"/api/leagues/{code}/state")
    assert state.status_code == 200
    meta = state.json()["meta"]
    league = state.json()["league"]
    assert meta["hasPro"] is True
    assert meta["proGrandfathered"] is True
    assert league["hasPro"] is True
    assert league["proGrandfathered"] is True
