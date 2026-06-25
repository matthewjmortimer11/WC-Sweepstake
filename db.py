"""
Database engine + session factory.

Uses SQLAlchemy 2.0 async, backed by asyncpg. The DATABASE_URL env var must
point at a PostgreSQL database. Heroku-style `postgres://` and plain
`postgresql://` URLs are both normalised to `postgresql+asyncpg://`.
"""

import os

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

# Production runs on Postgres (asyncpg). The test suite swaps in a file-backed
# SQLite database, where two concurrent writers (e.g. a fire-and-forget background
# task overlapping a request) can raise an intermittent "database is locked".
# Give SQLite a busy timeout so a brief write overlap waits rather than erroring.
# No effect on Postgres.
_connect_args: dict = {"timeout": 30} if DATABASE_URL.startswith("sqlite") else {}

engine = create_async_engine(
    DATABASE_URL, pool_pre_ping=True, echo=False, connect_args=_connect_args
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass
