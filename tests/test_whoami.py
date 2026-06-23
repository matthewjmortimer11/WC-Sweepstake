"""The Who Am I? party game (/whoami)."""

import pytest
from starlette.testclient import TestClient

import main


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


def test_whoami_page_served(client):
    r = client.get("/whoami")
    assert r.status_code == 200
    assert "Who Am I?" in r.text


def test_whoami_has_game_surface(client):
    t = client.get("/whoami").text
    assert "/whoami/assets/app.js" in t
    js = client.get("/whoami/assets/app.js").text
    for marker in (
        "Create room", "Share game link", "confirmGuess", "claimGotIt",
        "They got it!", "I got it!", "Change photo", "newRound",
        "packToggleGrid", "Identity packs", "/whoami/api/packs", "identityCount",
    ):
        assert marker in js, f"missing Who Am I? JS marker: {marker!r}"


def test_whoami_has_multiplayer_api(client):
    r = client.post("/whoami/api/rooms", json={"packIds": ["uk_celebs", "marvel"]})
    assert r.status_code == 200
    body = r.json()
    assert "code" in body
    assert body.get("packIds") == ["uk_celebs", "marvel"]


def test_whoami_packs_api(client):
    r = client.get("/whoami/api/packs")
    assert r.status_code == 200
    packs = r.json()["packs"]
    ids = {p["id"] for p in packs}
    assert "uk_celebs" in ids
    assert "notorious" in ids


def test_games_hub_lists_whoami(client):
    t = client.get("/games").text
    assert 'href="/whoami"' in t
    assert "Who Am I?" in t
