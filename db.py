"""
Database engine + session factory.

Uses SQLAlchemy 2.0 async, backed by asyncpg. The DATABASE_URL env var must
point at a PostgreSQL database. Heroku-style `postgres://` and plain
`postgresql://` URLs are both normalised to `postgresql+asyncpg://`.
"""

import os

from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

_RAW_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://localhost/wheesht",
)

# Normalise driver prefix so asyncpg is always used.
def _normalise(url: str) -> str:
    if url.startswith("postgres://"):
        return "postgresql+asyncpg://" + url[len("postgres://"):]
    if url.startswith("postgresql://"):
        return "postgresql+asyncpg://" + url[len("postgresql://"):]
    return url


DATABASE_URL = _normalise(_RAW_URL)

# Production runs on Postgres (asyncpg). The test suite (and any SQLite-backed
# deployment) swaps in a file-backed SQLite database, where two concurrent
# writers — e.g. a fire-and-forget background task overlapping a request — can
# raise "database is locked". A busy timeout alone can't fix it: when two
# connections each hold a SHARED lock and both try to upgrade to write, SQLite
# deadlocks and fails *immediately* rather than waiting. The robust fix is WAL
# journal mode — one writer plus many readers, with no shared-lock upgrade, so
# the busy timeout can do its job and a brief overlap waits instead of erroring.
# None of this touches Postgres.
_IS_SQLITE = DATABASE_URL.startswith("sqlite")
_connect_args: dict = {"timeout": 30} if _IS_SQLITE else {}

engine = create_async_engine(
    DATABASE_URL, pool_pre_ping=True, echo=False, connect_args=_connect_args
)

if _IS_SQLITE:
    @event.listens_for(engine.sync_engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record):  # pragma: no cover - driver setup
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.close()

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass
