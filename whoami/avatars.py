"""Decode and validate in-room avatar uploads."""

from __future__ import annotations

import base64
import binascii
import re

MAX_AVATAR_BYTES = 600 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


class AvatarError(Exception):
    """A rejected avatar — message is safe for clients."""


def decode_data_url(data_url: str) -> tuple[str, bytes]:
    m = re.match(r"data:([\w/+.\-]+);base64,(.*)$", data_url or "", re.DOTALL)
    if not m:
        raise AvatarError("Expected a base64 image.")
    ctype = m.group(1).lower()
    if ctype not in ALLOWED_TYPES:
        raise AvatarError("Use a JPEG, PNG, or WebP image.")
    try:
        raw = base64.b64decode(m.group(2), validate=True)
    except (binascii.Error, ValueError):
        raise AvatarError("Invalid image data.")
    if not raw:
        raise AvatarError("Empty image.")
    if len(raw) > MAX_AVATAR_BYTES:
        raise AvatarError("Image too large (max 600 KB).")
    return ctype, raw
