#!/usr/bin/env python3
"""Generate V3b editorial kingdom map PNGs (background + location vignettes)."""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "static" / "dethrone" / "cards" / "map"

W, H = 1440, 1840  # 2× viewBox 720×920
VW, VH = 720, 920

CREAM = (244, 236, 214)
CREAM_HI = (251, 246, 233)
INK = (42, 32, 20)
INK2 = (91, 76, 56)
GOLD = (168, 132, 44)
GOLDB = (199, 154, 58)
GOLDS = (232, 212, 154)
ROYAL = (140, 47, 35)
CURSED = (107, 36, 32)
MOSS = (90, 110, 58)
KNIGHT = (74, 85, 104)
GUARD = (91, 76, 56)

MAP_XY = {
    "scrolls": (360, 88),
    "college": (360, 208),
    "tavern": (108, 400),
    "market": (252, 400),
    "throne": (360, 400),
    "barracks": (612, 400),
    "graveyard": (360, 640),
}
ROUTES = [
    ("market", "tavern"), ("market", "college"), ("market", "throne"),
    ("college", "scrolls"), ("throne", "barracks"),
    ("tavern", "graveyard"), ("barracks", "graveyard"),
]

LOC_META = {
    "scrolls": {"accent": INK, "file": "location-scrolls-v3b.png"},
    "college": {"accent": INK, "file": "location-college-v3b.png"},
    "tavern": {"accent": GUARD, "file": "location-tavern-v3b.png"},
    "market": {"accent": GUARD, "file": "location-market-v3b.png"},
    "throne": {"accent": ROYAL, "file": "location-throne-v3b.png"},
    "barracks": {"accent": KNIGHT, "file": "location-barracks-v3b.png"},
    "graveyard": {"accent": CURSED, "file": "location-graveyard-v3b.png"},
}

random.seed(42)


def scale_pt(x: float, y: float) -> tuple[int, int]:
    return int(x * W / VW), int(y * H / VH)


def add_paper_texture(img: Image.Image, strength: float = 0.06) -> Image.Image:
    px = img.load()
    w, h = img.size
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            n = random.randint(-int(255 * strength), int(255 * strength))
            r, g, b = px[x, y]
            px[x, y] = (
                max(0, min(255, r + n)),
                max(0, min(255, g + n)),
                max(0, min(255, b + n)),
            )
    return img


