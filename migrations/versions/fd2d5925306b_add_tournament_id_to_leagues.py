"""add tournament_id to leagues

Binds each league to a competition. Before this, the active tournament was a
process-wide env var, so one deployment served exactly one competition.

Revision ID: fd2d5925306b
Revises: add0bdb6c9a7
Create Date: 2026-08-13 20:00:23.900607

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fd2d5925306b'
down_revision: Union[str, Sequence[str], None] = 'add0bdb6c9a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Every league that exists today predates multi-tournament support, so it is by
# definition a World Cup 2026 league.
_BACKFILL = "world-cup-2026"


def upgrade() -> None:
    # NOTE: autogenerate proposed a plain NOT NULL add with no default, which
    # fails outright on a table that already has rows — and `leagues` does, in
    # production. The model's `default=` is applied by SQLAlchemy on INSERT; it
    # creates no database default and backfills nothing.
    #
    # So: add WITH a server_default (which backfills existing rows atomically),
    # then drop the default so the application stays the single source of truth
    # for new rows rather than the database quietly supplying one.
    with op.batch_alter_table("leagues", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "tournament_id",
                sa.String(),
                nullable=False,
                server_default=_BACKFILL,
            )
        )
        batch_op.create_index(
            batch_op.f("ix_leagues_tournament_id"), ["tournament_id"], unique=False
        )

    with op.batch_alter_table("leagues", schema=None) as batch_op:
        batch_op.alter_column("tournament_id", server_default=None)


def downgrade() -> None:
    with op.batch_alter_table("leagues", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_leagues_tournament_id"))
        batch_op.drop_column("tournament_id")
