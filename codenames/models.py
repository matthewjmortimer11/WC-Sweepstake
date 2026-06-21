"""
Cipher — ORM models (all tables prefixed ``cipher_``).

Deliberately self-contained: these inherit Cipher's own :class:`CipherBase`, not
the sweepstake's ``Base``, and carry no foreign keys into sweepstake tables.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .store import CipherBase


def _uuid() -> str:
    return uuid.uuid4().hex


class CipherUser(CipherBase):
    """Global Cipher identity (optional login). Separate from sweepstake participants."""

    __tablename__ = "cipher_user"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    google_sub: Mapped[str | None] = mapped_column(String, unique=True, nullable=True, index=True)
    display_name: Mapped[str] = mapped_column(String, nullable=False, default="")
    avatar_url: Mapped[str] = mapped_column(String, nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class CipherFriend(CipherBase):
    """Directed friendship (user_id added friend_id)."""

    __tablename__ = "cipher_friend"
    __table_args__ = (UniqueConstraint("user_id", "friend_id", name="uq_cipher_friend"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String, ForeignKey("cipher_user.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    friend_id: Mapped[str] = mapped_column(
        String, ForeignKey("cipher_user.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class CipherMatch(CipherBase):
    """One completed game."""

    __tablename__ = "cipher_match"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    room_code: Mapped[str] = mapped_column(String, nullable=False, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    board_size: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    pack_id: Mapped[str] = mapped_column(String, nullable=False, default="classic")
    pack_name: Mapped[str] = mapped_column(String, nullable=False, default="Classic")
    custom_words: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    turn_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    assassins: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    starting_team: Mapped[str] = mapped_column(String, nullable=False, default="red")
    winner: Mapped[str | None] = mapped_column(String, nullable=True)
    win_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    rounds: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    red_remaining: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    blue_remaining: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    players: Mapped[list["CipherMatchPlayer"]] = relationship(
        back_populates="match", cascade="all, delete-orphan",
    )


class CipherMatchPlayer(CipherBase):
    """One participant in a completed game (team members only)."""

    __tablename__ = "cipher_match_player"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    match_id: Mapped[str] = mapped_column(
        String, ForeignKey("cipher_match.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    pid: Mapped[str] = mapped_column(String, nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("cipher_user.id", ondelete="SET NULL"), nullable=True, index=True,
    )
    name: Mapped[str] = mapped_column(String, nullable=False, default="")
    team: Mapped[str] = mapped_column(String, nullable=False, default="")
    role: Mapped[str] = mapped_column(String, nullable=False, default="operative")
    won: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    match: Mapped[CipherMatch] = relationship(back_populates="players")
