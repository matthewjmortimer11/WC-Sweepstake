"""Operational plumbing: logging, error reporting, request context.

None of this is required for the app to run. Every piece is gated on an
environment variable and degrades to the previous behaviour when unset, so
local development and tests are unaffected.

  LOG_FORMAT=json     structured logs (one JSON object per line) for Railway's
                      log search. Anything else keeps human-readable output.
  LOG_LEVEL=INFO      root level; DEBUG is very noisy under load.
  SENTRY_DSN=...      enables error reporting. Absent = no Sentry at all.
  SENTRY_SAMPLE_RATE  performance trace sampling, default 0 (errors only).
"""

from __future__ import annotations

import json
import logging
import os
import sys
import time
import uuid
from contextvars import ContextVar
from typing import Any, Optional

log = logging.getLogger(__name__)

# Set per request so every log line emitted while handling it can be tied back
# to the request that caused it — the thing you actually want at 3am.
request_id_var: ContextVar[str] = ContextVar("request_id", default="")

# Never log or report these, wherever they appear.
_SECRET_KEYS = {
    "password", "passwordhash", "password_hash", "organisercode", "organiser_code",
    "organiserhash", "organiser_hash", "token", "admintoken", "admin_token",
    "sessiontoken", "session_token", "accounttoken", "account_token",
    "authorization", "cookie", "credential", "apikey", "api_key", "secret", "pin",
}


def _is_secret(key: str) -> bool:
    return key.replace("-", "").replace("_", "").lower() in {
        k.replace("_", "") for k in _SECRET_KEYS
    }


def scrub(value: Any, _depth: int = 0) -> Any:
    """Recursively redact secret-looking keys from a structure.

    This app authenticates with league passwords, organiser codes and signed
    tokens; any of them reaching a log line or an error report would be a
    credential leak that outlives the request.
    """
    if _depth > 6:
        return value
    if isinstance(value, dict):
        return {
            k: ("[redacted]" if _is_secret(str(k)) else scrub(v, _depth + 1))
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [scrub(v, _depth + 1) for v in value]
    return value


class JsonFormatter(logging.Formatter):
    """One JSON object per line, so Railway can filter on fields not substrings."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        rid = request_id_var.get()
        if rid:
            payload["requestId"] = rid
        # Fields attached via logger.info(..., extra={...}).
        for key, value in getattr(record, "__dict__", {}).items():
            if key.startswith("wh_"):
                payload[key[3:]] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str, ensure_ascii=False)


def configure_logging() -> None:
    """Install the root handler. Safe to call once at import."""
    level = (os.environ.get("LOG_LEVEL") or "INFO").upper()
    handler = logging.StreamHandler(sys.stdout)

    if (os.environ.get("LOG_FORMAT") or "").lower() == "json":
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(
            logging.Formatter("%(asctime)s %(levelname)-7s %(name)s: %(message)s")
        )

    root = logging.getLogger()
    # Replace any handler uvicorn installed, so output has one shape.
    root.handlers = [handler]
    root.setLevel(getattr(logging, level, logging.INFO))

    # These duplicate our own request logging line for line.
    logging.getLogger("uvicorn.access").disabled = True
    for noisy in ("uvicorn.error", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def _before_send(event: dict, hint: dict) -> Optional[dict]:
    """Scrub credentials out of anything on its way to Sentry."""
    try:
        req = event.get("request") or {}
        for field in ("data", "headers", "cookies", "query_string"):
            if field in req:
                req[field] = scrub(req[field])
        event["request"] = req
        rid = request_id_var.get()
        if rid:
            event.setdefault("tags", {})["request_id"] = rid
    except Exception:  # pragma: no cover - reporting must never raise
        pass
    return event


def init_sentry() -> bool:
    """Start error reporting if a DSN is configured. Returns whether it ran."""
    dsn = (os.environ.get("SENTRY_DSN") or "").strip()
    if not dsn:
        return False
    try:
        import sentry_sdk
    except Exception as exc:  # pragma: no cover - optional dependency
        log.warning("SENTRY_DSN is set but sentry-sdk is not installed: %s", exc)
        return False

    try:
        sentry_sdk.init(
            dsn=dsn,
            environment=os.environ.get("RAILWAY_ENVIRONMENT_NAME") or os.environ.get("ENV") or "production",
            release=os.environ.get("RAILWAY_GIT_COMMIT_SHA") or None,
            traces_sample_rate=float(os.environ.get("SENTRY_SAMPLE_RATE") or 0.0),
            # This app handles passwords and signed tokens; never let the SDK
            # attach request bodies, headers or user identifiers by default.
            send_default_pii=False,
            before_send=_before_send,
        )
        log.info("Sentry error reporting enabled")
        return True
    except Exception as exc:  # pragma: no cover - network/config dependent
        log.warning("Could not initialise Sentry: %s", exc)
        return False


def new_request_id(incoming: Optional[str]) -> str:
    """Reuse an upstream request id when present so traces join up."""
    candidate = (incoming or "").strip()
    if candidate and len(candidate) <= 64 and candidate.isprintable():
        return candidate
    return uuid.uuid4().hex[:16]
