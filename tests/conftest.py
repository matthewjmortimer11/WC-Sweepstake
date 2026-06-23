"""Shared fixtures for the security suite.

The app builds its database engine at import time from ``DATABASE_URL``, so the
environment is configured here *before* importing ``main``/``db``. By default the
suite runs against a throwaway file-backed SQLite database so it works anywhere;
set ``TEST_DATABASE_URL`` to a real Postgres URL to exercise the production
driver. ``TEST_DATABASE_URL`` must never point at production data.
"""

import os
import sys
import tempfile
import uuid
from pathlib import Path

import pytest
import pytest_asyncio

# A fixed signing secret so issued admin/account/session tokens verify for the
# whole run (otherwise a random per-import secret would invalidate them).
os.environ.setdefault("WC_ADMIN_SECRET", "test-secret-do-not-use-in-prod")
# Keep the dev console disabled unless a test opts in.
os.environ.setdefault("WC_DEV_KEY", "")

_TEST_DB = os.environ.get("TEST_DATABASE_URL")
if _TEST_DB:
    os.environ["DATABASE_URL"] = _TEST_DB
    _SQLITE_FILE = None
else:
    _SQLITE_FILE = Path(tempfile.gettempdir()) / f"wheesht_test_{uuid.uuid4().hex}.db"
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_SQLITE_FILE}"

# Make the project root importable when pytest is run from anywhere.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import main  # noqa: E402
from db import Base, engine  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402

# Cipher keeps its own module-global async engine (codenames/store.py). By default
# it falls back to DATABASE_URL — the *same* SQLite file as the sweepstake engine.
# That, combined with Cipher's fire-and-forget match-persist tasks (scheduled on
# game end), means two writers can hit one SQLite file at once and raise an
# intermittent "database is locked". For the test session, point Cipher at its own
# SQLite file (no cross-engine contention) and give it a generous busy timeout so a
# brief write overlap waits rather than erroring. NullPool keeps each connection
# loop-local under pytest-asyncio. Test-only; production keeps its pooled engine.
from codenames import store as _cipher_store  # noqa: E402

if _cipher_store.ENABLED and not _TEST_DB:
    from sqlalchemy.ext.asyncio import async_sessionmaker as _async_sessionmaker  # noqa: E402
    from sqlalchemy.ext.asyncio import create_async_engine as _create_async_engine  # noqa: E402
    from sqlalchemy.pool import NullPool  # noqa: E402

    _cipher_file = Path(tempfile.gettempdir()) / f"cipher_test_{uuid.uuid4().hex}.db"
    _cipher_store.DATABASE_URL = f"sqlite+aiosqlite:///{_cipher_file}"
    _cipher_store.engine = _create_async_engine(
        _cipher_store.DATABASE_URL, poolclass=NullPool, connect_args={"timeout": 30},
    )
    _cipher_store.SessionLocal = _async_sessionmaker(_cipher_store.engine, expire_on_commit=False)
    _cipher_store._initialised = False


@pytest.fixture(autouse=True)
def _clear_party_rate_buckets():
    """Party-game routers share global create/WS buckets — reset each test."""
    from party import ratelimit as _party_rl
    _party_rl._CREATE_BUCKETS.clear()
    _party_rl._WS_BUCKETS.clear()
    yield
    _party_rl._CREATE_BUCKETS.clear()
    _party_rl._WS_BUCKETS.clear()


@pytest_asyncio.fixture
async def client():
    """A fresh schema per test, driving the ASGI app in-process.

    The fixture mirrors production startup closely: it seeds the configured
    "office" (OI) league the way the app's lifespan does, and clears the
    process-global rate-limit buckets so one test's failed-auth attempts can't
    leak a 429 into the next (the ASGI transport never runs the real lifespan).
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    # Reset the in-memory rate limiter for test isolation.
    main._RATE_BUCKETS.clear()
    from party import ratelimit as _party_rl
    _party_rl._CREATE_BUCKETS.clear()
    _party_rl._WS_BUCKETS.clear()
    # Seed the config league (no network; legacy JSON files are absent in CI).
    await main._seed_and_migrate()
    transport = ASGITransport(app=main.app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as c:
        yield c
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


def _rand_code(prefix: str = "T") -> str:
    return (prefix + uuid.uuid4().hex[:6]).upper()[:12]


async def make_league(client, name="Test League", password="memberpw", organiser="secretcode"):
    """Create a league and return its handle (code, name, organiser admin token)."""
    code = _rand_code()
    r = await client.post("/api/leagues", json={
        "name": name, "code": code, "password": password, "organiserCode": organiser,
    })
    assert r.status_code == 200, r.text
    data = r.json()
    return {
        "code": data["league"]["code"],
        "name": data["league"]["name"],
        "adminToken": data["adminToken"],
        "password": password,
        "organiser": organiser,
    }


async def add_participant(client, code, name="Alice"):
    """Add an open (unclaimed) entry; returns its id and issued session token."""
    pid = uuid.uuid4().hex[:12]
    r = await client.post(f"/api/leagues/{code}/participants", json={
        "id": pid, "name": name, "leagueCode": code,
    })
    assert r.status_code == 200, r.text
    j = r.json()
    return {"id": pid, "name": name, "sessionToken": j.get("sessionToken")}
