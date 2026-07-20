#!/usr/bin/env python3
"""
Push Cursor agent status to Mission Control (AI Quota Tracker).

Set QUOTA_TRACKER_URL, QUOTA_TRACKER_TOKEN, and optionally QUOTA_TRACKER_ID in
Cursor Cloud Agent secrets, then:

  python3 scripts/agent_status.py push --phase coding --summary "Implementing fix"
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
sys.path.insert(0, str(ROOT / "scripts"))

from mission_control.sites import detect_sites_from_git, site_metrics  # noqa: E402

DEFAULT_TRACKER_ID = "cursor-workspace"
DEFAULT_NAME = "Cursor workspace"
DEFAULT_VENDOR = "Cursor"
VALID_STATUSES = frozenset({"live", "waiting", "limited", "warning", "offline"})
VALID_TEST_STATUSES = frozenset({"unknown", "running", "green", "failed"})
VALID_PHASES = frozenset(
    {"exploring", "coding", "testing", "blocked", "pr-ready", "done", "working", "waiting", "debugging"}
)


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


def _changed_file_count() -> int | None:
    dirty = _run_git("status", "--porcelain")
    if dirty is None:
        return None
    return len([line for line in dirty.splitlines() if line.strip()])


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
    test_status: str,
    attention: bool,
    attention_reason: str,
    pr_url: str,
    branch: str | None,
    available_count: int | None,
    extra_metrics: list[dict[str, str]],
) -> dict:
    if status not in VALID_STATUSES:
        raise ValueError(f"status must be one of: {', '.join(sorted(VALID_STATUSES))}")
    if test_status not in VALID_TEST_STATUSES:
        raise ValueError(f"test_status must be one of: {', '.join(sorted(VALID_TEST_STATUSES))}")

    git_branch = branch or _run_git("branch", "--show-current") or ""
    changed = _changed_file_count()
    changed_value = "unknown" if changed is None else str(changed)

    metrics = [{"label": "Source", "value": "Cursor"}]
    if changed is not None:
        metrics.append({"label": "Changed files", "value": changed_value})
    metrics.append({"label": "Tests", "value": test_status.replace("green", "passed").replace("failed", "failing")})
    metrics.extend(site_metrics(detect_sites_from_git(ROOT)))
    metrics.extend(extra_metrics)

    payload = {
        "name": os.environ.get("QUOTA_TRACKER_NAME", DEFAULT_NAME),
        "vendor": os.environ.get("QUOTA_TRACKER_VENDOR", DEFAULT_VENDOR),
        "status": status,
        "available_count": available_count if available_count is not None else (1 if status == "live" else 0),
        "phase": phase,
        "summary": _sanitize_summary(summary),
        "branch": git_branch,
        "test_status": test_status,
        "attention": attention,
        "attention_reason": attention_reason if attention else "",
        "pr_url": pr_url,
        "metrics": metrics,
    }
    return payload


def push_payload(payload: dict, *, tracker_id: str, base_url: str, token: str | None) -> dict:
    url = f"{base_url.rstrip('/')}/api/trackers/{tracker_id}"
    body = json.dumps(payload).encode("utf-8")
    headers = {"Content-Type": "application/json", "Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            raw = response.read().decode("utf-8")
            if raw.strip():
                return json.loads(raw)
            return {"ok": True, "http_status": response.status}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {exc.code} from quota tracker: {detail[:300]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(
            "Could not reach quota tracker. Check QUOTA_TRACKER_URL and that the local bridge is running."
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
    parser = argparse.ArgumentParser(description="Push agent status to Mission Control")
    sub = parser.add_subparsers(dest="command", required=True)

    push = sub.add_parser("push", help="Build status and POST to the tracker")
    push.add_argument("--tracker-id", default=os.environ.get("QUOTA_TRACKER_ID", DEFAULT_TRACKER_ID))
    push.add_argument("--phase", default=os.environ.get("AGENT_PHASE", "exploring"))
    push.add_argument("--summary", default=os.environ.get("AGENT_SUMMARY", "Working in workspace"))
    push.add_argument("--status", default=os.environ.get("AGENT_STATUS", "live"))
    push.add_argument("--test-status", default=os.environ.get("AGENT_TEST_STATUS", "unknown"))
    push.add_argument("--branch", default=os.environ.get("AGENT_BRANCH"))
    push.add_argument("--pr-url", default=os.environ.get("AGENT_PR_URL", ""))
    push.add_argument("--attention", action="store_true", default=False)
    push.add_argument("--attention-reason", default="")
    push.add_argument("--available-count", type=int, default=None)
    push.add_argument("--metric", action="append", default=[], type=_parse_metric)
    push.add_argument("--dry-run", action="store_true")

    args = parser.parse_args(argv)
    if args.command != "push":
        return 1

    attention = args.attention or args.phase in {"blocked", "pr-ready"} or args.test_status == "failed"
    if args.phase == "done" and args.test_status == "green":
        attention = args.attention

    try:
        payload = build_payload(
            phase=args.phase,
            summary=args.summary,
            status=args.status,
            test_status=args.test_status,
            attention=attention,
            attention_reason=args.attention_reason,
            pr_url=args.pr_url,
            branch=args.branch,
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
        print("QUOTA_TRACKER_URL is not set.", file=sys.stderr)
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
