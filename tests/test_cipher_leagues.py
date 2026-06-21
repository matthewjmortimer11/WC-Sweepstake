"""Tests for Cipher nicknames and friend leagues."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from starlette.testclient import TestClient

import main
from codenames import auth, store


@pytest.fixture
def client():
    with TestClient(main.app) as c:
        yield c


async def _reset_tables():
    await store.init_models()
    from codenames.models import (
        CipherFriend, CipherLeague, CipherLeagueMember, CipherMatch,
        CipherMatchPlayer, CipherUser,
    )
    from sqlalchemy import delete
    async with store.SessionLocal() as s:
        await s.execute(delete(CipherMatchPlayer))
        await s.execute(delete(CipherMatch))
        await s.execute(delete(CipherLeagueMember))
        await s.execute(delete(CipherLeague))
        await s.execute(delete(CipherFriend))
        await s.execute(delete(CipherUser))
        await s.commit()


def test_update_nickname_and_profile(client):
    async def run():
        await _reset_tables()
        u = await store.upsert_google_user({"sub": "g-nick", "name": "Google Name"})
        tok = auth.cipher_token_for(u["id"])
        r = client.patch(
            "/play/api/me",
            headers={"X-Cipher-Token": tok},
            json={"nickname": "Spymaster Sam"},
        )
        assert r.status_code == 200
        body = r.json()["user"]
        assert body["nickname"] == "Spymaster Sam"
        assert body["label"] == "Spymaster Sam"

    import asyncio
    asyncio.run(run())


def test_create_join_league_and_tagged_room(client):
    async def run():
        await _reset_tables()
        host = await store.upsert_google_user({"sub": "host", "name": "Host"})
        friend = await store.upsert_google_user({"sub": "pal", "name": "Pal"})
        host_tok = auth.cipher_token_for(host["id"])

        cr = client.post(
            "/play/api/leagues",
            headers={"X-Cipher-Token": host_tok},
            json={"name": "Friday Crew"},
        )
        assert cr.status_code == 200
        code = cr.json()["league"]["code"]
        assert len(code) == 6

        pal_tok = auth.cipher_token_for(friend["id"])
        jr = client.post(
            "/play/api/leagues/join",
            headers={"X-Cipher-Token": pal_tok},
            json={"code": code, "nickname": "Blue Boss"},
        )
        assert jr.status_code == 200

        rr = client.post(
            "/play/api/rooms",
            json={"packIds": ["classic"], "leagueCode": code},
        )
        assert rr.status_code == 200
        room_code = rr.json()["code"]
        assert rr.json()["leagueCode"] == code

        from codenames.manager import manager
        room = manager.get(room_code)
        assert room.settings.league_id is not None
        assert room.settings.league_code == code

        now = datetime.now(timezone.utc)
        snap = {
            "id": uuid.uuid4().hex,
            "room_code": room_code,
            "league_id": room.settings.league_id,
            "created_at": now - timedelta(seconds=120),
            "ended_at": now,
            "board_size": 5,
            "pack_id": "classic",
            "pack_name": "Classic",
            "custom_words": False,
            "turn_seconds": 0,
            "assassins": 1,
            "starting_team": "red",
            "winner": "red",
            "win_reason": "cleared",
            "rounds": 1,
            "red_remaining": 0,
            "blue_remaining": 3,
            "players": [
                {"pid": "h1", "name": "Host", "team": "red", "role": "spymaster",
                 "won": True, "user_id": host["id"]},
                {"pid": "p1", "name": "Blue Boss", "team": "blue", "role": "operative",
                 "won": False, "user_id": friend["id"]},
            ],
        }
        await store.save_match(snap)

        standings = await store.get_league_standings(room.settings.league_id)
        assert standings["enabled"] is True
        labels = {s["label"] for s in standings["standings"]}
        assert "Blue Boss" in labels
        assert standings["standings"][0]["wins"] == 1

        games = await store.get_league_games(room.settings.league_id)
        assert len(games["games"]) == 1
        assert games["games"][0]["winner"] == "red"

    import asyncio
    asyncio.run(run())


def test_league_info_endpoint(client):
    async def run():
        await _reset_tables()
        u = await store.upsert_google_user({"sub": "solo", "name": "Solo"})
        tok = auth.cipher_token_for(u["id"])
        code = client.post(
            "/play/api/leagues",
            headers={"X-Cipher-Token": tok},
            json={"name": "Test League"},
        ).json()["league"]["code"]

        r = client.get(f"/play/api/leagues/{code}")
        assert r.status_code == 200
        body = r.json()["league"]
        assert body["name"] == "Test League"
        assert body["memberCount"] == 1

    import asyncio
    asyncio.run(run())
