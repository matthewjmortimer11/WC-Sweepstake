"""Backward-compatible re-export — use whoami.packs for pack data."""

from .packs import characters_for_packs

# Legacy flat list (default packs only) for any old imports.
CHARACTERS = characters_for_packs(["uk_celebs", "objects", "marvel", "cartoons", "notorious"])
