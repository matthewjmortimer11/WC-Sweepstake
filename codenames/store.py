"""
Cipher — persistence layer (Option A: separate tables, own engine).

Design goals
------------
* **Separate from the sweepstake.** Cipher uses its own SQLAlchemy declarative
  base (:class:`CipherBase`) and its own async engine. Its tables are all
  prefixed ``cipher_`` and have no foreign keys into sweepstake tables, so the
  two domains never touch each other's data.
* **Upgradeable.** The engine reads ``CIPHER_DATABASE_URL`` first and only falls
  back to the shared ``DATABASE_URL``. That means graduating to a separate
  Postgres schema or a wholly separate database later is a config change, not a
  code change — game logic never imports the engine directly.
* **Best-effort.** Persistence must never affect gameplay. Every public call is
  wrapped so a database hiccup degrades to "in-memory only" rather than breaking
  a live game. If no database URL is configured at all, persistence is disabled.

Live gameplay stays in memory (fast, simple); we write a durable record only
when a match *ends*. That's the high-value, low-risk data — match history and a
basis for stats/leaderboards — without the complexity of rehydrating live rooms
(a clean future upgrade).
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import Integer, func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

log = logging.getLogger(__name__)


def _normalise(url: str) -> str:
    """Mirror db.py: force the asyncpg driver for Postgres URLs."""
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://"):]
    return url


# Prefer a dedicated URL; fall back to the shared one. Empty => persistence off.
_RAW_URL = (os.environ.get("CIPHER_DATABASE_URL")
            or os.environ.get("DATABASE_URL")
            or "").strip()
DATABASE_URL: Optional[str] = _normalise(_RAW_URL) if _RAW_URL else None
ENABLED: bool = bool(DATABASE_URL)


class CipherBase(DeclarativeBase):
    """Declarative base for Cipher's tables only — separate from the sweepstake."""


# A small, dedicated pool so the game never starves the sweepstake of
# connections (and so a future move to its own database is seamless).
if ENABLED:
    _engine_kwargs: dict[str, Any] = {"pool_pre_ping": True, "echo": False}
    if DATABASE_URL.startswith("postgresql"):
        _engine_kwargs.update(pool_size=5, max_overflow=5, pool_recycle=1800)
    engine = create_async_engine(DATABASE_URL, **_engine_kwargs)
    SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
else:  # pragma: no cover - only when no DB is configured at all
    engine = None
    SessionLocal = None

_init_lock = asyncio.Lock()
_initialised = False


async def init_models() -> None:
    """Create Cipher's tables once. Importing models here (rather than at module
    top) registers them on CipherBase.metadata without a circular import."""
    global _initialised
    if not ENABLED or _initialised:
        return
    async with _init_lock:
        if _initialised:
            return
        from . import models  # noqa: F401  (registers tables on CipherBase)
        async with engine.begin() as conn:
            await conn.run_sync(CipherBase.metadata.create_all)
            await _migrate_schema(conn)
        _initialised = True


async def _migrate_schema(conn) -> None:
    """Idempotent column adds for existing deployments."""
    dialect = conn.dialect.name
    if dialect == "postgresql":
        await conn.execute(text(
            "ALTER TABLE cipher_match_player "
            "ADD COLUMN IF NOT EXISTS user_id VARCHAR"
        ))
    else:
        try:
            await conn.execute(text(
                "ALTER TABLE cipher_match_player ADD COLUMN user_id VARCHAR"
            ))
        except Exception:
            pass


def _match_duration_seconds(match) -> float:
    if not match.created_at or not match.ended_at:
        return 0.0
    return max(0.0, (match.ended_at - match.created_at).total_seconds())


async def upsert_google_user(claims: dict) -> dict:
    """Create or update a Cipher user from Google claims. Returns public profile."""
    if not ENABLED:
        raise RuntimeError("Persistence disabled")
    from .models import CipherUser
    await init_models()
    sub = str(claims["sub"])
    name = (claims.get("name") or claims.get("email") or "Agent").strip()[:48]
    avatar = (claims.get("picture") or "").strip()[:512]
    now = datetime.now(timezone.utc)
    async with SessionLocal() as session:
        row = await session.scalar(select(CipherUser).where(CipherUser.google_sub == sub))
        if row is None:
            row = CipherUser(
                id=uuid.uuid4().hex,
                google_sub=sub,
                display_name=name,
                avatar_url=avatar,
                created_at=now,
                last_seen_at=now,
            )
            session.add(row)
        else:
            if name:
                row.display_name = name
            if avatar:
                row.avatar_url = avatar
            row.last_seen_at = now
        await session.commit()
        return _user_public(row)


