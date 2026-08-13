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
    # So: add WITH a server_default, which backfills existing rows atomically.
    #
    # The default is KEPT rather than dropped afterwards. Dropping it would make
    # the application the only source of the value, which is tidier — but it
    # also makes the release one-way: rolled back to the previous version, the
    # old code knows nothing about this column and every league INSERT would
    # fail on a NOT NULL with no default. Keeping it means an older release
    # still writes valid rows (as World Cup leagues, which is what they were).
    # The application supplies the value in practice; this is a safety net for
    # the rollback path, not the normal one.
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


def downgrade() -> None:
    with op.batch_alter_table("leagues", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_leagues_tournament_id"))
        batch_op.drop_column("tournament_id")
