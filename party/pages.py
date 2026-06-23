"""HTML helpers for party-game pages."""

from __future__ import annotations

from pathlib import Path

from fastapi.responses import HTMLResponse

from .version import ASSET_VERSION


def render_game_page(template: Path, csp: str) -> HTMLResponse:
    if not template.is_file():
        raise FileNotFoundError(str(template))
    html = template.read_text(encoding="utf-8").replace("{{ASSET_VERSION}}", ASSET_VERSION)
    return HTMLResponse(html, headers={"Content-Security-Policy": csp, "Cache-Control": "no-cache"})
