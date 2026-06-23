"""Deploy-scoped version token for cache-safe static assets."""

from __future__ import annotations

import os

ASSET_VERSION = (
    os.environ.get("RAILWAY_GIT_COMMIT_SHA")
    or os.environ.get("GIT_COMMIT")
    or os.environ.get("SOURCE_VERSION")
    or "dev"
)[:12]
