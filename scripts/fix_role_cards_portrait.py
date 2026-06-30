#!/usr/bin/env python3
"""Convert landscape V3b role cards to portrait 750x1050 (2.5x3.5in @ 300dpi)."""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image

TARGET = (750, 1050)
CREAM = (244, 236, 214)
ROLES_DIR = Path(__file__).resolve().parents[1] / "static" / "dethrone" / "cards" / "roles"


def trim_white(img: Image.Image, threshold: int = 248) -> Image.Image:
    px = img.load()
    w, h = img.size
    min_x, min_y, max_x, max_y = w, h, 0, 0
    found = False
    for y in range(h):
        for x in range(w):
            r, g, b = px[x, y][:3]
            if r < threshold or g < threshold or b < threshold:
                found = True
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
    if not found:
        return img
    return img.crop((min_x, min_y, max_x + 1, max_y + 1))


def resize_cover(img: Image.Image, tw: int, th: int) -> Image.Image:
    w, h = img.size
    scale = max(tw / w, th / h)
    nw, nh = int(w * scale), int(h * scale)
    img = img.resize((nw, nh), Image.Resampling.LANCZOS)
    left = (nw - tw) // 2
    top = (nh - th) // 2
    return img.crop((left, top, left + tw, top + th))


def contain_portrait(img: Image.Image) -> Image.Image:
    """Fit full card inside 750x1050 portrait canvas on design-system cream."""
    img = trim_white(img.convert("RGB"))
    w, h = img.size
    scale = min(TARGET[0] / w, TARGET[1] / h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = img.resize((nw, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", TARGET, CREAM)
    canvas.paste(resized, ((TARGET[0] - nw) // 2, (TARGET[1] - nh) // 2))
    return canvas


def crop_portrait(img: Image.Image) -> Image.Image:
    """Trim letterboxing, centre-crop to 5:7, resize to poker portrait."""
    img = trim_white(img.convert("RGB"))
    w, h = img.size
    target_ratio = TARGET[0] / TARGET[1]
    ratio = w / h
    # Near-square / portrait content: fill the frame. Wide landscape: fit whole card.
    if ratio <= target_ratio * 1.08:
        return resize_cover(img, TARGET[0], TARGET[1])
    return contain_portrait(img)


def fix_card(name: str) -> None:
    path = ROLES_DIR / f"{name}-card-v3b-poker.png"
    img = Image.open(path)
    out = crop_portrait(img)
    out.save(path, optimize=True)
    print(f"  {name}: {img.size} -> {out.size}")


def main() -> None:
    remaining = [
        "king",
        "firstborn-noble",
        "black-knight",
        "gate-guard",
        "royal-advisor",
        "tiny-tyrant",
    ]
    print("Fixing portrait cards...")
    for name in remaining:
        fix_card(name)
    print("Done.")


if __name__ == "__main__":
    main()
