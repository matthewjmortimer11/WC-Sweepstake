"""HTTP client for Mission Control API."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


def _headers(token: str | None) -> dict[str, str]:
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _request(method: str, url: str, payload: dict | None, token: str | None, timeout: float = 20.0) -> dict[str, Any]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=body, headers=_headers(token), method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            if raw.strip():
                return json.loads(raw)
            return {"ok": True, "http_status": response.status}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code}: {detail[:400]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Could not reach Mission Control: {exc.reason}") from exc


def config_from_env() -> tuple[str, str | None, str]:
    base = os.environ.get("QUOTA_TRACKER_URL", "").strip().rstrip("/")
    token = os.environ.get("QUOTA_TRACKER_TOKEN", "").strip() or None
    tracker_id = os.environ.get("QUOTA_TRACKER_ID", "cursor-workspace")
    return base, token, tracker_id


def post_sync(payload: dict[str, Any], base_url: str, token: str | None) -> dict[str, Any]:
    return _request("POST", f"{base_url}/api/sync", payload, token)


def get_mission_control(base_url: str, token: str | None) -> dict[str, Any]:
    return _request("GET", f"{base_url}/api/mission-control", None, token)


def post_tracker(payload: dict[str, Any], base_url: str, token: str | None, tracker_id: str) -> dict[str, Any]:
    return _request("POST", f"{base_url}/api/trackers/{tracker_id}", payload, token)
