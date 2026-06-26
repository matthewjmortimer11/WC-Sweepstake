"""HTTP tests for the Scotland qualification page and API."""

import sync
from qualification.router import _get_payload, _payload_cache


async def test_qualification_api_defaults_to_scotland(client):
    r = await client.get("/api/qualification")
    assert r.status_code == 200
    data = r.json()
    assert data["target"] == "SCO"
    assert "chance" in data
    assert "percent" in data["chance"]
    if data.get("checklist", {}).get("applicable"):
        assert "items" in data["checklist"]
        assert data["checklist"]["title"].startswith("How do")
    assert "meta" in data
    assert "Cache-Control" in r.headers
    assert "max-age=" in r.headers["Cache-Control"]


async def test_qualification_api_unknown_team(client):
    r = await client.get("/api/qualification?target=ZZZ")
    assert r.status_code == 404


async def test_scotland_qualification_page(client):
    r = await client.get("/scotland-qualification")
    assert r.status_code == 200
    assert 'property="og:title"' in r.text
    assert "scotland-qualification" in r.text or "Scotland" in r.text
    assert "Content-Security-Policy" in r.headers
    assert "no-store" in r.headers.get("Cache-Control", "")


def test_payload_cache_reuses_until_fixture_revision_changes():
    _payload_cache.clear()
    p1 = _get_payload("SCO")
    p2 = _get_payload("SCO")
    assert p1 is p2

    sync.fixture_cache_revision += 1
    p3 = _get_payload("SCO")
    assert p3 is not p1
    assert p3["target"] == "SCO"

    _payload_cache.clear()
