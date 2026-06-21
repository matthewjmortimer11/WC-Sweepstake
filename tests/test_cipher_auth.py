"""Tests for optional Cipher login and social stats."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import delete
from starlette.testclient import TestClient

import main
from codenames import auth, store


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


async def _reset_social_tables():
    await store.init_models()
    from codenames.models import (
        CipherFriend, CipherMatch, CipherMatchPlayer, CipherUser,
    )
    async with store.SessionLocal() as s:
        await s.execute(delete(CipherMatchPlayer))
        await s.execute(delete(CipherMatch))
        await s.execute(delete(CipherFriend))
        await s.execute(delete(CipherUser))
        await s.commit()


def test_cipher_token_roundtrip():
    uid = uuid.uuid4().hex
    tok = auth.cipher_token_for(uid)
    assert auth.user_id_from_token(tok) == uid
    assert auth.user_id_from_token("bad.token.here") is None


async def test_upsert_google_user_creates_profile():
    await _reset_social_tables()
    user = await store.upsert_google_user({
        "sub": "google-sub-1",
        "name": "Test Agent",
        "picture": "https://example.com/av.png",
    })
    assert user["displayName"] == "Test Agent"
    again = await store.upsert_google_user({"sub": "google-sub-1", "name": "Renamed"})
    assert again["id"] == user["id"]
    assert again["displayName"] == "Renamed"


async def test_user_stats_and_leaderboard():
    await _reset_social_tables()
    u1 = await store.upsert_google_user({"sub": "g1", "name": "Alice"})
    u2 = await store.upsert_google_user({"sub": "g2", "name": "Bob"})
    now = datetime.now(timezone.utc)

    async def save(uid, won, secs):
        mid = uuid.uuid4().hex
        snap = {
            "id": mid, "room_code": "ABCD",
            "created_at": now - timedelta(seconds=secs),
            "ended_at": now,
            "board_size": 5, "pack_id": "classic", "pack_name": "Classic",
            "custom_words": False, "turn_seconds": 0, "assassins": 1,
            "starting_team": "red", "winner": "red" if won else "blue",
            "win_reason": "cleared", "rounds": 1,
            "red_remaining": 0, "blue_remaining": 3,
            "players": [
                {"pid": "p1", "name": "Alice", "team": "red", "role": "spymaster",
                 "won": won, "user_id": u1["id"]},
                {"pid": "p2", "name": "Bob", "team": "blue", "role": "operative",
                 "won": not won, "user_id": u2["id"]},
            ],
        }
        await store.save_match(snap)

    await save(u1["id"], True, 120)
    await save(u1["id"], True, 45)
    await save(u1["id"], False, 30)

    stats = await store.get_user_stats(u1["id"])
    assert stats["enabled"] is True
    assert stats["games"] == 3
    assert stats["wins"] == 2
    assert stats["losses"] == 1
    assert stats["quickestWinSecs"] == 45
    assert stats["quickestLossSecs"] == 30

    board = await store.get_leaderboard()
    assert board["enabled"] is True
    assert board["leaders"][0]["user"]["id"] == u1["id"]
    assert board["leaders"][0]["wins"] == 2


async def test_pairings_and_friends():
    await _reset_social_tables()
    u1 = await store.upsert_google_user({"sub": "g1", "name": "Alice"})
    u2 = await store.upsert_google_user({"sub": "g2", "name": "Bob"})
    now = datetime.now(timezone.utc)
    snap = {
        "id": uuid.uuid4().hex, "room_code": "WXYZ",
        "created_at": now - timedelta(seconds=90),
        "ended_at": now,
        "board_size": 5, "pack_id": "classic", "pack_name": "Classic",
        "custom_words": False, "turn_seconds": 0, "assassins": 1,
        "starting_team": "red", "winner": "red", "win_reason": "cleared",
        "rounds": 1, "red_remaining": 0, "blue_remaining": 3,
        "players": [
            {"pid": "p1", "name": "Alice", "team": "red", "role": "spymaster",
             "won": True, "user_id": u1["id"]},
            {"pid": "p2", "name": "Bob", "team": "red", "role": "operative",
             "won": True, "user_id": u2["id"]},
            {"pid": "p3", "name": "Carol", "team": "blue", "role": "spymaster",
             "won": False, "user_id": None},
        ],
    }
    await store.save_match(snap)

    pairings = await store.get_pairings(u1["id"])
    assert pairings["enabled"] is True
    assert pairings["pairings"][0]["user"]["id"] == u2["id"]
    assert pairings["pairings"][0]["winsTogether"] == 1

    recent = await store.get_recent_players(u1["id"])
    assert recent["enabled"] is True
    assert any(p["user"]["id"] == u2["id"] for p in recent["players"])

    assert (await store.add_friend(u1["id"], u2["id"]))["ok"] is True
    friends = await store.list_friends(u1["id"])
    assert len(friends["friends"]) == 1
    assert friends["friends"][0]["id"] == u2["id"]


def test_auth_config_endpoint(client):
    r = client.get("/play/api/config")
    assert r.status_code == 200
    body = r.json()
    assert "authEnabled" in body
    assert "googleClientId" in body


def test_me_requires_token(client):
    r = client.get("/play/api/me")
    assert r.status_code == 401
