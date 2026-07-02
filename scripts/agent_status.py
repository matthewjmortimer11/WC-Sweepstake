#!/usr/bin/env python3
"""
Push Cursor agent status to a local AI Quota Tracker dashboard.

The cloud agent cannot reach your machine's 127.0.0.1 directly. Run the local
bridge on your laptop (see scripts/start_quota_bridge.sh), set QUOTA_TRACKER_URL
to the tunnel URL in Cursor Cloud Agent secrets, then call this script.

Examples:
  python scripts/agent_status.py push --phase exploring --summary "Scouting auth flow"
  python scripts/agent_status.py push --phase testing --status warning --summary "2 tests failing"
  python scripts/agent_status.py push --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TRACKER_ID = "cursor-workspace"
DEFAULT_NAME = "Cursor Cloud Agent"
DEFAULT_VENDOR = "Cursor"
VALID_STATUSES = frozenset({"live", "waiting", "limited", "warning", "offline"})


def _run_git(*args: str) -> str | None:
    try:
        out = subprocess.check_output(
            ["git", *args],
            cwd=ROOT,
            stderr=subprocess.DEVNULL,
            text=True,
        )
        return out.strip() or None
    except (subprocess.CalledProcessError, FileNotFoundError):
        return None


def _git_metrics() -> list[dict[str, str]]:
    metrics: list[dict[str, str]] = []
    branch = _run_git("branch", "--show-current")
    if branch:
        metrics.append({"label": "Branch", "value": branch[:48]})

    dirty = _run_git("status", "--porcelain")
    if dirty is not None:
        count = len([line for line in dirty.splitlines() if line.strip()])
        metrics.append({"label": "Changes", "value": "clean" if count == 0 else f"{count} file(s)"})

    pr_hint = _run_git("log", "-1", "--pretty=%s")
    if pr_hint:
        metrics.append({"label": "Last commit", "value": pr_hint[:56]})

    return metrics


def _sanitize_summary(text: str, max_len: int = 140) -> str:
    cleaned = re.sub(r"\s+", " ", text.strip())
    if len(cleaned) <= max_len:
        return cleaned
    return cleaned[: max_len - 1] + "…"


def build_payload(
    *,
    phase: str,
    summary: str,
    status: str,
    vibe: str | None,
    available_count: int | None,
    extra_metrics: list[dict[str, str]],
) -> dict:
    if status not in VALID_STATUSES:
        raise ValueError(f"status must be one of: {', '.join(sorted(VALID_STATUSES))}")

    metrics = [
        {"label": "Phase", "value": phase},
        {"label": "Session", "value": "active" if status == "live" else status},
        {"label": "Mode", "value": "agent"},
    ]
    if vibe:
        metrics.append({"label": "Vibe", "value": vibe})
    metrics.extend(_git_metrics())
    metrics.extend(extra_metrics)

    payload = {
        "name": os.environ.get("QUOTA_TRACKER_NAME", DEFAULT_NAME),
        "vendor": os.environ.get("QUOTA_TRACKER_VENDOR", DEFAULT_VENDOR),
        "status": status,
        "summary": _sanitize_summary(summary),
        "metrics": metrics,
    }
    if available_count is not None:
        payload["available_count"] = available_count
    elif status in {"live", "limited"}:
        payload["available_count"] = 1
    else:
        payload["available_count"] = 0
    return payload


def push_payload(payload: dict, *, tracker_id: str, base_url: str, token: str | None) -> dict:
    url = f"{base_url.rstrip('/')}/api/trackers/{tracker_id}"
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=10) as response:
            raw = response.read().decode("utf-8")
            if raw.strip():
                return json.loads(raw)
            return {"ok": True, "http_status": response.status}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} from quota tracker: {detail[:300]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(
            "Could not reach quota tracker. On your laptop run "
            "scripts/start_quota_bridge.sh and set QUOTA_TRACKER_URL in Cursor secrets."
        ) from exc


def _parse_metric(raw: str) -> dict[str, str]:
    if ":" not in raw:
        raise argparse.ArgumentTypeError("metric must look like Label:value")
    label, value = raw.split(":", 1)
    label = label.strip()
    value = value.strip()
    if not label or not value:
        raise argparse.ArgumentTypeError("metric must look like Label:value")
    return {"label": label, "value": value}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Push agent status to AI Quota Tracker")
    sub = parser.add_subparsers(dest="command", required=True)

    push = sub.add_parser("push", help="Build metrics and POST to the tracker")
    push.add_argument("--tracker-id", default=os.environ.get("QUOTA_TRACKER_ID", DEFAULT_TRACKER_ID))
    push.add_argument("--phase", default=os.environ.get("AGENT_PHASE", "working"))
    push.add_argument("--summary", default=os.environ.get("AGENT_SUMMARY", "Working in workspace"))
    push.add_argument("--status", default=os.environ.get("AGENT_STATUS", "live"))
    push.add_argument("--vibe", default=os.environ.get("AGENT_VIBE"))
    push.add_argument(
        "--available-count",
        type=int,
        default=None,
        help="Override available_count (defaults from status)",
    )
    push.add_argument(
        "--metric",
        action="append",
        default=[],
        type=_parse_metric,
        help="Extra metric as Label:value (repeatable)",
    )
    push.add_argument("--dry-run", action="store_true", help="Print JSON without POSTing")

    args = parser.parse_args(argv)
    if args.command != "push":
        return 1

    try:
        payload = build_payload(
            phase=args.phase,
            summary=args.summary,
            status=args.status,
            vibe=args.vibe,
            available_count=args.available_count,
            extra_metrics=args.metric,
        )
    except ValueError as exc:
        print(exc, file=sys.stderr)
        return 2

    if args.dry_run:
        print(json.dumps(payload, indent=2))
        return 0

    base_url = os.environ.get("QUOTA_TRACKER_URL", "").strip()
    if not base_url:
        print(
            "QUOTA_TRACKER_URL is not set. Start scripts/start_quota_bridge.sh on your machine "
            "and add the printed https URL to Cursor Cloud Agent secrets.",
            file=sys.stderr,
        )
        return 3

    token = os.environ.get("QUOTA_TRACKER_TOKEN", "").strip() or None
    try:
        result = push_payload(
            payload,
            tracker_id=args.tracker_id,
            base_url=base_url,
            token=token,
        )
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 4

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
