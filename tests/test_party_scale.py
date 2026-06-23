"""Party games — scale, health, and shared infrastructure."""

import pytest
from starlette.testclient import TestClient

import main
from party.ratelimit import WsRateLimitError, client_key, rate_limit_create, rate_limit_ws_message
from party.stats import MAX_TOTAL_ROOMS, party_stats


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


def test_health_endpoint(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"ok": True}


def test_ready_endpoint(client):
    r = client.get("/ready")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert "party" in body
    assert "games" in body["party"]
    for game in ("cipher", "dial", "imposter", "charades", "whoami"):
        assert game in body["party"]["games"]


def test_client_key_uses_forwarded_for():
    class FakeClient:
        host = "10.0.0.1"

    class FakeRequest:
        client = FakeClient()
        headers = {"x-forwarded-for": "203.0.113.9, 10.0.0.1"}

    assert client_key(FakeRequest()) == "203.0.113.9"


def test_rate_limit_create_blocks_after_limit():
    class FakeClient:
        host = "198.51.100.1"

    class FakeRequest:
        client = FakeClient()
        headers = {}

    for _ in range(30):
        rate_limit_create(FakeRequest(), limit=30, window=600)
    with pytest.raises(Exception) as exc:
        rate_limit_create(FakeRequest(), limit=30, window=600)
    assert exc.value.status_code == 429


def test_ws_rate_limit_skips_ping():
    rate_limit_ws_message("imposter", "ABCD", "p1", mtype="ping")
    rate_limit_ws_message("imposter", "ABCD", "p1", mtype="ping")


def test_ws_rate_limit_blocks_flood():
    for _ in range(120):
        rate_limit_ws_message("charades", "WXYZ", "p2", mtype="rename")
    with pytest.raises(WsRateLimitError):
        rate_limit_ws_message("charades", "WXYZ", "p2", mtype="rename")


def test_party_stats_shape():
    stats = party_stats()
    assert stats["rooms"] >= 0
    assert stats["limits"]["maxRooms"] == MAX_TOTAL_ROOMS


def test_game_assets_have_cache_headers(client):
    r = client.get("/imposter/assets/styles.css")
    assert r.status_code == 200
    assert "immutable" in r.headers.get("cache-control", "")


def test_game_page_injects_asset_version(client):
    html = client.get("/whoami").text
    assert "{{ASSET_VERSION}}" not in html
    assert "/whoami/assets/app.js?v=" in html


def test_cipher_create_rate_limited(client):
    for _ in range(30):
        assert client.post("/play/api/rooms", json={}).status_code == 200
    r = client.post("/play/api/rooms", json={})
    assert r.status_code == 429