def _user_public(row) -> dict:
    return {
        "id": row.id,
        "displayName": row.display_name,
        "avatarUrl": row.avatar_url or None,
    }


async def get_user(user_id: str) -> Optional[dict]:
    if not ENABLED or not user_id:
        return None
    from .models import CipherUser
    await init_models()
    async with SessionLocal() as session:
        row = await session.get(CipherUser, user_id)
        return _user_public(row) if row else None


async def touch_user(user_id: str) -> None:
    if not ENABLED or not user_id:
        return
    from .models import CipherUser
    await init_models()
    async with SessionLocal() as session:
        row = await session.get(CipherUser, user_id)
        if row:
            row.last_seen_at = datetime.now(timezone.utc)
            await session.commit()


async def save_match(snapshot: dict) -> None:
    """Persist one completed match. Best-effort: never raises."""
    if not ENABLED:
        return
    try:
        from .models import CipherMatch, CipherMatchPlayer
        await init_models()
        async with SessionLocal() as session:
            match = CipherMatch(
                id=snapshot["id"],
                room_code=snapshot["room_code"],
                created_at=snapshot["created_at"],
                ended_at=snapshot["ended_at"],
                board_size=snapshot["board_size"],
                pack_id=snapshot["pack_id"],
                pack_name=snapshot["pack_name"],
                custom_words=snapshot["custom_words"],
                turn_seconds=snapshot["turn_seconds"],
                assassins=snapshot["assassins"],
                starting_team=snapshot["starting_team"],
                winner=snapshot["winner"],
                win_reason=snapshot["win_reason"],
                rounds=snapshot["rounds"],
                red_remaining=snapshot["red_remaining"],
                blue_remaining=snapshot["blue_remaining"],
            )
            session.add(match)
            for p in snapshot["players"]:
                session.add(CipherMatchPlayer(
                    match_id=match.id, pid=p["pid"], name=p["name"],
                    team=p["team"], role=p["role"], won=p["won"],
                    user_id=p.get("user_id"),
                ))
            await session.commit()
        log.info("Cipher: saved match %s (winner=%s)",
                 snapshot["room_code"], snapshot["winner"])
    except Exception as exc:  # never let persistence break a game
        log.warning("Cipher: failed to persist match: %s", exc)


async def get_stats(limit: int = 10) -> dict:
    """Aggregate stats + recent matches for a future leaderboard/UI.
    Best-effort: returns ``{"enabled": False}`` if persistence is off or errors."""
    if not ENABLED:
        return {"enabled": False}
    try:
        from .models import CipherMatch
        await init_models()
        async with SessionLocal() as session:
            total = await session.scalar(select(func.count()).select_from(CipherMatch)) or 0
            wins_rows = (await session.execute(
                select(CipherMatch.winner, func.count())
                .group_by(CipherMatch.winner)
            )).all()
            wins = {str(w): int(n) for w, n in wins_rows if w}
            pack_rows = (await session.execute(
                select(CipherMatch.pack_name, func.count())
                .group_by(CipherMatch.pack_name)
            )).all()
            by_pack = {str(p): int(n) for p, n in pack_rows}
            assassin_n = await session.scalar(
                select(func.count()).select_from(CipherMatch)
                .where(CipherMatch.win_reason == "assassin")
            ) or 0
            recent_rows = (await session.execute(
                select(CipherMatch).order_by(CipherMatch.ended_at.desc()).limit(limit)
            )).scalars().all()
            recent = [{
                "roomCode": m.room_code,
                "winner": m.winner,
                "winReason": m.win_reason,
                "pack": m.pack_name,
                "boardSize": m.board_size,
                "endedAt": m.ended_at.isoformat() if m.ended_at else None,
            } for m in recent_rows]
        return {
            "enabled": True,
            "totalGames": int(total),
            "wins": wins,
            "byPack": by_pack,
            "assassinLosses": int(assassin_n),
            "recent": recent,
        }
    except Exception as exc:
        log.warning("Cipher: failed to read stats: %s", exc)
        return {"enabled": False}


