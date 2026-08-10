#!/usr/bin/env python3
"""
Sync Wheesht site health + recent git changes to Mission Control.

  python3 scripts/sync_sites.py              # POST /api/sync
  python3 scripts/sync_sites.py --dry-run      # print JSON only
  python3 scripts/sync_sites.py --health-only  # build payload, no POST
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from mission_control.client import config_from_env, post_sync  # noqa: E402
from mission_control.sites import build_sync_payload  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Sync site health and git changes to Mission Control")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--health-only", action="store_true", help="Build payload but do not POST")
    args = parser.parse_args()

    payload = build_sync_payload(ROOT)

    if args.dry_run or args.health_only:
        print(json.dumps(payload, indent=2))
        return 0

    base_url, token, _ = config_from_env()
    if not base_url:
        print("QUOTA_TRACKER_URL is not set.", file=sys.stderr)
        return 1

    try:
        result = post_sync(payload, base_url, token)
    except RuntimeError as exc:
        print(exc, file=sys.stderr)
        return 2

    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
