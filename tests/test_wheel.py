"""The local-only "Dial" guess-the-scale party game (/wheel)."""

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
    for marker in (
        "Read the", "Play to", "Psychic", "Lock in guess", "Next round",
        "gaugeHTML", "pointsFor", "SPECTRA",
    ):
        assert marker in t, f"missing Dial marker: {marker!r}"


def test_wheel_is_local_only_no_api(client):
    t = client.get("/wheel").text.lower()
    assert "fetch(" not in t
    assert "websocket" not in t
    assert "/api/" not in t


def test_party_games_routes_all_serve(client):
    for path in ("/", "/welcome", "/play", "/imposter", "/wheel"):
        assert client.get(path).status_code == 200
