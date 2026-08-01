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
    for marker in ("party games", "Cipher", "Imposter", "Cover Story", "Dial", "Charades", "Who Am I?", 'href="/play"', 'href="/coverstory"', 'href="/charades"', 'href="/whoami"', "/shared/pwa-register.js"):
        assert marker in t, f"missing games hub marker: {marker!r}"
    assert 'href="/"' not in t or "Open Wheesht" not in t


def test_games_manifest_includes_coverstory_shortcut(client):
    r = client.get("/games/manifest.webmanifest")

    assert r.status_code == 200
    body = r.json()
    assert "Cover Story" in body["description"]
    assert any(item["url"].startswith("/coverstory") for item in body["shortcuts"])
