"""Alembic environment.

Schema source of truth is `Base.metadata` in db.py (the sweepstake models in
models.py). The Cipher game keeps its own `CipherBase` registry and its own
create_all in codenames/store.py — deliberately NOT managed here.

The database URL always comes from db.py, so Alembic and the app can never
disagree about which database they are pointed at (alembic.ini carries no URL).
"""

import asyncio
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# Importing db gives us the normalised DATABASE_URL; importing models registers
# every table on Base.metadata so autogenerate can see them.
from db import DATABASE_URL, Base
import models  # noqa: F401  (import for side effect: table registration)

config = context.config
config.set_main_option("sqlalchemy.url", DATABASE_URL.replace("%", "%%"))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _include_object(obj, name, type_, reflected, compare_to):
    """Keep Cipher's separately-managed tables out of autogenerate diffs.

    codenames/store.py owns those tables via CipherBase.metadata.create_all, and
    they may live in a different database entirely. Without this filter every
    autogenerate would propose dropping them.
    """
    if type_ == "table" and reflected and name not in target_metadata.tables:
        return False
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_object=_include_object,
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        include_object=_include_object,
        # SQLite cannot ALTER most columns; batch mode rewrites the table
        # instead. Harmless on Postgres, essential for local SQLite runs.
        render_as_batch=connection.dialect.name == "sqlite",
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


def run_migrations_online() -> None:
    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
