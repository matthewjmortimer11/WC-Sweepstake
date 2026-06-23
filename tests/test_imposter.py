"""The Imposter party game (/imposter) — classic + celebrity dance."""

import pytest
from starlette.testclient import TestClient

import main


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


def test_imposter_page_served(client):
    r = client.get("/imposter")
    assert r.status_code == 200
    assert "text/html" in r.headers.get("content-type", "")


def test_imposter_has_game_surface(client):
    t = client.get("/imposter").text
    for marker in ("Imposter", "/imposter/assets/app.js", "/imposter/assets/celebs.js"):
        assert marker in t, f"missing Imposter marker: {marker!r}"
    js = client.get("/imposter/assets/app.js").text
    for marker in (
        "Create room", "Share game link", "roomInviteUrl", "renderLocal", "localMode",
        "Player 1", "Add player", "Start game",
        "Only click your own name. No peeking.",
        "IMPOSTER", "NOT IMPOSTER",
        "Hide role", "New round", "Edit names",
        "Celebrity Dance", "Your celebrity",
        "mainly dance", "Reveal the odd one out",
        "markViewed", "revealAnswer", "newRound",
        "modes--2",
    ):
        assert marker in js, f"missing Imposter JS marker: {marker!r}"
    assert "charades" not in js.lower()


def test_imposter_has_local_link(client):
    t = client.get("/imposter").text
    assert 'href="#/local"' in t
    assert "one phone" in t


def test_imposter_has_multiplayer_api(client):
    r = client.post("/imposter/api/rooms", json={"mode": "classic"})
    assert r.status_code == 200
    assert "code" in r.json()


def test_imposter_assets_served(client):
    assert client.get("/imposter/assets/app.js").status_code == 200
    assert client.get("/imposter/assets/styles.css").status_code == 200


def test_party_games_routes_all_serve(client):
    for path in ("/games", "/play", "/imposter", "/charades", "/wheel"):
        assert client.get(path).status_code == 200
