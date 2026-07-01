#!/usr/bin/env python3
"""Generate V3b-style action card vignettes for the full 76-card deck.

Output: static/dethrone/cards/action/action-{card_id}-v3b.jpg + manifest.json
"""
from __future__ import annotations

import json
import math
import random
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dethrone import data as dethrone_data  # noqa: E402

OUT = ROOT / "static" / "dethrone" / "cards" / "action"
DATA_JS = ROOT / "static" / "dethrone" / "js" / "data.js"
EXTRA_JS = ROOT / "static" / "dethrone" / "js" / "cards-extra.js"
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

CARD_RE = re.compile(
    r'\{\s*id:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"\s*,\s*deck:\s*"([^"]+)"\s*,\s*timing:\s*"([^"]+)"',
)

SPECIFIC_GLYPH = {
    "secret_passage": "passage",
    "counterfeit_pass": "papers",
    "rumour_card": "rumour",
    "call_out": "callout",
    "hidden_knife": "knife",
    "shield": "shield",
    "arrest": "arrest",
    "soul_debt": "soul",
    "grave_pact": "pact",
    "royal_decree": "decree",
    "pardon_card": "pardon",
    "tax_collector": "tax",
    "cursed_blade": "cursed_blade",
    "forbidden_tome": "tome",
    "bone_dice": "dice",
    "loaded_dice": "dice",
    "guild_seal": "seal",
    "blood_contract": "contract",
    "mourning_veil": "veil",
    "spare_coin_purse": "coins",
    "market_day": "coins",
    "spirit_coin": "soul",
    "map_of_tunnels": "passage",
    "merchants_map": "boot",
    "smugglers_run": "boot",
    "route_pass": "boot",
    "quick_escape": "boot",
    "flee": "boot",
    "hidden_witness": "scales",
    "crown_witness": "scales",
    "bribe": "scales",
    "sealed_warrant": "scales",
    "banish_letter": "scales",
    "emergency_council": "scales",
    "royal_sacrifice": "coffin",
    "last_rites": "coffin",
    "stolen_offering": "offering",
    "wraith_whisper": "wraith",
    "grave_dust": "skull",
    "training_dummy": "dummy",
    "tavern_brawl": "brawl",
    "bought_round": "mug",
    "performers_tale": "mug",
    "hangover_cure": "mug",
    "herald": "horn",
    "queens_favour": "favour",
    "succession_edict": "crown",
    "royal_purse": "crown",
}

TIMING_GLYPH = {
    "Movement": "boot",
    "Duel": "sword",
    "Vote": "scales",
    "Reaction": "ward",
    "Manual": "contract",
    "OnTurn": "spark",
}

