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
    monkeypatch.setenv("WC_DEV_KEY", "dev-test-key")
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
