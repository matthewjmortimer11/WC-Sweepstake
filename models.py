"""
SQLAlchemy 2.0 ORM models.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from db import Base


class Fixture(Base):
    """One match from the provider, stored for offline resilience + diff checks."""

    __tablename__ = "fixtures"

    # Provider's own id (e.g. "123456" from football-data.org).
    id: Mapped[str] = mapped_column(String, primary_key=True)

    tournament_id: Mapped[str] = mapped_column(String, nullable=False, index=True)

    # Stage codes mirror the TOML stage_ladder values.
    stage: Mapped[str] = mapped_column(String, nullable=False)  # group|r32|r16|qf|sf|final

    # Group A–L (null for knockout rounds).
    group_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    matchday: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Three-letter codes matching the TOML [[teams]] entries.
    home_team: Mapped[str] = mapped_column(String, nullable=False)
    away_team: Mapped[str] = mapped_column(String, nullable=False)

    kickoff_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    venue: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # upcoming | live | done | cancelled
    status: Mapped[str] = mapped_column(String, nullable=False, default="upcoming")

    home_goals: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    away_goals: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # HOME | AWAY | DRAW (null while match is not yet done).
    winner: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    after_extra_time: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    last_updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