async def get_user_stats(user_id: str) -> dict:
    """Per-user aggregates: wins, losses, records, assassin hits."""
    if not ENABLED or not user_id:
        return {"enabled": False}
    try:
        from .models import CipherMatch, CipherMatchPlayer
        await init_models()
        async with SessionLocal() as session:
            rows = (await session.execute(
                select(CipherMatchPlayer, CipherMatch)
                .join(CipherMatch, CipherMatchPlayer.match_id == CipherMatch.id)
                .where(CipherMatchPlayer.user_id == user_id)
            )).all()
        if not rows:
            return {
                "enabled": True, "games": 0, "wins": 0, "losses": 0,
                "winRate": 0, "quickestWinSecs": None, "quickestLossSecs": None,
                "assassinLosses": 0,
            }
        games = len(rows)
        wins = sum(1 for p, _ in rows if p.won)
        losses = games - wins
        quickest_win = None
        quickest_loss = None
        assassin_losses = 0
        for p, m in rows:
            dur = _match_duration_seconds(m)
            if p.won:
                quickest_win = dur if quickest_win is None else min(quickest_win, dur)
            else:
                quickest_loss = dur if quickest_loss is None else min(quickest_loss, dur)
            if not p.won and m.win_reason == "assassin":
                assassin_losses += 1
        return {
            "enabled": True,
            "games": games,
            "wins": wins,
            "losses": losses,
            "winRate": round(wins / games, 3) if games else 0,
            "quickestWinSecs": int(quickest_win) if quickest_win is not None else None,
            "quickestLossSecs": int(quickest_loss) if quickest_loss is not None else None,
            "assassinLosses": assassin_losses,
        }
    except Exception as exc:
        log.warning("Cipher: failed to read user stats: %s", exc)
        return {"enabled": False}


async def get_leaderboard(limit: int = 20) -> dict:
    if not ENABLED:
        return {"enabled": False, "leaders": []}
    try:
        from .models import CipherMatchPlayer, CipherUser
        await init_models()
        async with SessionLocal() as session:
            win_rows = (await session.execute(
                select(
                    CipherMatchPlayer.user_id,
                    func.count().label("games"),
                    func.sum(func.cast(CipherMatchPlayer.won, Integer)).label("wins"),
                )
                .where(CipherMatchPlayer.user_id.is_not(None))
                .group_by(CipherMatchPlayer.user_id)
                .order_by(func.sum(func.cast(CipherMatchPlayer.won, Integer)).desc())
                .limit(limit)
            )).all()
            leaders = []
            for uid, games, wins in win_rows:
                user = await session.get(CipherUser, uid)
                if not user:
                    continue
                wins_i = int(wins or 0)
                games_i = int(games or 0)
                leaders.append({
                    "user": _user_public(user),
                    "wins": wins_i,
                    "games": games_i,
                    "winRate": round(wins_i / games_i, 3) if games_i else 0,
                })
        return {"enabled": True, "leaders": leaders}
    except Exception as exc:
        log.warning("Cipher: failed to read leaderboard: %s", exc)
        return {"enabled": False, "leaders": []}


async def get_recent_players(user_id: str, limit: int = 15) -> dict:
    """Logged-in players you've shared a match with recently."""
    if not ENABLED or not user_id:
        return {"enabled": False, "players": []}
    try:
        from .models import CipherMatch, CipherMatchPlayer, CipherUser
        await init_models()
        async with SessionLocal() as session:
            my_rows = (await session.execute(
                select(CipherMatchPlayer.match_id, CipherMatchPlayer.team)
                .where(CipherMatchPlayer.user_id == user_id)
            )).all()
            my_by_match = {mid: team for mid, team in my_rows}
            if not my_by_match:
                return {"enabled": True, "players": []}
            rows = (await session.execute(
                select(CipherMatchPlayer, CipherMatch)
                .join(CipherMatch, CipherMatchPlayer.match_id == CipherMatch.id)
                .where(
                    CipherMatchPlayer.match_id.in_(my_by_match.keys()),
                    CipherMatchPlayer.user_id.is_not(None),
                    CipherMatchPlayer.user_id != user_id,
                )
                .order_by(CipherMatch.ended_at.desc())
            )).all()
            seen: set[str] = set()
            players = []
            for p, m in rows:
                if p.user_id in seen:
                    continue
                seen.add(p.user_id)
                user = await session.get(CipherUser, p.user_id)
                if not user:
                    continue
                my_team = my_by_match.get(p.match_id)
                players.append({
                    "user": _user_public(user),
                    "lastPlayedAt": m.ended_at.isoformat() if m.ended_at else None,
                    "wasTeammate": my_team is not None and p.team == my_team,
                })
                if len(players) >= limit:
                    break
        return {"enabled": True, "players": players}
    except Exception as exc:
        log.warning("Cipher: failed to read recent players: %s", exc)
        return {"enabled": False, "players": []}


