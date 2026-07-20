#!/usr/bin/env python3
"""Wheesht development MCP server — project-specific tools for agents."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from mcp.server.fastmcp import FastMCP

ROOT = Path(__file__).resolve().parents[2]

mcp = FastMCP("wheesht-dev")


def _run_pytest(args: list[str], timeout: int = 300) -> str:
    cmd = [sys.executable, "-m", "pytest", *args]
    try:
        proc = subprocess.run(
            cmd,
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return f"pytest timed out after {timeout}s"

    parts = [f"exit_code={proc.returncode}"]
    if proc.stdout.strip():
        parts.append("--- stdout ---\n" + proc.stdout.strip())
    if proc.stderr.strip():
        parts.append("--- stderr ---\n" + proc.stderr.strip())
    return "\n".join(parts)


@mcp.tool()
def run_security_tests() -> str:
    """Run tests/test_security.py (required before auth/isolation changes)."""
    return _run_pytest(["tests/test_security.py", "-q"])


@mcp.tool()
def run_pytest(path: str = "tests", extra_args: str = "") -> str:
    """Run pytest under the given path (default: tests). Optional extra_args string."""
    args = [path]
    if extra_args.strip():
        args.extend(extra_args.split())
    return _run_pytest(args)


@mcp.tool()
def check_stripe_pro_env() -> str:
    """Report whether Stripe Pro env vars are set (values are never returned)."""
    keys = [
        "STRIPE_SECRET_KEY",
        "STRIPE_WEBHOOK_SECRET",
        "STRIPE_PRO_PRICE_ID",
        "STRIPE_PRO_AMOUNT_PENCE",
    ]
    lines = []
    for key in keys:
        value = os.environ.get(key, "")
        if value:
            prefix = value[:7] + "…" if len(value) > 7 else "(set)"
            lines.append(f"{key}: set ({prefix})")
        else:
            lines.append(f"{key}: missing")
    return "\n".join(lines)


@mcp.tool()
def project_info() -> str:
    """Brief Wheesht project map for agents."""
    return "\n".join(
        [
            "Wheesht — World Cup sweepstake backend (FastAPI) + PWA client.",
            f"repo_root: {ROOT}",
            "backend: main.py, models.py, db.py",
            "client: static/app/",
            "games: whoami/, imposter/, dial/, charades/, codenames/",
            "tests: tests/ (run_security_tests before auth/chat/isolation changes)",
            "deploy: Railway (railway.json), Postgres via DATABASE_URL",
            "billing: Stripe Pro per league — see docs/PRO.md",
            "security invariants: .cursor/rules/wheesht-security.mdc",
        ]
    )


if __name__ == "__main__":
    mcp.run(transport="stdio")
