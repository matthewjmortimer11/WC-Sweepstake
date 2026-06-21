"""Cipher — a customisable, real-time word-association party game.

A self-contained module mounted into the Wheesht app. See :mod:`codenames.router`
for the HTTP/WebSocket surface and :mod:`codenames.game` for the rules engine.
"""

from .router import router  # noqa: F401

__all__ = ["router"]
