"""The Charades party game (/charades)."""

import pytest
from starlette.testclient import TestClient

import main


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


def test_charades_page_served(client):
    r = client.get("/charades")
    assert r.status_code == 200
    assert "Charades" in r.text


def test_charades_has_game_surface(client):
    t = client.get("/charades").text
    assert "/charades/assets/app.js" in t
    js = client.get("/charades/assets/app.js").text
    for marker in (
        "Create room", "Share game link", "renderLocal", "localMode",
        "Reveal charade", "Up to act", "Nobody got it", "awardCharade",
        "Acting timer (optional)", "armCharadeTimer", "pickCharade",
        "No talking, no pointing", "IMPOSTER_CELEBS",
    ):
        assert marker in js, f"missing Charades JS marker: {marker!r}"


def test_charades_has_multiplayer_api(client):
    r = client.post("/charades/api/rooms", json={"timerSecs": 60})
    assert r.status_code == 200
    assert "code" in r.json()


def test_games_hub_lists_all_party_games(client):
    t = client.get("/games").text
    for marker in ("Party", "Cipher", "Imposter", "Dial", "Charades", 'href="/play"', 'href="/charades"'):
        assert marker in t, f"missing games hub marker: {marker!r}"
    assert 'href="/"' not in t or "Open Wheesht" not in t
