"""
Sync worker — polls the provider adapter and keeps the in-memory fixture
cache warm. main.py reads `fixture_cache` directly; no queue, no DB round-trip
on every request.

Persistence flow:
  1. On startup  → load existing rows from Postgres into cache (_load_from_db)
  2. Each cycle  → fetch from provider → upsert to Postgres → rebuild cache
  3. Sleep       → 60 s if any live fixture, 3600 s otherwise, 300 s on error
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert

from db import AsyncSessionLocal, engine
from models import Fixture
from provider import CanonicalFixture

log = logging.getLogger(__name__)

# ── In-memory cache (read by main.py's _state()) ─────────────────────────────
fixture_cache: list[dict] = []
# Bumped on every cache rebuild so hot-path readers (e.g. qualification API)
# can invalidate their own derived caches without hashing fixture rows.
fixture_cache_revision: int = 0

# ── Date/time helpers ─────────────────────────────────────────────────────────
_BST = timedelta(hours=1)
_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


def _fmt(kickoff_utc: datetime) -> tuple[str, str, str]:
    """Convert a UTC-aware datetime to BST and return (dateISO, dateLabel, time)."""
    bst = kickoff_utc.astimezone(timezone(timedelta(hours=1)))
    date_iso = bst.date().isoformat()
    date_label = f"{_DOW[bst.weekday()]} {bst.day} {_MON[bst.month - 1]}"
    time_str = bst.strftime("%H:%M")
    return date_iso, date_label, time_str


def _to_frontend(f: CanonicalFixture) -> dict[str, Any]:
    """Convert a CanonicalFixture to the frontend-ready dict format."""
    date_iso, date_label, time_str = _fmt(f.kickoff_utc)
    score = None
    if f.home_goals is not None and f.away_goals is not None:
        score = [f.home_goals, f.away_goals]
    return {
        "id": f.id,
        "group": f.group_name,
        "matchday": f.matchday,
        "stage": f.stage,
        "a": f.home_team,
        "b": f.away_team,
        "dateISO": date_iso,
        "dateLabel": date_label,
        "time": time_str,
        "venue": f.venue,
        "status": f.status,
        "score": score,
        # winner (HOME/AWAY/DRAW) preserved so the rules engine can resolve
        # knockout ties decided on penalties, where full-time score is level.
        "winner": f.winner,
        "afterExtraTime": f.after_extra_time,
        "updatedAt": f.last_updated.isoformat() if f.last_updated else None,
    }


def _next_sleep(fixtures: list[CanonicalFixture]) -> int:
    """Decide how long to wait before the next poll.

      60 s  — a match is live now, or kicks off within the next 20 min
              (so we catch the upcoming→live transition promptly).
      900 s — more matches still to come within ~12 h (tournament day).
      3600 s— nothing imminent (quiet period / off-season).
    """
    now = datetime.now(tz=timezone.utc)
    if any(f.status in ("live", "halfTime") for f in fixtures):
        return 60
    soon = now + timedelta(minutes=20)
    if any(f.status == "upcoming" and now <= f.kickoff_utc <= soon for f in fixtures):
        return 60
    today = now + timedelta(hours=12)
    if any(f.status == "upcoming" and now <= f.kickoff_utc <= today for f in fixtures):
        return 900
    return 3600


def _rebuild_cache(fixtures: list[CanonicalFixture]) -> None:
    """Sort fixtures by (dateISO, time) and repopulate fixture_cache."""
    global fixture_cache, fixture_cache_revision
    frontend = [_to_frontend(f) for f in fixtures]
    frontend.sort(key=lambda d: (d["dateISO"], d["time"]))
    fixture_cache = frontend
    fixture_cache_revision += 1


async def _upsert(fixtures: list[CanonicalFixture], session) -> None:
    """INSERT … ON CONFLICT DO UPDATE for all fixtures, then rebuild cache."""
    if not fixtures:
        return

    now = datetime.now(tz=timezone.utc)
    rows = [
        {
            "id": f.id,
            "tournament_id": f.tournament_id,
            "stage": f.stage,
            "group_name": f.group_name,
            "matchday": f.matchday,
            "home_team": f.home_team,
            "away_team": f.away_team,
            "kickoff_utc": f.kickoff_utc,
            "venue": f.venue,
            "status": f.status,
            "home_goals": f.home_goals,
            "away_goals": f.away_goals,
            "winner": f.winner,
            "after_extra_time": f.after_extra_time,
            "last_updated": now,
        }
        for f in fixtures
    ]

    stmt = pg_insert(Fixture).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["id"],
        set_={
            "status": stmt.excluded.status,
            "home_goals": stmt.excluded.home_goals,
            "away_goals": stmt.excluded.away_goals,
            "winner": stmt.excluded.winner,
            "kickoff_utc": stmt.excluded.kickoff_utc,
            "venue": stmt.excluded.venue,
            "after_extra_time": stmt.excluded.after_extra_time,
            "last_updated": stmt.excluded.last_updated,
        },
    )
    await session.execute(stmt)
    await session.commit()
    _rebuild_cache(fixtures)


async def _load_from_db(tournament_id: str) -> None:
    """Load all fixtures for tournament_id from DB into cache on startup."""
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(Fixture).where(Fixture.tournament_id == tournament_id)
        )
        rows: list[Fixture] = result.scalars().all()

    if not rows:
        log.info("No fixtures in DB for %s — cache stays empty until first sync", tournament_id)
        return

    canonical = [
        CanonicalFixture(
            id=r.id,
            tournament_id=r.tournament_id,
            stage=r.stage,
            group_name=r.group_name,
            matchday=r.matchday,
            home_team=r.home_team,
            away_team=r.away_team,
            kickoff_utc=r.kickoff_utc,
            venue=r.venue,
            status=r.status,
            home_goals=r.home_goals,
            away_goals=r.away_goals,
            winner=r.winner,
            after_extra_time=r.after_extra_time,
            last_updated=r.last_updated,
        )
        for r in rows
    ]
    _rebuild_cache(canonical)
    log.info("Loaded %d fixtures from DB into cache for %s", len(canonical), tournament_id)


async def start_sync(adapter, tournament_id: str, comp_code: str) -> None:
    """
    Async sync loop. Intended to run as a background asyncio task.

    Flow per cycle:
      1. Fetch fixtures from the adapter.
      2. Upsert to Postgres + rebuild in-memory cache.
      3. Sleep 60 s (live), 3600 s (quiet), 300 s (error).
    """
    log.info("Sync worker starting for %s (%s)", tournament_id, comp_code)

    # Warm the cache from DB so we're never empty between restarts.
    try:
        await _load_from_db(tournament_id)
    except Exception as exc:
        log.warning("Could not pre-load cache from DB: %s", exc)

    while True:
        sleep_seconds = 300  # default on error
        try:
            log.info("Fetching fixtures from adapter …")
            fixtures = await adapter.get_fixtures(tournament_id, comp_code)
            log.info("Received %d fixtures", len(fixtures))

            async with AsyncSessionLocal() as session:
                await _upsert(fixtures, session)

            sleep_seconds = _next_sleep(fixtures)
            log.info(
                "Cache updated (%d fixtures). Next sync in %ds.",
                len(fixtures), sleep_seconds,
            )

        except asyncio.CancelledError:
            log.info("Sync worker cancelled — shutting down.")
            raise
        except Exception as exc:
            log.error("Sync error: %s — retrying in %ds", exc, sleep_seconds)

        try:
            await asyncio.sleep(sleep_seconds)
        except asyncio.CancelledError:
            log.info("Sync worker cancelled during sleep — shutting down.")
            raise
