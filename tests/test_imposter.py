"""The local-only Imposter party game page (/imposter)."""

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


def test_imposter_page_has_game_surface(client):
    t = client.get("/imposter").text
    # Setup, role-selection and reveal copy required by the spec.
    for marker in (
        "Player 1", "Player 4", "Start game",
        "Only click your own name. No peeking.",
        "IMPOSTER", "NOT IMPOSTER",
        "Hide role", "New round", "Edit names",
    ):
        assert marker in t, f"missing UI marker: {marker!r}"


def test_celebrity_dance_mode_present(client):
    t = client.get("/imposter").text
    for marker in (
        "Celebrity Dance", "Your celebrity",
        "mainly dance", "Reveal the odd one out",
    ):
        assert marker in t, f"missing Celebrity Dance marker: {marker!r}"
    # The celebrity pool ships with the page (local-only, no API).
    assert "CELEBS" in t and "Beyoncé" in t


def test_charades_mode_present(client):
    t = client.get("/imposter").text
    for marker in (
        "Charades", "Reveal charade", "Next player",
        "No talking, no pointing", "Up to act",
    ):
        assert marker in t, f"missing Charades marker: {marker!r}"
    # Charades reuses the celebrity pool as prompts.
    assert "pickCharade" in t and "CELEBS" in t
    # Score counter: who-guessed picker awards points to actor + guesser.
    for marker in ("Who guessed it", "Nobody got it", "awardCharade", "charadesScores"):
        assert marker in t, f"missing Charades score marker: {marker!r}"


def test_imposter_is_local_only_no_api(client):
    # The page must not call back to a server: no fetch/websocket/api endpoints.
    t = client.get("/imposter").text.lower()
    assert "fetch(" not in t
    assert "websocket" not in t
    assert "/api/" not in t


def test_existing_routes_unaffected(client):
    assert client.get("/").status_code == 200
    assert client.get("/welcome").status_code == 200
    assert client.get("/play").status_code == 200
