#!/usr/bin/env python3
"""Generate V3b-style action card vignettes for iconic cards (stub art).

Shipped JPEGs in static/dethrone/cards/action/ are the live assets; re-run this
script to regenerate programmatic placeholders in the same palette as the kingdom map.
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "static" / "dethrone" / "cards" / "action"
W, H = 360, 200

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

DECK_ACCENT = {
    "Market": GUARD,
    "Tavern": GUARD,
    "Knowledge": INK,
    "Barracks": KNIGHT,
    "Graveyard": CURSED,
    "Royal": ROYAL,
}

ICONIC = {
    "secret_passage": {"deck": "Market", "glyph": "passage"},
    "counterfeit_pass": {"deck": "Market", "glyph": "papers"},
    "rumour_card": {"deck": "Tavern", "glyph": "rumour"},
    "call_out": {"deck": "Knowledge", "glyph": "callout"},
    "hidden_knife": {"deck": "Barracks", "glyph": "knife"},
    "shield": {"deck": "Barracks", "glyph": "shield"},
    "arrest": {"deck": "Barracks", "glyph": "arrest"},
    "soul_debt": {"deck": "Graveyard", "glyph": "soul"},
    "grave_pact": {"deck": "Graveyard", "glyph": "pact"},
    "royal_decree": {"deck": "Royal", "glyph": "decree"},
    "pardon_card": {"deck": "Royal", "glyph": "pardon"},
    "tax_collector": {"deck": "Royal", "glyph": "tax"},
}

random.seed(42)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation/LiberationSerif-Regular.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def add_paper_texture(img: Image.Image, strength: float = 0.05) -> Image.Image:
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


def draw_passage(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.ellipse((cx - 70, cy - 50, cx + 70, cy + 50), fill=INK2)
    d.ellipse((cx - 52, cy - 38, cx + 52, cy + 38), fill=CREAM_HI)
    d.arc((cx - 52, cy - 38, cx + 52, cy + 38), 200, 340, fill=accent, width=5)
    d.rectangle((cx - 8, cy - 10, cx + 8, cy + 38), fill=accent)


def draw_papers(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    for i, off in enumerate([(0, 0), (14, -10), (-12, 8)]):
        x, y = cx + off[0], cy + off[1]
        d.rounded_rectangle((x - 38, y - 28, x + 38, y + 28), radius=6, fill=CREAM_HI, outline=accent, width=2)
        for ly in range(-12, 16, 8):
            d.line((x - 24, y + ly, x + 22, y + ly), fill=INK2, width=2)
    d.line((cx - 10, cy - 18, cx + 28, cy + 22), fill=ROYAL, width=3)


def draw_rumour(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.ellipse((cx - 22, cy - 30, cx + 22, cy + 14), fill=accent)
    d.rectangle((cx - 16, cy + 8, cx + 16, cy + 34), fill=accent)
    for i, ang in enumerate([20, 0, -20]):
        rad = math.radians(ang)
        x2 = cx + int(46 * math.cos(rad))
        y2 = cy - 8 + int(18 * math.sin(rad))
        d.line((cx + 18, cy - 4, x2, y2), fill=GOLDB, width=3)
        d.ellipse((x2 - 8, y2 - 8, x2 + 8, y2 + 8), outline=GOLDB, width=2)


def draw_callout(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.ellipse((cx - 34, cy - 22, cx + 34, cy + 22), fill=CREAM_HI, outline=accent, width=3)
    d.polygon([(cx - 8, cy + 20), (cx + 8, cy + 20), (cx, cy + 42)], fill=CREAM_HI, outline=accent)
    d.ellipse((cx - 12, cy - 8, cx - 2, cy + 2), fill=accent)
    d.ellipse((cx + 2, cy - 8, cx + 12, cy + 2), fill=accent)
    d.arc((cx - 10, cy + 4, cx + 10, cy + 16), 20, 160, fill=accent, width=2)


def draw_knife(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.polygon([(cx - 8, cy + 34), (cx + 8, cy + 34), (cx + 4, cy + 6), (cx - 4, cy + 6)], fill=GUARD)
    d.polygon([(cx - 3, cy + 6), (cx + 3, cy + 6), (cx + 28, cy - 34), (cx - 28, cy - 34)], fill=GOLDS)
    d.line((cx - 28, cy - 34, cx + 28, cy - 34), fill=accent, width=2)


def draw_shield(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    pts = [(cx, cy - 42), (cx + 36, cy - 18), (cx + 28, cy + 32), (cx, cy + 44), (cx - 28, cy + 32), (cx - 36, cy - 18)]
    d.polygon(pts, fill=accent)
    d.polygon([(cx, cy - 30), (cx + 22, cy - 12), (cx + 16, cy + 22), (cx, cy + 30), (cx - 16, cy + 22), (cx - 22, cy - 12)],
              fill=KNIGHT)
    d.line((cx, cy - 24, cx, cy + 18), fill=GOLDS, width=4)
    d.line((cx - 16, cy - 2, cx + 16, cy - 2), fill=GOLDS, width=4)


def draw_arrest(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.arc((cx - 34, cy - 30, cx - 4, cy), 90, 270, fill=accent, width=6)
    d.arc((cx + 4, cy - 30, cx + 34, cy), 270, 90, fill=accent, width=6)
    d.line((cx - 34, cy - 30, cx - 34, cy + 28), fill=accent, width=5)
    d.line((cx + 34, cy - 30, cx + 34, cy + 28), fill=accent, width=5)


def draw_soul(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.ellipse((cx - 26, cy - 20, cx + 26, cy + 24), fill=accent)
    d.rectangle((cx - 18, cy + 10, cx - 6, cy + 34), fill=accent)
    d.rectangle((cx + 6, cy + 10, cx + 18, cy + 34), fill=accent)
    for i, ox in enumerate([-22, 0, 22]):
        d.ellipse((cx + ox - 12, cy + 18, cx + ox + 12, cy + 42), fill=GOLDB, outline=GOLDS, width=2)


def draw_pact(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.arc((cx - 50, cy + 8, cx + 50, cy + 40), 180, 360, fill=INK2, width=3)
    d.line((cx - 42, cy + 22, cx + 42, cy + 22), fill=INK2, width=2)
    d.ellipse((cx - 48, cy - 8, cx - 18, cy + 18), fill=CREAM_HI, outline=accent, width=2)
    d.ellipse((cx + 18, cy - 8, cx + 48, cy + 18), fill=CREAM_HI, outline=accent, width=2)
    d.line((cx - 30, cy + 4, cx - 8, cy + 14), fill=accent, width=3)
    d.line((cx + 30, cy + 4, cx + 8, cy + 14), fill=accent, width=3)


def draw_decree(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.rounded_rectangle((cx - 40, cy - 34, cx + 40, cy + 34), radius=8, fill=CREAM_HI, outline=accent, width=3)
    for ly in range(-18, 20, 9):
        d.line((cx - 26, cy + ly, cx + 20, cy + ly), fill=INK2, width=2)
    d.ellipse((cx + 18, cy + 8, cx + 42, cy + 32), fill=accent)
    d.polygon([(cx + 24, cy + 12), (cx + 36, cy + 20), (cx + 24, cy + 28)], fill=GOLDS)


def draw_pardon(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.ellipse((cx - 8, cy - 34, cx + 8, cy - 18), fill=GOLDB)
    d.polygon([(cx, cy - 18), (cx - 34, cy + 10), (cx - 12, cy + 10), (cx - 12, cy + 36), (cx + 12, cy + 36), (cx + 12, cy + 10), (cx + 34, cy + 10)],
              fill=accent)
    d.ellipse((cx - 20, cy - 6, cx + 20, cy + 26), fill=CREAM_HI, outline=GOLDS, width=2)


def draw_tax(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.polygon([(cx - 28, cy - 28), (cx + 28, cy - 28), (cx + 36, cy + 24), (cx - 36, cy + 24)], fill=accent)
    d.rectangle((cx - 22, cy - 10, cx + 22, cy + 16), fill=GOLDB)
    for ox in (-16, 0, 16):
        d.ellipse((cx + ox - 10, cy + 18, cx + ox + 10, cy + 38), fill=GOLDS, outline=GOLDB, width=2)


GLYPHS = {
    "passage": draw_passage,
    "papers": draw_papers,
    "rumour": draw_rumour,
    "callout": draw_callout,
    "knife": draw_knife,
    "shield": draw_shield,
    "arrest": draw_arrest,
    "soul": draw_soul,
    "pact": draw_pact,
    "decree": draw_decree,
    "pardon": draw_pardon,
    "tax": draw_tax,
}


def render_card(card_id: str, meta: dict) -> Image.Image:
    accent = DECK_ACCENT[meta["deck"]]
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W - 1, H - 1), outline=GOLDB, width=3)
    d.rectangle((6, 6, W - 7, H - 7), outline=GOLDS, width=1)
    # vignette corners
    for x, y in [(12, 12), (W - 28, 12), (12, H - 28), (W - 28, H - 28)]:
        d.arc((x, y, x + 16, y + 16), 0, 90, fill=accent, width=2)

    cx, cy = W // 2, H // 2 - 6
    GLYPHS[meta["glyph"]](d, cx, cy, accent)

    title = card_id.replace("_", " ").title()
    if card_id == "rumour_card":
        title = "Rumour"
    elif card_id == "pardon_card":
        title = "Pardon"
    elif card_id == "call_out":
        title = "Call Out"
    elif card_id == "royal_decree":
        title = "Royal Decree"
    elif card_id == "tax_collector":
        title = "Tax Collector"
    elif card_id == "secret_passage":
        title = "Secret Passage"
    elif card_id == "counterfeit_pass":
        title = "Counterfeit Pass"
    elif card_id == "hidden_knife":
        title = "Hidden Knife"
    elif card_id == "grave_pact":
        title = "Grave Pact"
    elif card_id == "soul_debt":
        title = "Soul Debt"

    f = font(13, bold=True)
    tw = d.textlength(title, font=f)
    d.text((W - tw - 10, H - 22), title, fill=INK, font=f)
    deck = meta["deck"].upper()
    dw = d.textlength(deck, font=font(9))
    d.text(((W - dw) / 2, 8), deck, fill=accent, font=font(9, bold=True))

    return add_paper_texture(img)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    files: dict[str, str] = {}
    for card_id, meta in ICONIC.items():
        fname = f"action-{card_id}-v3b.jpg"
        img = render_card(card_id, meta)
        path = OUT / fname
        img.save(path, "JPEG", quality=88, optimize=True)
        files[card_id] = fname
        print(f"wrote {path} ({path.stat().st_size} bytes)")

    manifest = {
        "template": "V3b action vignettes (programmatic)",
        "pixels": f"{W}x{H}",
        "palette": {
            "cream": "#F4ECD6",
            "ink": "#2A2014",
            "gold": "#A8842C",
            "royal": "#8C2F23",
            "cursed": "#6B2420",
            "knight": "#4A5568",
            "guard": "#5B4C38",
        },
        "cards": files,
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"wrote manifest ({len(files)} cards)")


if __name__ == "__main__":
    main()
