"""Tests for Cipher's Postgres persistence (Option A: separate tables/engine).

Runs against the same throwaway SQLite database the rest of the suite uses (the
store reads DATABASE_URL just like the sweepstake), exercising the real ORM and
queries. Cipher's tables are created lazily and are independent of the sweepstake
schema, so these tests manage their own rows.
"""

import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import delete

from codenames import store
from codenames.game import Game, Settings
from codenames.words import words_for


async def _reset_tables():
    await store.init_models()
    from codenames.models import CipherMatch, CipherMatchPlayer
    async with store.SessionLocal() as s:
        await s.execute(delete(CipherMatchPlayer))
        await s.execute(delete(CipherMatch))
        await s.commit()


def _snapshot(winner="red", reason="cleared", pack_name="Classic"):
    now = datetime.now(timezone.utc)
    return {
        "id": uuid.uuid4().hex, "room_code": "ABCD",
        "created_at": now, "ended_at": now,
        "board_size": 5, "pack_id": "classic", "pack_name": pack_name,
        "custom_words": False, "turn_seconds": 0, "assassins": 1,
        "starting_team": "red", "winner": winner, "win_reason": reason,
        "rounds": 1, "red_remaining": 0, "blue_remaining": 3,
        "players": [
            {"pid": "p1", "name": "Alice", "team": "red",
             "role": "spymaster", "won": winner == "red"},
            {"pid": "p2", "name": "Bob", "team": "blue",
             "role": "operative", "won": winner == "blue"},
        ],
    }


def test_persistence_enabled_under_test_db():
    # conftest points DATABASE_URL at SQLite, so the store should be live.
    assert store.ENABLED is True


async def test_save_match_and_aggregate_stats():
    await _reset_tables()
    await store.save_match(_snapshot("red", "cleared"))
    await store.save_match(_snapshot("blue", "assassin"))

    st = await store.get_stats()
    assert st["enabled"] is True
    assert st["totalGames"] == 2
    assert st["wins"].get("red") == 1
    assert st["wins"].get("blue") == 1
    assert st["assassinLosses"] == 1
    assert st["byPack"].get("Classic") == 2
    assert len(st["recent"]) == 2


async def test_match_player_rows_written():
    await _reset_tables()
    await store.save_match(_snapshot("red"))
    from codenames.models import CipherMatchPlayer
    from sqlalchemy import select
    async with store.SessionLocal() as s:
        rows = (await s.execute(select(CipherMatchPlayer))).scalars().all()
    assert len(rows) == 2
    winners = {r.pid: r.won for r in rows}
    assert winners["p1"] is True   # red spymaster
    assert winners["p2"] is False  # blue operative


async def test_save_match_is_best_effort_on_bad_data():
    # A malformed snapshot must be swallowed, never raised.
    await store.save_match({"id": "x"})  # missing required keys


async def test_snapshot_from_finished_game_maps_correctly():
    from codenames.manager import Player, Room, _match_snapshot

    s = Settings(board_size=5, pack_id="classic", pack_name="Classic")
    g = Game(settings=s)
    g.new_round(words_for("classic"), seed=11)
    team = g.current_team
    g.give_clue(team, "x", 0)  # unlimited
    for i, c in list(enumerate(g.cards)):
        if c.kind == team and not c.revealed:
            g.guess(team, i)
    assert g.status == "ended" and g.winner == team

    room = Room(code="ZZZZ", game=g, settings=s)
    room.players["p1"] = Player(id="p1", name="Spy", team=team, role="spymaster")
    room.players["pX"] = Player(id="pX", name="Watcher", team="spectator")

    snap = _match_snapshot(room)
    assert snap["winner"] == team
    assert snap["room_code"] == "ZZZZ"
    # Spectators are excluded; the one team member is recorded as a winner.
    assert len(snap["players"]) == 1
    assert snap["players"][0]["won"] is True

    # And it round-trips through the store.
    await _reset_tables()
    await store.save_match(snap)
    st = await store.get_stats()
    assert st["totalGames"] == 1
