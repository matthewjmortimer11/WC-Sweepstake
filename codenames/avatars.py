"""Decode and validate client-uploaded avatar images."""

from __future__ import annotations

import base64
import binascii
import re

from fastapi import HTTPException

MAX_AVATAR_BYTES = 600 * 1024
ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}


def decode_data_url(data_url: str) -> tuple[str, bytes]:
    m = re.match(r"data:([\w/+.\-]+);base64,(.*)$", data_url or "", re.DOTALL)
    if not m:
        raise HTTPException(status_code=400, detail="expected a base64 image data URL")
    ctype = m.group(1).lower()
    if ctype not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="unsupported image type")
    try:
        raw = base64.b64decode(m.group(2), validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="invalid base64 image")
    if not raw:
        raise HTTPException(status_code=400, detail="empty image")
    if len(raw) > MAX_AVATAR_BYTES:
        raise HTTPException(status_code=413, detail="image too large")
    return ctype, raw