async def get_pairings(user_id: str, limit: int = 15) -> dict:
    """Teammates you've played with most (and win rate together)."""
    if not ENABLED or not user_id:
        return {"enabled": False, "pairings": []}
    try:
        from .models import CipherMatchPlayer, CipherUser
        await init_models()
        p1 = CipherMatchPlayer.__table__.alias("p1")
        p2 = CipherMatchPlayer.__table__.alias("p2")
        async with SessionLocal() as session:
            rows = (await session.execute(
                select(
                    p2.c.user_id,
                    func.count().label("games"),
                    func.sum(
                        func.cast(p1.c.won, Integer) * func.cast(p2.c.won, Integer)
                    ).label("wins_together"),
                )
                .select_from(p1.join(p2, (p1.c.match_id == p2.c.match_id) & (p1.c.team == p2.c.team) & (p1.c.id != p2.c.id)))
                .where(p1.c.user_id == user_id, p2.c.user_id.is_not(None))
                .group_by(p2.c.user_id)
                .order_by(
                    func.sum(func.cast(p1.c.won, Integer) * func.cast(p2.c.won, Integer)).desc(),
                    func.count().desc(),
                )
                .limit(limit)
            )).all()
            pairings = []
            for uid, games, wins_together in rows:
                user = await session.get(CipherUser, uid)
                if not user:
                    continue
                games_i = int(games or 0)
                wins_i = int(wins_together or 0)
                pairings.append({
                    "user": _user_public(user),
                    "gamesTogether": games_i,
                    "winsTogether": wins_i,
                    "winRate": round(wins_i / games_i, 3) if games_i else 0,
                })
        return {"enabled": True, "pairings": pairings}
    except Exception as exc:
        log.warning("Cipher: failed to read pairings: %s", exc)
        return {"enabled": False, "pairings": []}


async def list_friends(user_id: str) -> dict:
    if not ENABLED or not user_id:
        return {"enabled": False, "friends": []}
    try:
        from .models import CipherFriend, CipherUser
        await init_models()
        async with SessionLocal() as session:
            rows = (await session.execute(
                select(CipherFriend).where(CipherFriend.user_id == user_id)
                .order_by(CipherFriend.created_at.desc())
            )).scalars().all()
            friends = []
            for link in rows:
                user = await session.get(CipherUser, link.friend_id)
                if user:
                    friends.append(_user_public(user))
        return {"enabled": True, "friends": friends}
    except Exception as exc:
        log.warning("Cipher: failed to list friends: %s", exc)
        return {"enabled": False, "friends": []}


async def add_friend(user_id: str, friend_id: str) -> dict:
    if not ENABLED or not user_id or not friend_id:
        return {"ok": False}
    if user_id == friend_id:
        return {"ok": False, "error": "Can't friend yourself."}
    try:
        from .models import CipherFriend, CipherUser
        await init_models()
        async with SessionLocal() as session:
            if await session.get(CipherUser, friend_id) is None:
                return {"ok": False, "error": "User not found."}
            exists = await session.scalar(
                select(CipherFriend).where(
                    CipherFriend.user_id == user_id,
                    CipherFriend.friend_id == friend_id,
                )
            )
            if exists is None:
                session.add(CipherFriend(
                    id=uuid.uuid4().hex,
                    user_id=user_id,
                    friend_id=friend_id,
                    created_at=datetime.now(timezone.utc),
                ))
                await session.commit()
        return {"ok": True}
    except Exception as exc:
        log.warning("Cipher: failed to add friend: %s", exc)
        return {"ok": False, "error": "Could not add friend."}


async def remove_friend(user_id: str, friend_id: str) -> dict:
    if not ENABLED or not user_id or not friend_id:
        return {"ok": False}
    try:
        from .models import CipherFriend
        await init_models()
        async with SessionLocal() as session:
            row = await session.scalar(
                select(CipherFriend).where(
                    CipherFriend.user_id == user_id,
                    CipherFriend.friend_id == friend_id,
                )
            )
            if row:
                await session.delete(row)
                await session.commit()
        return {"ok": True}
    except Exception as exc:
        log.warning("Cipher: failed to remove friend: %s", exc)
        return {"ok": False}
