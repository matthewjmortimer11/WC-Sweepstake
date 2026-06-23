"""Cache-friendly static asset responses for party games."""

from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse

_MEDIA = {
    ".js": "application/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".woff2": "font/woff2",
}

_CACHE_IMMUTABLE = "public, max-age=31536000, immutable"
_CACHE_SHORT = "public, max-age=300"


def serve_asset(assets_dir: Path, filename: str) -> FileResponse:
    root = assets_dir.resolve()
    path = (assets_dir / filename).resolve()
    if not path.is_file() or root not in path.parents:
        raise HTTPException(status_code=404)
    media = _MEDIA.get(path.suffix.lower(), "application/octet-stream")
    if path.name in ("sw.js",):
        cache = "no-cache, no-store, must-revalidate"
    elif path.suffix.lower() in (".js", ".css", ".woff2"):
        cache = _CACHE_IMMUTABLE
    elif path.suffix.lower() == ".webmanifest":
        cache = _CACHE_SHORT
    else:
        cache = "public, max-age=86400"
    return FileResponse(path, media_type=media, headers={"Cache-Control": cache})
