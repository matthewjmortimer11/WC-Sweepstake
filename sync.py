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
from models import Fixture, League
from provider import CanonicalFixture

log = logging.getLogger(__name__)

# ── In-memory caches, one per tournament ─────────────────────────────────────
# Leagues can be for different competitions, so each tournament keeps its own
# fixtures and its own sync health. Read them through fixtures_for()/status_for()
# rather than touching these dicts.
_caches: dict[str, list[dict]] = {}
_statuses: dict[str, dict[str, Any]] = {}

# The deployment default, set by main.py at startup. The legacy module globals
# below mirror this tournament so existing readers keep working unchanged.
default_tournament_id: str = ""

# Legacy view of the DEFAULT tournament's cache. qualification/ reads these
# directly and is inherently about World Cup qualifying, so it does not need to
# become tournament-aware; mirroring keeps it correct without touching it.
fixture_cache: list[dict] = []
# Bumped on every cache rebuild so hot-path readers (e.g. qualification API)
# can invalidate their own derived caches without hashing fixture rows.
fixture_cache_revision: int = 0

_ADAPTER_NAME = "mock"


def _new_status() -> dict[str, Any]:
    return {
        "adapter": _ADAPTER_NAME,
        "lastSyncAt": None,
        "lastError": None,
        "fixtureCount": 0,
        "sleepSeconds": 3600,
        "cacheRevision": 0,
    }


# Read by main.py for organiser/admin health UI. Kept as the DEFAULT
# tournament's status so existing readers are unaffected.
sync_status: dict[str, Any] = _new_status()


def status_for(tournament_id: str) -> dict[str, Any]:
    """Sync health for one tournament (never None — an unsynced tournament
    reports an empty, error-free status rather than the default's)."""
    if tournament_id and tournament_id == default_tournament_id:
        return sync_status
    return _statuses.get(tournament_id) or _new_status()


def fixtures_for(tournament_id: str) -> list[dict]:
    """Live fixtures for one tournament, or [] if it has none cached.

    Callers fall back to the tournament's own generated fixtures on []. A
    tournament with no sync loop running never borrows another's fixtures.
    """
    if not tournament_id:
        return []
    return _caches.get(tournament_id) or []


def set_sync_adapter(name: str) -> None:
    """Record which provider adapter is in use. One adapter type serves every
    tournament, so this applies to all statuses, present and future."""
    global _ADAPTER_NAME
    _ADAPTER_NAME = name
    sync_status["adapter"] = name
    for st in _statuses.values():
        st["adapter"] = name

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


def _rebuild_cache(fixtures: list[CanonicalFixture], tournament_id: str) -> None:
    """Sort fixtures by (dateISO, time) and repopulate one tournament's cache."""
    global fixture_cache, fixture_cache_revision
    frontend = [_to_frontend(f) for f in fixtures]
    frontend.sort(key=lambda d: (d["dateISO"], d["time"]))
    _caches[tournament_id] = frontend

    status = _statuses.setdefault(tournament_id, _new_status())
    status["fixtureCount"] = len(frontend)
    status["cacheRevision"] = status.get("cacheRevision", 0) + 1

    # Mirror the default tournament into the legacy globals for qualification/
    # and the admin health UI, which read them directly.
    if tournament_id == default_tournament_id:
        fixture_cache = frontend
        fixture_cache_revision += 1
        sync_status["fixtureCount"] = len(frontend)
        sync_status["cacheRevision"] = fixture_cache_revision


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
            "stage": stmt.excluded.stage,
            "group_name": stmt.excluded.group_name,
            "matchday": stmt.excluded.matchday,
            "home_team": stmt.excluded.home_team,
            "away_team": stmt.excluded.away_team,
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
    _rebuild_cache(canonical, tournament_id)
    status_for(tournament_id)["lastSyncAt"] = datetime.now(tz=timezone.utc).isoformat()
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
    status = _statuses.setdefault(tournament_id, _new_status())
    if tournament_id == default_tournament_id:
        status = sync_status

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

            await _load_from_db(tournament_id)

            sleep_seconds = _next_sleep(fixtures)
            status["lastSyncAt"] = datetime.now(tz=timezone.utc).isoformat()
            status["lastError"] = None
            status["sleepSeconds"] = sleep_seconds
            log.info(
                "Cache updated (%d fixtures). Next sync in %ds.",
                len(fixtures), sleep_seconds,
            )

        except asyncio.CancelledError:
            log.info("Sync worker cancelled — shutting down.")
            raise
        except Exception as exc:
            status["lastError"] = str(exc)
            log.error("[%s] sync error: %s — retrying in %ds", tournament_id, exc, sleep_seconds)

        try:
            await asyncio.sleep(sleep_seconds)
        except asyncio.CancelledError:
            log.info("Sync worker cancelled during sleep — shutting down.")
            raise


# ── Supervisor: one sync loop per tournament in use ──────────────────────────

async def tournaments_in_use(default_id: str) -> set[str]:
    """Tournaments worth polling: the deployment default, plus any a league
    actually plays.

    Deliberately NOT every configured tournament — a config file nobody has
    created a league against should not burn provider quota. The default is
    always included because it backs the pre-league landing payload.
    """
    ids = {default_id} if default_id else set()
    try:
        async with AsyncSessionLocal() as session:
            rows = await session.execute(select(League.tournament_id).distinct())
            ids.update(t for t in rows.scalars().all() if t)
    except Exception as exc:
        # A DB blip must not kill the supervisor; the default keeps syncing.
        log.warning("Could not list tournaments in use: %s", exc)
    return ids


async def start_all_syncs(make_worker, default_id: str, poll_seconds: int = 300) -> None:
    """Run a sync loop per tournament in use, adding loops as leagues appear.

    `make_worker(tournament_id)` returns `(adapter, comp_code)`, or None if the
    tournament has no usable config — main.py owns that, so this module needs
    no tournament-config knowledge.

    Re-checks periodically because a league for a new competition can be created
    at any time; a tournament that gains its first league starts syncing within
    one poll rather than at the next deploy. Loops are never stopped: a league
    on that tournament almost certainly still exists, and an idle loop costs one
    request an hour.
    """
    global default_tournament_id
    default_tournament_id = default_id
    workers: dict[str, asyncio.Task] = {}
    try:
        while True:
            for tid in sorted(await tournaments_in_use(default_id)):
                existing = workers.get(tid)
                if existing is not None and not existing.done():
                    continue
                if existing is not None:
                    # A finished task means the loop raised out; log and restart.
                    exc = existing.exception() if not existing.cancelled() else None
                    if exc:
                        log.error("Sync worker for %s died (%s) — restarting", tid, exc)
                spec = make_worker(tid)
                if spec is None:
                    log.warning("No sync config for tournament %s — skipping", tid)
                    continue
                adapter, comp_code = spec
                workers[tid] = asyncio.create_task(start_sync(adapter, tid, comp_code))
                log.info("Started sync worker for %s (%s)", tid, comp_code)
            await asyncio.sleep(poll_seconds)
    except asyncio.CancelledError:
        for task in workers.values():
            task.cancel()
        for task in workers.values():
            try:
                await task
            except (asyncio.CancelledError, Exception):
                pass
        raise
