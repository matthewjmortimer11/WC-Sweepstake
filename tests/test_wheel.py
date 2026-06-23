"""The Dial guess-the-scale party game (/wheel) — online multiplayer."""

import pytest
from starlette.testclient import TestClient

import main


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


def test_wheel_page_served(client):
    r = client.get("/wheel")
    assert r.status_code == 200
    assert "text/html" in r.headers.get("content-type", "")


def test_wheel_has_game_surface(client):
    t = client.get("/wheel").text
    for marker in ("Read the", "Dial", "/wheel/assets/app.js"):
        assert marker in t, f"missing Dial marker: {marker!r}"
    js = client.get("/wheel/assets/app.js").text
    for marker in ("Create room", "gaugeHTML", "pointsFor", "lockGuess", "psychicReady", "Free-for-all", "Share game link", "roomInviteUrl", "renderLocal", "localMode", "clueToggleButton", "setClue"):
        assert marker in js, f"missing Dial JS marker: {marker!r}"


def test_wheel_has_local_link(client):
    t = client.get("/wheel").text
    assert 'href="#/local"' in t
    assert "one phone" in t


def test_wheel_has_multiplayer_api(client):
    t = client.get("/wheel").text
    assert "/wheel/assets/app.js" in t
    r = client.post("/wheel/api/rooms", json={"mode": "teams"})
    assert r.status_code == 200
    assert "code" in r.json()


def test_party_games_routes_all_serve(client):
    for path in ("/games", "/play", "/imposter", "/charades", "/wheel"):
        assert client.get(path).status_code == 200
