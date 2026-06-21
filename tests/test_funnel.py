"""Growth funnel events and analytics."""

import pytest

import main
from conftest import make_league


async def test_funnel_event_accepted(client):
    r = await client.post("/api/events", json={
        "event": "gate_view",
        "sessionId": "test-session-1",
    })
    assert r.status_code == 200
    assert r.json()["ok"] is True


async def test_funnel_event_rejects_unknown(client):
    r = await client.post("/api/events", json={
        "event": "not_a_real_event",
        "sessionId": "x",
    })
    assert r.status_code == 400


async def test_analytics_includes_funnel(client, monkeypatch):
    # Analytics is a Pro feature, so grant the league Pro via the dev key first.
    monkeypatch.setattr(main, "_DEV_KEY", "dev-test-key")
    lg = await make_league(client)
    await client.post(
        f"/api/leagues/{lg['code']}/pro/grant",
        headers={"X-Wheesht-Dev-Key": "dev-test-key"},
    )
    await client.post("/api/events", json={
        "event": "invite_view",
        "sessionId": "s1",
        "leagueCode": lg["code"],
    })
    r = await client.get(
        f"/api/leagues/{lg['code']}/analytics",
        headers={"X-Wheesht-Admin-Token": lg["adminToken"]},
    )
    assert r.status_code == 200
    data = r.json()
    assert "funnel" in data
    assert data["funnel"].get("invite_view", 0) >= 1
