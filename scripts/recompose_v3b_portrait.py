#!/usr/bin/env python3
"""Recompose landscape V3b card art into full-bleed 750x1050 portrait stacks."""
from __future__ import annotations

from pathlib import Path

from PIL import Image

TARGET = (750, 1050)
CREAM = (244, 236, 214)
ROLES_DIR = Path(__file__).resolve().parents[1] / "static" / "dethrone" / "cards" / "roles"

CARDS = [
    "king",
    "firstborn-noble",
    "black-knight",
    "gate-guard",
    "royal-advisor",
    "tiny-tyrant",
]


def is_cream(pixel: tuple[int, ...]) -> bool:
    r, g, b = pixel[:3]
    return r > 215 and g > 205 and b > 175


def detect_footer_top(img: Image.Image) -> int:
    w, h = img.size
    px = img.load()
    for y in range(h - 1, int(h * 0.52), -1):
        row = [px[x, y][:3] for x in range(0, w, max(1, w // 28))]
        if sum(1 for p in row if not is_cream(p)) > len(row) * 0.42:
            y0 = y
            while y0 > int(h * 0.52):
                row = [px[x, y0][:3] for x in range(0, w, max(1, w // 28))]
                if sum(1 for p in row if is_cream(p)) > len(row) * 0.62:
                    return y0 + 1
                y0 -= 1
            return y
    return int(h * 0.74)


def recompose_portrait(
    img: Image.Image,
    *,
    split: float = 0.40,
    header_frac: float = 0.30,
    art_frac: float = 0.46,
    flavor_frac: float = 0.08,
) -> Image.Image:
    img = img.convert("RGB")
    w, h = img.size
    ft = detect_footer_top(img)
    footer = img.crop((0, ft, w, h))
    top = img.crop((0, 0, w, ft))
    th = top.height

    split_x = int(w * split)
    left = top.crop((0, 0, split_x, th))
    right = top.crop((split_x, 0, w, th))

    canvas = Image.new("RGB", TARGET, CREAM)
    y = 0

    header_h = int(TARGET[1] * header_frac)
    header = left.crop((0, 0, left.width, int(th * 0.34))).resize(
        (TARGET[0], header_h), Image.Resampling.LANCZOS
    )
    canvas.paste(header, (0, y))
    y += header_h

    art_h = int(TARGET[1] * art_frac)
    art = right.resize((TARGET[0], art_h), Image.Resampling.LANCZOS)
    canvas.paste(art, (0, y))
    y += art_h

    flavor_h = int(TARGET[1] * flavor_frac)
    flavor = left.crop((0, int(th * 0.30), left.width, th)).resize(
        (TARGET[0], flavor_h), Image.Resampling.LANCZOS
    )
    canvas.paste(flavor, (0, y))
    y += flavor_h

    footer_h = TARGET[1] - y
    footer_fit = footer.resize((TARGET[0], footer_h), Image.Resampling.LANCZOS)
    canvas.paste(footer_fit, (0, y))
    return canvas


def main() -> None:
    for name in CARDS:
        path = ROLES_DIR / f"{name}-card-v3b-poker.png"
        img = Image.open(path)
        if name == "black-knight":
            out = recompose_portrait(img, split=0.36, header_frac=0.26, art_frac=0.44, flavor_frac=0.07)
        elif name == "gate-guard":
            out = recompose_portrait(img, split=0.43, header_frac=0.28, art_frac=0.48, flavor_frac=0.08)
        elif name == "royal-advisor":
            out = recompose_portrait(img, split=0.41, header_frac=0.28, art_frac=0.46, flavor_frac=0.08)
        elif name == "tiny-tyrant":
            out = recompose_portrait(img, split=0.40, header_frac=0.24, art_frac=0.44, flavor_frac=0.07)
        elif name == "king":
            out = recompose_portrait(img, split=0.42, header_frac=0.28, art_frac=0.46, flavor_frac=0.08)
        else:
            out = recompose_portrait(img)
        out.save(path, optimize=True)
        print(f"  {name}: {img.size} -> {out.size}")


if __name__ == "__main__":
    main()
