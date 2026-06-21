"""
Cipher — optional account auth (separate from sweepstake league identity).

Uses Google sign-in with the same ``WC_GOOGLE_CLIENT_ID`` as the sweepstake app,
but issues Cipher-scoped ``c1.*`` tokens — never sweepstake ``a1``/``s1`` tokens.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
import time
from typing import Any, Optional

import httpx
from fastapi import HTTPException

_GOOGLE_CLIENT_ID: str = os.environ.get("WC_GOOGLE_CLIENT_ID", "")
_CIPHER_SECRET: str = (
    os.environ.get("CIPHER_AUTH_SECRET")
    or os.environ.get("WC_ADMIN_SECRET")
    or os.environ.get("SECRET_KEY")
    or secrets.token_hex(32)
)
_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60  # 90 days


def google_client_id() -> str:
    return _GOOGLE_CLIENT_ID


def auth_enabled() -> bool:
    return bool(_GOOGLE_CLIENT_ID)


async def verify_google_token(id_token: str) -> dict[str, Any]:
    """Verify a Google ID token and return claims."""
    url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
    try:
        async with httpx.AsyncClient(timeout=7.0) as client:
            r = await client.get(url)
        data = r.json()
    except Exception:
        raise HTTPException(status_code=502, detail="Could not reach Google to verify sign-in")
    if "error" in data or "error_description" in data:
        raise HTTPException(status_code=400, detail="Invalid Google token")
    if _GOOGLE_CLIENT_ID and data.get("aud") != _GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=400, detail="Token was not issued for this app")
    if not data.get("sub"):
        raise HTTPException(status_code=400, detail="Google token missing subject")
    return data


def cipher_token_for(user_id: str) -> str:
    ts = str(int(time.time()))
    msg = f"cipher:{user_id}:{ts}".encode("utf-8")
    sig = hmac.new(_CIPHER_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return f"c1.{ts}.{user_id}.{sig}"


def user_id_from_token(token: Optional[str]) -> Optional[str]:
    """Return a Cipher user id if the token is valid, else None."""
    try:
        version, ts_s, user_id, sig = (token or "").split(".", 3)
        if version != "c1" or not user_id:
            return None
        ts = int(ts_s)
        if time.time() - ts > _TOKEN_TTL_SECONDS:
            return None
        msg = f"cipher:{user_id}:{ts_s}".encode("utf-8")
        expected = hmac.new(_CIPHER_SECRET.encode("utf-8"), msg, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            return None
        return user_id
    except (ValueError, TypeError):
        return None


def token_from_header(authorization: Optional[str], cipher_header: Optional[str]) -> Optional[str]:
    if cipher_header:
        return cipher_header.strip()
    if authorization and authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return None
