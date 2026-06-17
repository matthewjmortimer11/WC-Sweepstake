"""Admin endpoints: CSV export, duplicate league, analytics."""

import pytest

from conftest import add_participant, make_league


async def test_csv_export_requires_admin(client):
    lg = await make_league(client)
    await add_participant(client, lg["code"], "Alice")
    no = await client.get(f"/api/leagues/{lg['code']}/export/entrants.csv")
    assert no.status_code == 403
    ok = await client.get(
        f"/api/leagues/{lg['code']}/export/entrants.csv",
        headers={"X-Wheesht-Admin-Token": lg["adminToken"]},
    )
    assert ok.status_code == 200
    assert "text/csv" in ok.headers.get("content-type", "")
    assert "Alice" in ok.text


async def test_analytics_requires_admin(client):
    lg = await make_league(client)
    no = await client.get(f"/api/leagues/{lg['code']}/analytics")
    assert no.status_code == 403
    ok = await client.get(
        f"/api/leagues/{lg['code']}/analytics",
        headers={"X-Wheesht-Admin-Token": lg["adminToken"]},
    )
    assert ok.status_code == 200
    data = ok.json()
    assert "entrants" in data
    assert "chat" in data


async def test_duplicate_league(client):
    lg = await make_league(client, name="Source League")
    r = await client.post(
        f"/api/leagues/{lg['code']}/duplicate",
        json={"name": "Copy League", "code": "COPY1", "password": "memberpw", "organiserCode": "orgcopy"},
        headers={"X-Wheesht-Admin-Token": lg["adminToken"]},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["league"]["code"] == "COPY1"
    assert data["adminToken"]


async def test_welcome_page(client):
    r = await client.get("/welcome")
    assert r.status_code == 200
    assert "Wheesht" in r.text