DECK_GLYPH = {
    "Market": "coins",
    "Tavern": "mug",
    "Knowledge": "scroll",
    "Barracks": "sword",
    "Graveyard": "skull",
    "Royal": "crown",
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


def load_card_meta() -> dict[str, dict]:
    text = DATA_JS.read_text(encoding="utf-8") + EXTRA_JS.read_text(encoding="utf-8")
    meta: dict[str, dict] = {}
    for cid, name, deck, timing in CARD_RE.findall(text):
        meta[cid] = {"name": name, "deck": deck, "timing": timing}
    for card in dethrone_data.ACTION_CARDS:
        cid = card["id"]
        if cid not in meta:
            meta[cid] = {
                "name": cid.replace("_", " ").title(),
                "deck": card["deck"],
                "timing": "OnTurn",
            }
    return meta


def glyph_for(card_id: str, deck: str, timing: str) -> str:
    if card_id in SPECIFIC_GLYPH:
        return SPECIFIC_GLYPH[card_id]
    if "knife" in card_id or "blade" in card_id or "parry" in card_id:
        return "sword"
    if "shield" in card_id or "guard" in card_id or "gauntlet" in card_id:
        return "shield"
    if "map" in card_id or "pass" in card_id or "escape" in card_id or "run" in card_id:
        return "boot"
    if "rumour" in card_id or "whisper" in card_id or "doubt" in card_id or "round" in card_id:
        return "mug"
    if "vote" in card_id or "witness" in card_id or "warrant" in card_id or "council" in card_id:
        return "scales"
    if "grave" in card_id or "soul" in card_id or "spirit" in card_id or "wraith" in card_id:
        return "skull"
    if "royal" in card_id or "queen" in card_id or "crown" in card_id or "herald" in card_id:
        return "crown"
    if "prophecy" in card_id or "records" in card_id or "ledger" in card_id or "trace" in card_id:
        return "scroll"
    if timing in TIMING_GLYPH:
        g = TIMING_GLYPH[timing]
        if g != "spark":
            return g
    return DECK_GLYPH.get(deck, "spark")


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
    for off in [(0, 0), (14, -10), (-12, 8)]:
        x, y = cx + off[0], cy + off[1]
        d.rounded_rectangle((x - 38, y - 28, x + 38, y + 28), radius=6, fill=CREAM_HI, outline=accent, width=2)
        for ly in range(-12, 16, 8):
            d.line((x - 24, y + ly, x + 22, y + ly), fill=INK2, width=2)
    d.line((cx - 10, cy - 18, cx + 28, cy + 22), fill=ROYAL, width=3)


def draw_rumour(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.ellipse((cx - 22, cy - 30, cx + 22, cy + 14), fill=accent)
    d.rectangle((cx - 16, cy + 8, cx + 16, cy + 34), fill=accent)
    for ang in [20, 0, -20]:
        rad = math.radians(ang)
        x2 = cx + int(46 * math.cos(rad))
        y2 = cy - 8 + int(18 * math.sin(rad))
        d.line((cx + 18, cy - 4, x2, y2), fill=GOLDB, width=3)


def draw_mug(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.rounded_rectangle((cx - 24, cy - 22, cx + 24, cy + 28), radius=8, fill=accent)
    d.arc((cx + 20, cy - 8, cx + 44, cy + 16), 270, 90, fill=GOLDB, width=4)
    d.ellipse((cx - 16, cy - 16, cx + 16, cy + 4), fill=GOLDS)


def draw_callout(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.ellipse((cx - 34, cy - 22, cx + 34, cy + 22), fill=CREAM_HI, outline=accent, width=3)
    d.polygon([(cx - 8, cy + 20), (cx + 8, cy + 20), (cx, cy + 42)], fill=CREAM_HI, outline=accent)
    d.ellipse((cx - 12, cy - 8, cx - 2, cy + 2), fill=accent)
    d.ellipse((cx + 2, cy - 8, cx + 12, cy + 2), fill=accent)


def draw_knife(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.polygon([(cx - 8, cy + 34), (cx + 8, cy + 34), (cx + 4, cy + 6), (cx - 4, cy + 6)], fill=GUARD)
    d.polygon([(cx - 3, cy + 6), (cx + 3, cy + 6), (cx + 28, cy - 34), (cx - 28, cy - 34)], fill=GOLDS)


def draw_shield(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    pts = [(cx, cy - 42), (cx + 36, cy - 18), (cx + 28, cy + 32), (cx, cy + 44), (cx - 28, cy + 32), (cx - 36, cy - 18)]
    d.polygon(pts, fill=accent)
    d.line((cx, cy - 24, cx, cy + 18), fill=GOLDS, width=4)
    d.line((cx - 16, cy - 2, cx + 16, cy - 2), fill=GOLDS, width=4)


def draw_sword(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.polygon([(cx - 4, cy + 28), (cx + 4, cy + 28), (cx + 2, cy - 8), (cx - 2, cy - 8)], fill=GUARD)
    d.polygon([(cx - 2, cy - 8), (cx + 2, cy - 8), (cx + 6, cy - 38), (cx - 6, cy - 38)], fill=GOLDS)
    d.line((cx - 18, cy + 8, cx + 18, cy + 8), fill=accent, width=4)


def draw_arrest(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.arc((cx - 34, cy - 30, cx - 4, cy), 90, 270, fill=accent, width=6)
    d.arc((cx + 4, cy - 30, cx + 34, cy), 270, 90, fill=accent, width=6)
    d.line((cx - 34, cy - 30, cx - 34, cy + 28), fill=accent, width=5)
    d.line((cx + 34, cy - 30, cx + 34, cy + 28), fill=accent, width=5)


def draw_soul(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.ellipse((cx - 26, cy - 20, cx + 26, cy + 24), fill=accent)
    d.rectangle((cx - 18, cy + 10, cx - 6, cy + 34), fill=accent)
    d.rectangle((cx + 6, cy + 10, cx + 18, cy + 34), fill=accent)
    for ox in (-22, 0, 22):
        d.ellipse((cx + ox - 12, cy + 18, cx + ox + 12, cy + 42), fill=GOLDB, outline=GOLDS, width=2)


def draw_pact(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.arc((cx - 50, cy + 8, cx + 50, cy + 40), 180, 360, fill=INK2, width=3)
    d.ellipse((cx - 48, cy - 8, cx - 18, cy + 18), fill=CREAM_HI, outline=accent, width=2)
    d.ellipse((cx + 18, cy - 8, cx + 48, cy + 18), fill=CREAM_HI, outline=accent, width=2)


def draw_decree(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.rounded_rectangle((cx - 40, cy - 34, cx + 40, cy + 34), radius=8, fill=CREAM_HI, outline=accent, width=3)
    for ly in range(-18, 20, 9):
        d.line((cx - 26, cy + ly, cx + 20, cy + ly), fill=INK2, width=2)
    d.ellipse((cx + 18, cy + 8, cx + 42, cy + 32), fill=accent)


def draw_pardon(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.ellipse((cx - 8, cy - 34, cx + 8, cy - 18), fill=GOLDB)
    d.polygon([(cx, cy - 18), (cx - 34, cy + 10), (cx + 34, cy + 10)], fill=accent)


def draw_tax(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.polygon([(cx - 28, cy - 28), (cx + 28, cy - 28), (cx + 36, cy + 24), (cx - 36, cy + 24)], fill=accent)
    for ox in (-16, 0, 16):
        d.ellipse((cx + ox - 10, cy + 18, cx + ox + 10, cy + 38), fill=GOLDS, outline=GOLDB, width=2)


def draw_coins(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    for ox, oy in [(-18, 6), (0, -8), (18, 6)]:
        d.ellipse((cx + ox - 16, cy + oy - 16, cx + ox + 16, cy + oy + 16), fill=GOLDB, outline=accent, width=2)


def draw_boot(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.rounded_rectangle((cx - 20, cy - 18, cx + 8, cy + 20), radius=6, fill=accent)
    d.polygon([(cx + 8, cy + 4), (cx + 34, cy + 4), (cx + 34, cy + 20), (cx + 8, cy + 20)], fill=accent)


def draw_scales(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.line((cx, cy - 30, cx, cy + 28), fill=accent, width=4)
    d.line((cx - 36, cy - 12, cx + 36, cy - 12), fill=accent, width=3)
    for ox in (-36, 36):
        d.ellipse((cx + ox - 14, cy + 2, cx + ox + 14, cy + 18), fill=GOLDB, outline=accent, width=2)


def draw_scroll(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.rounded_rectangle((cx - 34, cy - 28, cx + 34, cy + 28), radius=6, fill=CREAM_HI, outline=accent, width=3)
    for ly in range(-14, 18, 8):
        d.line((cx - 22, cy + ly, cx + 18, cy + ly), fill=INK2, width=2)


def draw_skull(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.ellipse((cx - 28, cy - 26, cx + 28, cy + 14), fill=accent)
    d.rectangle((cx - 20, cy + 6, cx - 8, cy + 30), fill=accent)
    d.rectangle((cx + 8, cy + 6, cx + 20, cy + 30), fill=accent)
    d.ellipse((cx - 14, cy - 10, cx - 4, cy), fill=CREAM_HI)
    d.ellipse((cx + 4, cy - 10, cx + 14, cy), fill=CREAM_HI)


def draw_crown(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.polygon([(cx - 30, cy + 16), (cx - 22, cy - 18), (cx - 8, cy + 2), (cx, cy - 24),
               (cx + 8, cy + 2), (cx + 22, cy - 18), (cx + 30, cy + 16)], fill=GOLDB, outline=accent)
    d.rectangle((cx - 32, cy + 14, cx + 32, cy + 26), fill=accent)


def draw_ward(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    draw_shield(d, cx, cy, accent)
    d.ellipse((cx - 44, cy - 36, cx - 24, cy - 16), fill=GOLDS)


def draw_spark(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    for ang in range(0, 360, 45):
        rad = math.radians(ang)
        x2 = cx + int(28 * math.cos(rad))
        y2 = cy + int(28 * math.sin(rad))
        d.line((cx, cy, x2, y2), fill=GOLDB, width=3)
    d.ellipse((cx - 10, cy - 10, cx + 10, cy + 10), fill=accent)


def draw_contract(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    draw_papers(d, cx, cy, accent)
    d.line((cx - 30, cy + 18, cx - 10, cy + 8), fill=CURSED, width=3)


def draw_tome(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.rounded_rectangle((cx - 30, cy - 34, cx + 30, cy + 34), radius=4, fill=accent)
    d.rectangle((cx - 22, cy - 26, cx + 22, cy + 26), fill=INK)
    d.line((cx, cy - 26, cx, cy + 26), fill=CURSED, width=2)


def draw_dice(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.rounded_rectangle((cx - 28, cy - 28, cx + 28, cy + 28), radius=8, fill=CREAM_HI, outline=accent, width=3)
    for ox, oy in [(-10, -10), (10, 10), (-10, 10)]:
        d.ellipse((cx + ox - 5, cy + oy - 5, cx + ox + 5, cy + oy + 5), fill=accent)


def draw_seal(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.ellipse((cx - 32, cy - 32, cx + 32, cy + 32), fill=accent)
    d.ellipse((cx - 20, cy - 20, cx + 20, cy + 20), fill=GOLDB)
    d.polygon([(cx, cy - 12), (cx + 10, cy + 10), (cx - 10, cy + 10)], fill=accent)


def draw_veil(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.pieslice((cx - 40, cy - 30, cx + 40, cy + 30), 200, 340, fill=accent)
    d.arc((cx - 30, cy - 10, cx + 30, cy + 30), 0, 180, fill=GOLDS, width=3)


def draw_coffin(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.polygon([(cx - 34, cy - 16), (cx + 34, cy - 16), (cx + 26, cy + 28), (cx - 26, cy + 28)], fill=accent)
    d.line((cx - 34, cy - 4, cx + 34, cy - 4), fill=GOLDS, width=3)


def draw_offering(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    draw_coins(d, cx, cy - 8, accent)
    d.arc((cx - 40, cy + 10, cx + 40, cy + 34), 180, 360, fill=INK2, width=3)


def draw_wraith(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.ellipse((cx - 20, cy - 28, cx + 20, cy + 4), fill=GOLDS)
    for x in range(cx - 24, cx + 25, 12):
        d.line((x, cy + 4, x, cy + 32), fill=accent, width=3)


def draw_brawl(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    draw_sword(d, cx - 16, cy, accent)
    draw_sword(d, cx + 16, cy, accent)


def draw_dummy(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.ellipse((cx - 16, cy - 30, cx + 16, cy - 2), fill=GOLDB)
    d.rounded_rectangle((cx - 22, cy - 2, cx + 22, cy + 34), radius=8, fill=accent)
    d.line((cx - 30, cy + 8, cx - 22, cy + 20), fill=GUARD, width=4)
    d.line((cx + 30, cy + 8, cx + 22, cy + 20), fill=GUARD, width=4)


def draw_horn(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    d.pieslice((cx - 36, cy - 24, cx + 36, cy + 24), 300, 120, fill=GOLDB, outline=accent, width=3)


def draw_favour(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    draw_crown(d, cx, cy - 6, accent)
    d.polygon([(cx - 8, cy + 18), (cx, cy + 34), (cx + 8, cy + 18)], fill=ROYAL)


def draw_cursed_blade(d: ImageDraw.ImageDraw, cx: int, cy: int, accent: tuple[int, int, int]) -> None:
    draw_sword(d, cx, cy, CURSED)
    d.ellipse((cx + 14, cy - 30, cx + 30, cy - 14), fill=GOLDS)


GLYPHS = {
    "passage": draw_passage, "papers": draw_papers, "rumour": draw_rumour, "mug": draw_mug,
    "callout": draw_callout, "knife": draw_knife, "shield": draw_shield, "sword": draw_sword,
    "arrest": draw_arrest, "soul": draw_soul, "pact": draw_pact, "decree": draw_decree,
    "pardon": draw_pardon, "tax": draw_tax, "coins": draw_coins, "boot": draw_boot,
    "scales": draw_scales, "scroll": draw_scroll, "skull": draw_skull, "crown": draw_crown,
    "ward": draw_ward, "spark": draw_spark, "contract": draw_contract, "tome": draw_tome,
    "dice": draw_dice, "seal": draw_seal, "veil": draw_veil, "coffin": draw_coffin,
    "offering": draw_offering, "wraith": draw_wraith, "brawl": draw_brawl, "dummy": draw_dummy,
    "horn": draw_horn, "favour": draw_favour, "cursed_blade": draw_cursed_blade,
}


def wrap_title(title: str, max_len: int = 22) -> str:
    if len(title) <= max_len:
        return title
    words = title.split()
    line, lines = "", []
    for w in words:
        if len(line) + len(w) + 1 <= max_len:
            line = (line + " " + w).strip()
        else:
            if line:
                lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines[0] if len(lines) == 1 else lines[0][: max_len - 1] + "…"


def render_card(card_id: str, meta: dict) -> Image.Image:
    deck = meta["deck"]
    accent = DECK_ACCENT[deck]
    glyph_name = glyph_for(card_id, deck, meta["timing"])
    img = Image.new("RGB", (W, H), CREAM)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W - 1, H - 1), outline=GOLDB, width=3)
    d.rectangle((6, 6, W - 7, H - 7), outline=GOLDS, width=1)

    seed = sum(ord(c) for c in card_id)
    rng = random.Random(seed)
    for _ in range(6):
        x, y = rng.randint(10, W - 20), rng.randint(10, H - 40)
        d.ellipse((x, y, x + 6, y + 6), fill=(
            min(255, accent[0] + rng.randint(-10, 10)),
            min(255, accent[1] + rng.randint(-10, 10)),
            min(255, accent[2] + rng.randint(-10, 10)),
        ))

    cx, cy = W // 2, H // 2 - 8
    GLYPHS[glyph_name](d, cx, cy, accent)

    title = wrap_title(meta["name"])
    f = font(12 if len(title) < 18 else 10, bold=True)
    tw = d.textlength(title, font=f)
    d.text((max(8, W - tw - 10), H - 22), title, fill=INK, font=f)
    deck_lbl = deck.upper()
    dw = d.textlength(deck_lbl, font=font(9))
    d.text(((W - dw) / 2, 8), deck_lbl, fill=accent, font=font(9, bold=True))

    return add_paper_texture(img)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    meta = load_card_meta()
    assert len(dethrone_data.ACTION_CARDS) == 76, len(dethrone_data.ACTION_CARDS)

    files: dict[str, str] = {}
    for card in dethrone_data.ACTION_CARDS:
        card_id = card["id"]
        info = meta[card_id]
        fname = f"action-{card_id}-v3b.jpg"
        img = render_card(card_id, info)
        path = OUT / fname
        img.save(path, "JPEG", quality=88, optimize=True)
        files[card_id] = fname

    manifest = {
        "template": "V3b action vignettes (full 76-card deck)",
        "pixels": f"{W}x{H}",
        "count": len(files),
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
    print(f"wrote {len(files)} action card vignettes to {OUT}")


if __name__ == "__main__":
    main()
