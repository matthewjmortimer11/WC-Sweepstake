#!/usr/bin/env python3
"""Bring the database schema up to date. Safe to run on every deploy.

Handles the three states a database can be in:

  1. Fresh/empty          → run every migration from scratch.
  2. Already under Alembic → run whatever is outstanding.
  3. Pre-Alembic (live)    → the existing production database, whose schema was
                             built by `create_all` plus the hand-written
                             ALTER TABLE list that used to live in main.py.
                             Its schema already matches the initial migration,
                             so it is *stamped* rather than re-created — which
                             would otherwise fail on "table already exists".

Case 3 happens exactly once per database. After that it is case 2 forever.

Run:  python scripts/db_upgrade.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from alembic import command  # noqa: E402
from alembic.config import Config  # noqa: E402
from sqlalchemy import inspect  # noqa: E402

from db import DATABASE_URL, engine  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent

# A table that exists in every pre-Alembic deployment. If this is present but
# alembic_version is not, we are adopting an existing database.
_SENTINEL_TABLE = "leagues"

# The revision whose schema an adopted database already matches. Stamp THIS, not
# "head": stamping head would mark every later migration as applied too, so a
# database adopted after further migrations exist would silently skip them.
_INITIAL_REVISION = "add0bdb6c9a7"


async def _inspect_state() -> tuple[bool, bool]:
    """Return (has_alembic_version, has_existing_schema)."""
    async with engine.connect() as conn:
        names = await conn.run_sync(lambda c: inspect(c).get_table_names())
    return "alembic_version" in names, _SENTINEL_TABLE in names


def main() -> int:
    versioned, existing = asyncio.run(_inspect_state())

    cfg = Config(str(ROOT / "alembic.ini"))
    cfg.set_main_option("script_location", str(ROOT / "migrations"))

    if not versioned and existing:
        print(
            f"Adopting pre-Alembic database ({DATABASE_URL.split('@')[-1]}): "
            "stamping initial schema, then applying any later migrations."
        )
        command.stamp(cfg, _INITIAL_REVISION)
    elif not versioned:
        print("Fresh database — creating schema from migrations.")
    else:
        print("Database already under Alembic — applying outstanding migrations.")

    command.upgrade(cfg, "head")
    print("Schema up to date.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