def draw_frame(draw: ImageDraw.ImageDraw) -> None:
    draw.rectangle([0, 0, W - 1, H - 1], fill=CREAM)
    draw.rounded_rectangle([32, 32, W - 32, H - 32], radius=24, outline=GOLD, width=4)
    draw.rounded_rectangle([48, 48, W - 48, H - 48], radius=16, outline=INK, width=2)
    for ox, oy, rot in [(72, 72, 0), (W - 72, 72, 90), (72, H - 72, -90), (W - 72, H - 72, 180)]:
        draw.arc([ox - 44, oy - 44, ox + 44, oy + 44], rot, rot + 90, fill=GOLD, width=3)
    try:
        serif = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", 44)
        sans = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 18)
        italic = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf", 22)
    except OSError:
        serif = sans = italic = ImageFont.load_default()
    draw.text((96, 76), "The Kingdom", fill=INK, font=serif)
    draw.text((96, 128), "CURSED THRONE · V3B", fill=GOLD, font=sans)
    draw.line([(96, 152), (400, 152)], fill=GOLD, width=2)
    draw.ellipse([W - 144, 72, W - 72, 144], outline=GOLD, width=3)
    draw.text((W - 108, 98), "✦", fill=ROYAL, font=serif, anchor="mm")
    draw.text((W // 2, H - 56), "Graveyard links Tavern and Barracks", fill=INK2, font=italic, anchor="mm")


def draw_landscape(draw: ImageDraw.ImageDraw) -> Image.Image:
    """Atmospheric kingdom hills + mood inside the inner frame."""
    inner = [64, 168, W - 64, H - 88]
    draw.rounded_rectangle(inner, radius=12, fill=(235, 226, 200))
    for i, col in enumerate([(201, 186, 152), (186, 168, 132), (160, 145, 118)]):
        y0 = inner[1] + 120 + i * 80
        pts = []
        for x in range(inner[0], inner[2], 40):
            y = y0 + int(30 * math.sin((x + i * 90) / 180))
            pts.append((x, y))
        pts += [(inner[2], inner[3]), (inner[0], inner[3])]
        draw.polygon(pts, fill=col)
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse([inner[0], inner[3] - 220, inner[2], inner[3] + 20], fill=(107, 36, 32, 38))
    od.ellipse([inner[0] + 80, inner[1] + 40, inner[2] - 60, inner[1] + 200], fill=(168, 132, 44, 22))
    return overlay


def draw_faint_roads(draw: ImageDraw.ImageDraw) -> None:
    for a, b in ROUTES:
        p, q = scale_pt(*MAP_XY[a]), scale_pt(*MAP_XY[b])
        grave = "graveyard" in (a, b)
        col = (CURSED[0], CURSED[1], CURSED[2], 90) if grave else (168, 132, 44, 70)
        width = 14 if grave else 12
        draw.line([p, q], fill=col[:3], width=width)
        # soft edge
        draw.line([p, q], fill=tuple(c // 2 for c in col[:3]), width=width + 8)


def kingdom_background() -> None:
    img = Image.new("RGB", (W, H), CREAM)
    draw = ImageDraw.Draw(img)
    draw_frame(draw)
    mist = draw_landscape(draw)
    img = Image.alpha_composite(img.convert("RGBA"), mist).convert("RGB")
    draw = ImageDraw.Draw(img)
    draw_faint_roads(draw)
    img = add_paper_texture(img, 0.035)
    path = OUT / "kingdom-background-v3b.png"
    img.save(path, optimize=True)
    print("wrote", path, img.size)


def loc_canvas(w: int = 600, h: int = 700) -> tuple[Image.Image, ImageDraw.ImageDraw]:
    img = Image.new("RGB", (w, h), CREAM_HI)
    return img, ImageDraw.Draw(img)


def finish_vignette(img: Image.Image, path: Path) -> None:
    img = add_paper_texture(img, 0.05)
    img.save(path, optimize=True)
    print("wrote", path, img.size)


def vignette_scrolls() -> None:
    w, h = 600, 700
    img, d = loc_canvas(w, h)
    d.rectangle([40, 80, w - 40, h - 60], fill=(238, 230, 208), outline=INK, width=3)
    d.rounded_rectangle([180, 120, 420, 520], radius=8, fill=CREAM, outline=GOLD, width=4)
    d.arc([160, 100, 200, 500], 270, 90, fill=INK, width=4)
    d.arc([400, 100, 440, 500], 90, 270, fill=INK, width=4)
    for y in range(200, 460, 36):
        d.line([(220, y), (380, y)], fill=INK2, width=2)
    d.polygon([(300, 60), (340, 120), (260, 120)], fill=GOLD)
    finish_vignette(img, OUT / LOC_META["scrolls"]["file"])


def vignette_college() -> None:
    w, h = 600, 700
    img, d = loc_canvas(w, h)
    d.polygon([(300, 90), (120, 200), (480, 200)], fill=(220, 210, 186), outline=INK, width=3)
    d.rectangle([140, 200, 460, 520], fill=(232, 222, 198), outline=INK, width=3)
    for x in (200, 300, 400):
        d.rectangle([x - 25, 220, x + 25, 500], fill=CREAM, outline=INK2, width=2)
        d.polygon([(x - 35, 220), (x, 180), (x + 35, 220)], fill=GOLDS, outline=INK)
    d.ellipse([(260, 540), (340, 580)], fill=INK, outline=INK)
    finish_vignette(img, OUT / LOC_META["college"]["file"])


def vignette_tavern() -> None:
    w, h = 600, 700
    img, d = loc_canvas(w, h)
    d.rectangle([100, 240, 500, 540], fill=(225, 200, 168), outline=INK, width=4)
    d.polygon([(80, 240), (300, 140), (520, 240)], fill=ROYAL, outline=INK, width=3)
    d.rectangle([250, 360, 350, 540], fill=(91, 76, 56), outline=INK, width=2)
    d.ellipse([160, 400, 220, 480], outline=GOLD, width=4)
    d.rounded_rectangle([380, 380, 460, 470], radius=20, fill=GOLDS, outline=INK, width=2)
    finish_vignette(img, OUT / LOC_META["tavern"]["file"])


def vignette_market() -> None:
    w, h = 600, 700
    img, d = loc_canvas(w, h)
    d.rectangle([60, 300, 540, 560], fill=(236, 226, 204), outline=INK, width=3)
    for i, x in enumerate([100, 240, 380]):
        d.rectangle([x, 260, x + 100, 320], fill=(GUARD[0], GUARD[1], GUARD[2]), outline=INK, width=2)
        d.rectangle([x + 10, 320, x + 90, 520], fill=CREAM if i % 2 else CREAM_HI, outline=INK2, width=2)
    d.ellipse([255, 180, 345, 240], fill=GOLD, outline=INK, width=2)
    d.line([(120, 520), (480, 520)], fill=INK2, width=3)
    finish_vignette(img, OUT / LOC_META["market"]["file"])


def vignette_throne() -> None:
    w, h = 600, 700
    img, d = loc_canvas(w, h)
    d.rectangle([0, 0, w, h], fill=(248, 240, 220))
    d.rectangle([80, 180, 520, 560], fill=(235, 215, 190), outline=GOLD, width=5)
    d.polygon([(180, 560), (220, 320), (260, 560)], fill=GOLDS, outline=INK, width=2)
    d.polygon([(340, 560), (380, 320), (420, 560)], fill=GOLDS, outline=INK, width=2)
    d.rectangle([260, 280, 340, 380], fill=ROYAL, outline=INK, width=3)
    d.polygon([(240, 280), (300, 200), (360, 280)], fill=GOLD, outline=INK, width=2)
    d.ellipse([270, 120, 330, 170], fill=GOLDS, outline=ROYAL, width=3)
    finish_vignette(img, OUT / LOC_META["throne"]["file"])


def vignette_barracks() -> None:
    w, h = 600, 700
    img, d = loc_canvas(w, h)
    d.rectangle([70, 220, 530, 560], fill=(210, 214, 222), outline=INK, width=3)
    d.line([(120, 560), (480, 220)], fill=INK, width=8)
    d.line([(480, 560), (120, 220)], fill=INK, width=8)
    d.rectangle([250, 380, 350, 560], fill=KNIGHT, outline=INK, width=2)
    d.polygon([(200, 220), (300, 160), (400, 220)], fill=(91, 100, 118), outline=INK, width=2)
    finish_vignette(img, OUT / LOC_META["barracks"]["file"])


def vignette_graveyard() -> None:
    w, h = 600, 700
    img, d = loc_canvas(w, h)
    d.rectangle([0, 0, w, h], fill=(218, 208, 198))
    d.ellipse([60, 480, 540, 620], fill=(90, 110, 58), outline=INK, width=2)
    d.rounded_rectangle([220, 200, 380, 520], radius=6, fill=(107, 36, 32), outline=INK, width=3)
    d.polygon([(260, 200), (300, 120), (340, 200)], fill=INK, outline=INK)
    d.line([(300, 240), (300, 420)], fill=CREAM_HI, width=6)
    d.line([(250, 330), (350, 330)], fill=CREAM_HI, width=6)
    d.arc([120, 300, 200, 500], 0, 180, fill=INK2, width=3)
    d.arc([400, 320, 480, 520], 0, 180, fill=INK2, width=3)
    finish_vignette(img, OUT / LOC_META["graveyard"]["file"])


def write_manifest() -> None:
    manifest = {
        "template": "V3b Vertical Asymmetric Editorial",
        "kingdom": {
            "file": "kingdom-background-v3b.png",
            "pixels": f"{W}x{H}",
            "viewBox": "0 0 720 920",
        },
        "palette": {
            "cream": "#F4ECD6",
            "ink": "#2A2014",
            "gold": "#A8842C",
            "royal": "#8C2F23",
            "cursed": "#6B2420",
            "knight": "#4A5568",
            "guard": "#5B4C38",
            "advisor": "#2A2014",
        },
        "locations": {k: v["file"] for k, v in LOC_META.items()},
    }
    path = OUT / "manifest.json"
    path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print("wrote", path)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    kingdom_background()
    vignette_scrolls()
    vignette_college()
    vignette_tavern()
    vignette_market()
    vignette_throne()
    vignette_barracks()
    vignette_graveyard()
    write_manifest()


if __name__ == "__main__":
    main()
