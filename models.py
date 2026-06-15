"""
SQLAlchemy 2.0 ORM models.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, LargeBinary, String
from sqlalchemy.types import JSON
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

    # upcoming | live | halfTime | done | cancelled
    status: Mapped[str] = mapped_column(String, nullable=False, default="upcoming")

    home_goals: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    away_goals: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # HOME | AWAY | DRAW (null while match is not yet done).
    winner: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    after_extra_time: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    last_updated: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class League(Base):
    """A sweepstake league — an isolated group with its own entrants, chat,
    results and prediction answers. Fixtures stay global (everyone shares the
    same World Cup), but everything human is scoped to a league."""

    __tablename__ = "leagues"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # uuid hex
    # Join code people type at sign-up. Stored uppercased; unique across the app.
    code: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    slug: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # Salted PBKDF2 hash ("algo$iterations$salt$hash") — never plaintext.
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    # Seeded leagues reveal a pre-assigned roster (from tournament config) at
    # join time instead of doing a fresh random draw.
    seeded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Participant(Base):
    """One entrant, always belonging to exactly one league."""

    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    league_id: Mapped[str] = mapped_column(
        String, ForeignKey("leagues.id"), nullable=False, index=True
    )

    name: Mapped[str] = mapped_column(String, nullable=False)
    initials: Mapped[str] = mapped_column(String, nullable=False, default="")
    department: Mapped[str] = mapped_column(String, nullable=False, default="")
    location: Mapped[str] = mapped_column(String, nullable=False, default="London")
    city: Mapped[str] = mapped_column(String, nullable=False, default="London")
    gender: Mapped[str] = mapped_column(String, nullable=False, default="—")
    team: Mapped[str] = mapped_column(String, nullable=False, default="")
    color: Mapped[str] = mapped_column(String, nullable=False, default="#E8272A")
    stage: Mapped[str] = mapped_column(String, nullable=False, default="")

    lt_member: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    leadership: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    alive: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    # True for entries claimed from a seeded roster (vs self-signups).
    is_oi: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # The first entrant in a fresh league is its organiser (admin tools).
    is_organiser: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    picks: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    custom_fields: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    pred_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    joined_at: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    # Optional per-account password (salted PBKDF2 hash, never plaintext). NULL =
    # an open account (the default "just tap who you are" behaviour). When set, it
    # locks taking over / resuming the account on a new device and gates writes to
    # this entry (a sign-in token, obtained once, then reused frictionlessly).
    #
    # NOTE: this column is added to the already-shipped `participants` table, so
    # create_all will not add it — main._ensure_schema() runs an idempotent
    # ALTER TABLE ... ADD COLUMN IF NOT EXISTS at startup.
    password_hash: Mapped[Optional[str]] = mapped_column(String, nullable=True)

    # Tombstone for a seeded roster entry the organiser has removed. Seeded base
    # entries come from config and have no natural DB row to delete, so removal
    # is recorded as a row with removed=True that hides the config entry.
    removed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class ChatMessage(Base):
    """A chat message on a league's wall."""

    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    league_id: Mapped[str] = mapped_column(
        String, ForeignKey("leagues.id"), nullable=False, index=True
    )
    author_id: Mapped[str] = mapped_column(String, nullable=False)
    author: Mapped[str] = mapped_column(String, nullable=False)
    initials: Mapped[str] = mapped_column(String, nullable=False, default="?")
    color: Mapped[str] = mapped_column(String, nullable=False, default="#333")
    team: Mapped[str] = mapped_column(String, nullable=False, default="")
    text: Mapped[str] = mapped_column(String, nullable=False)
    ts: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)


class Profile(Base):
    """Light, fast-to-read profile metadata for one participant: their chosen
    favourite team, which avatar source is in use, and an integer version bumped
    on every avatar change (used purely for cache-busting the image URL).

    The avatar *bytes* live separately in ProfileAsset so this row stays cheap to
    list. Both are NEW tables, so they are created cleanly by
    Base.metadata.create_all — no column migration on the existing
    `participants` table is required (create_all never ALTERs)."""

    __tablename__ = "profiles"

    participant_id: Mapped[str] = mapped_column(String, primary_key=True)
    league_id: Mapped[str] = mapped_column(
        String, ForeignKey("leagues.id"), nullable=False, index=True
    )
    # Editable alias shown everywhere user-facing. The participant's original full
    # name (config roster for seeded entries, onboarding name otherwise) is NEVER
    # overwritten — it stays on Participant as the organiser's base. Empty here
    # means "fall back to the base name".
    #
    # NOTE: `profiles` shipped a deploy earlier WITHOUT this column, so for an
    # already-created table create_all will not add it. main._ensure_schema()
    # runs an idempotent ALTER TABLE ... ADD COLUMN IF NOT EXISTS at startup.
    display_name: Mapped[str] = mapped_column(String, nullable=False, default="")
    # Three-letter team code the entrant *supports* (distinct from the team they
    # were drawn). Empty until they pick one.
    favourite_team: Mapped[str] = mapped_column(String, nullable=False, default="")
    # upload | google | generated   (generated = initials fallback, no asset row)
    avatar_source: Mapped[str] = mapped_column(String, nullable=False, default="")
    # Google Identity subject ID — set when the entry is linked to a Google account.
    # Indexed for the cross-device login lookup (one per participant per league).
    # NOTE: added after `profiles` table shipped; migrated via _ensure_schema().
    google_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    avatar_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class ProfileAsset(Base):
    """The avatar image bytes for one participant, stored directly in Postgres.

    Railway containers are ephemeral (disk is wiped on every redeploy), so the
    database is the only durable home for these. Images are resized/cropped on
    the client before upload, so each row is a small (~tens of KB) square — well
    within a comfortable budget even for a few hundred entrants."""

    __tablename__ = "profile_assets"

    participant_id: Mapped[str] = mapped_column(String, primary_key=True)
    league_id: Mapped[str] = mapped_column(
        String, ForeignKey("leagues.id"), nullable=False, index=True
    )
    content_type: Mapped[str] = mapped_column(String, nullable=False, default="image/jpeg")
    data: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AdminOverride(Base):
    """Per-league organiser overrides: manual results, eliminations and
    prediction answers. One row per league. The global fixture baseline is
    never mutated — these are applied on top, for this league only."""

    __tablename__ = "admin_overrides"

    league_id: Mapped[str] = mapped_column(
        String, ForeignKey("leagues.id"), primary_key=True
    )
    data: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
