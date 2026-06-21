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
from typing import Any, Optional

from sqlalchemy import func, select
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
        _initialised = True


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
