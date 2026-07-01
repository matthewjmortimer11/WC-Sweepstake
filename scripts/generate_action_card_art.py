#!/usr/bin/env python3
"""Generate stylised V3b action card vignettes for the full 76-card deck.

Poster-style frames, deck gradients, wax timing seals, and per-card motifs.
Output: static/dethrone/cards/action/action-{card_id}-v3b.jpg
"""
from __future__ import annotations

import json
import math
import random
import re
import sys
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from dethrone import data as dethrone_data  # noqa: E402

OUT = ROOT / "static" / "dethrone" / "cards" / "action"
DATA_JS = ROOT / "static" / "dethrone" / "js" / "data.js"
EXTRA_JS = ROOT / "static" / "dethrone" / "js" / "cards-extra.js"
W, H = 400, 224

CREAM = (244, 236, 214)
CREAM_HI = (251, 246, 233)
PARCH = (238, 228, 204)
INK = (42, 32, 20)
INK2 = (91, 76, 56)
GOLD = (168, 132, 44)
GOLDB = (199, 154, 58)
GOLDS = (232, 212, 154)
ROYAL = (140, 47, 35)
CURSED = (107, 36, 32)
KNIGHT = (74, 85, 104)
GUARD = (91, 76, 56)
MOSS = (90, 110, 58)

DECK_ACCENT = {
    "Market": GUARD,
    "Tavern": (110, 82, 52),
    "Knowledge": INK,
    "Barracks": KNIGHT,
    "Graveyard": CURSED,
    "Royal": ROYAL,
}
DECK_SKY = {
    "Market": (214, 198, 168),
    "Tavern": (208, 186, 152),
    "Knowledge": (196, 188, 172),
    "Barracks": (186, 190, 198),
    "Graveyard": (168, 158, 152),
    "Royal": (210, 186, 176),
}
TIMING_SEAL = {
    "OnTurn": ("T", GOLDB),
    "Movement": ("M", MOSS),
    "Reaction": ("R", KNIGHT),
    "Duel": ("D", INK),
    "Vote": ("V", ROYAL),
    "Manual": ("!", INK2),
}

CARD_RE = re.compile(
    r'\{\s*id:\s*"([^"]+)"\s*,\s*name:\s*"([^"]+)"\s*,\s*deck:\s*"([^"]+)"\s*,\s*timing:\s*"([^"]+)"',
)

# Per-card art recipe: scene name + optional flags
CARD_ART: dict[str, dict] = {
    "secret_passage": {"scene": "arch"},
    "bribe": {"scene": "coins_hand"},
    "counterfeit_pass": {"scene": "forged"},
    "quick_escape": {"scene": "boots"},
    "trade_licence": {"scene": "scales_trade"},
    "rumour_card": {"scene": "tavern_mug"},
    "false_rumour": {"scene": "tavern_mug", "corrupt": True},
    "flee": {"scene": "boots", "fast": True},
    "blood_contract": {"scene": "blood_oath"},
    "drunken_alibi": {"scene": "tavern_mug", "sleepy": True},
    "call_out": {"scene": "accusation", "corrupt": True},
    "trace_steps": {"scene": "footprints"},
    "read_records": {"scene": "archive"},
    "route_pass": {"scene": "path_gate"},
    "hidden_witness": {"scene": "veiled_eye"},
    "hidden_knife": {"scene": "dagger"},
    "shield": {"scene": "shield"},
    "dirty_trick": {"scene": "dagger", "corrupt": True},
    "arrest": {"scene": "manacles"},
    "disarm_card": {"scene": "crossed_blades"},
    "grave_pact": {"scene": "grave_hands", "corrupt": True},
    "blackmail": {"scene": "sealed_letter"},
    "cursed_blade": {"scene": "cursed_sword", "corrupt": True},
    "soul_debt": {"scene": "soul_jar", "corrupt": True},
    "royal_sacrifice": {"scene": "coffin_crown"},
    "royal_decree": {"scene": "royal_scroll"},
    "pardon_card": {"scene": "dove"},
    "tax_collector": {"scene": "tax_bag"},
    "royal_guard_detail": {"scene": "shield", "royal": True},
    "emergency_council": {"scene": "royal_scroll", "crowd": True},
    "merchants_map": {"scene": "rolled_map"},
    "smugglers_run": {"scene": "boots", "shadow": True},
    "guild_seal": {"scene": "wax_seal"},
    "loaded_dice": {"scene": "dice"},
    "fence": {"scene": "coins_hand", "swap": True},
    "caravan_manifest": {"scene": "wagon"},
    "spare_coin_purse": {"scene": "purse"},
    "market_day": {"scene": "stall"},
    "bought_round": {"scene": "tavern_mug", "cheers": True},
    "tavern_brawl": {"scene": "brawl"},
    "whisper_network": {"scene": "whisper"},
    "loan_shark": {"scene": "coins_hand", "sharp": True},
    "stitched_lip": {"scene": "stitched"},
    "performers_tale": {"scene": "mask"},
    "hangover_cure": {"scene": "tonic"},
    "sow_doubt": {"scene": "question"},
    "study_companion": {"scene": "desk"},
    "sealed_warrant": {"scene": "royal_scroll", "dark": True},
    "witness_statement": {"scene": "quill"},
    "old_prophecy": {"scene": "crystal"},
    "map_of_tunnels": {"scene": "arch", "deep": True},
    "court_summons": {"scene": "throne_call"},
    "alibi_check": {"scene": "hourglass"},
    "secret_ledger": {"scene": "ledger"},
    "training_dummy": {"scene": "dummy"},
    "second_blade": {"scene": "twin_blades"},
    "parry": {"scene": "shield", "spark": True},
    "intimidate": {"scene": "fist"},
    "challenged_again": {"scene": "cursed_sword", "repeat": True},
    "iron_gauntlet": {"scene": "gauntlet"},
    "veterans_warning": {"scene": "banner"},
    "mourning_veil": {"scene": "veil"},
    "spirit_coin": {"scene": "soul_jar"},
    "bone_dice": {"scene": "dice", "corrupt": True},
    "grave_dust": {"scene": "urn"},
    "last_rites": {"scene": "candle"},
    "stolen_offering": {"scene": "offering"},
    "wraith_whisper": {"scene": "wraith"},
    "forbidden_tome": {"scene": "tome", "corrupt": True},
    "queens_favour": {"scene": "rose"},
    "succession_edict": {"scene": "crown_empty"},
    "herald": {"scene": "horn"},
    "royal_purse": {"scene": "tax_bag", "royal": True},
    "banish_letter": {"scene": "royal_scroll", "banish": True},
    "kneel": {"scene": "kneel"},
    "crown_witness": {"scene": "scales_trade", "crown": True},
}

random.seed(42)


def font(size: int, bold: bool = False, italic: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    if italic:
        paths = ["/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf"]
    elif bold:
        paths = ["/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"]
    else:
        paths = ["/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"]
    for path in paths:
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


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def deck_gradient(img: Image.Image, deck: str) -> None:
    accent = DECK_SKY.get(deck, CREAM)
    px = img.load()
    for y in range(H - 52):
        t = y / max(1, H - 52)
        for x in range(W):
            r = lerp(CREAM_HI[0], accent[0], t * 0.55)
            g = lerp(CREAM_HI[1], accent[1], t * 0.55)
            b = lerp(CREAM_HI[2], accent[2], t * 0.55)
            px[x, y] = (r, g, b)


def add_paper_texture(img: Image.Image, strength: float = 0.04) -> Image.Image:
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


def draw_frame(d: ImageDraw.ImageDraw, deck: str, accent: tuple[int, int, int]) -> tuple[int, int, int, int]:
    """Return inner panel box."""
    d.rectangle((0, 0, W - 1, H - 1), outline=GOLD, width=3)
    d.rectangle((4, 4, W - 5, H - 5), outline=GOLDS, width=1)
    inner = (14, 14, W - 15, H - 44)
    d.rounded_rectangle(inner, radius=10, outline=accent, width=2)
    for ox, oy in [(22, 22), (W - 22, 22)]:
        d.arc((ox - 10, oy - 10, ox + 10, oy + 10), 0, 90, fill=GOLD, width=2)
    # deck footer strip
    d.rectangle((0, H - 38, W, H), fill=accent)
    d.rectangle((0, H - 38, W, H - 36), fill=GOLDS)
    return inner


def draw_timing_seal(d: ImageDraw.ImageDraw, timing: str, accent: tuple[int, int, int]) -> None:
    letter, col = TIMING_SEAL.get(timing, ("·", INK2))
    d.ellipse((18, 18, 46, 46), fill=CREAM_HI, outline=GOLD, width=2)
    d.ellipse((22, 22, 42, 42), fill=col)
    d.text((32, 33), letter, fill=CREAM_HI, font=font(14, bold=True), anchor="mm")


def draw_corrupt_mist(d: ImageDraw.ImageDraw, inner: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = inner
    d.ellipse((x0 + 20, y1 - 90, x1 - 20, y1 + 10), fill=(107, 36, 32, 0))
    for i in range(4):
        d.arc((x0 - 10 + i * 8, y0, x1 + 10 - i * 8, y1), 200, 340, fill=(140, 47, 35), width=2)


def cxcy(inner: tuple[int, int, int, int]) -> tuple[int, int]:
    x0, y0, x1, y1 = inner
    return (x0 + x1) // 2, (y0 + y1) // 2 + 4


# ---- scene painters (stylised silhouettes + gold trim) ----

def scene_arch(d: ImageDraw.ImageDraw, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    deep = opts.get("deep")
    d.ellipse((cx - 58, cy - 42, cx + 58, cy + 42), fill=INK2)
    d.ellipse((cx - 44, cy - 32, cx + 44, cy + 32), fill=CREAM_HI)
    d.arc((cx - 44, cy - 32, cx + 44, cy + 32), 200, 340, fill=accent, width=5)
  # tunnel depth
    if deep:
        d.rectangle((cx - 18, cy - 8, cx + 18, cy + 38), fill=INK)
    else:
        d.rectangle((cx - 12, cy - 4, cx + 12, cy + 32), fill=accent)
    d.line((cx - 44, cy + 10, cx + 44, cy + 10), fill=GOLDS, width=2)


def scene_coins_hand(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.ellipse((cx - 36, cy - 8, cx + 36, cy + 40), fill=(210, 178, 130))
    for ox in (-22, 0, 22):
        d.ellipse((cx + ox - 16, cy - 28, cx + ox + 16, cy + 4), fill=GOLDB, outline=accent, width=2)
    if opts.get("sharp"):
        d.polygon([(cx + 40, cy - 20), (cx + 58, cy), (cx + 40, cy + 20)], fill=accent)


def scene_forged(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.rounded_rectangle((cx - 42, cy - 30, cx + 42, cy + 30), radius=6, fill=CREAM_HI, outline=accent, width=3)
    d.line((cx - 28, cy - 12, cx + 28, cy + 12), fill=ROYAL, width=4)
    d.line((cx - 20, cy + 4, cx + 24, cy + 4), fill=INK2, width=2)


def scene_boots(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    shadow = opts.get("shadow")
    col = INK if shadow else accent
    d.rounded_rectangle((cx - 34, cy - 20, cx - 2, cy + 28), radius=8, fill=col)
    d.rounded_rectangle((cx + 2, cy - 12, cx + 38, cy + 28), radius=8, fill=col)
    if opts.get("fast"):
        for ox in (-50, 50):
            d.line((cx + ox, cy - 30, cx + ox + 14, cy - 30), fill=GOLDB, width=3)


def scene_scales_trade(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.line((cx, cy - 36, cx, cy + 30), fill=accent, width=4)
    d.line((cx - 44, cy - 14, cx + 44, cy - 14), fill=GOLDB, width=3)
    for ox in (-44, 44):
        d.ellipse((cx + ox - 18, cy + 2, cx + ox + 18, cy + 22), fill=GOLDB, outline=accent, width=2)
    if opts.get("crown"):
        d.polygon([(cx - 12, cy - 34), (cx, cy - 50), (cx + 12, cy - 34)], fill=GOLDB)


def scene_tavern_mug(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.rounded_rectangle((cx - 26, cy - 24, cx + 26, cy + 28), radius=10, fill=accent)
    d.arc((cx + 18, cy - 8, cx + 44, cy + 16), 270, 90, fill=GOLDB, width=5)
    d.ellipse((cx - 18, cy - 18, cx + 18, cy + 2), fill=GOLDS)
    if opts.get("corrupt"):
        d.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=CURSED)
    if opts.get("cheers"):
        d.line((cx - 50, cy - 20, cx - 30, cy - 8), fill=GOLDB, width=3)
        d.line((cx + 30, cy - 8, cx + 50, cy - 20), fill=GOLDB, width=3)


def scene_blood_oath(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.rounded_rectangle((cx - 38, cy - 28, cx + 38, cy + 28), radius=4, fill=CREAM_HI, outline=accent, width=2)
    d.line((cx - 20, cy + 12, cx - 4, cy - 4), fill=CURSED, width=4)
    d.line((cx + 20, cy + 12, cx + 4, cy - 4), fill=CURSED, width=4)
    d.ellipse((cx - 6, cy - 2, cx + 6, cy + 10), fill=ROYAL)


def scene_accusation(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.ellipse((cx - 30, cy - 22, cx + 30, cy + 18), fill=CREAM_HI, outline=accent, width=3)
    d.polygon([(cx - 8, cy + 16), (cx + 8, cy + 16), (cx, cy + 36)], fill=CREAM_HI, outline=accent)
    d.line((cx, cy - 30, cx, cy - 48), fill=GOLDB, width=3)
    d.polygon([(cx, cy - 52), (cx - 10, cy - 36), (cx + 10, cy - 36)], fill=ROYAL)


def scene_footprints(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    for i, ox in enumerate([-24, 0, 24]):
        oy = i * 10
        d.ellipse((cx + ox - 8, cy + oy - 14, cx + ox + 8, cy + oy + 2), fill=accent)
        d.rectangle((cx + ox - 4, cy + oy + 2, cx + ox + 4, cy + oy + 16), fill=accent)


def scene_archive(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.rectangle((cx - 48, cy - 32, cx + 48, cy + 32), fill=PARCH, outline=accent, width=2)
    for x in (cx - 32, cx, cx + 32):
        d.rectangle((x - 10, cy - 24, x + 10, cy + 24), fill=CREAM_HI, outline=INK2, width=1)


def scene_path_gate(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.rectangle((cx - 40, cy - 10, cx - 28, cy + 34), fill=accent)
    d.rectangle((cx + 28, cy - 10, cx + 40, cy + 34), fill=accent)
    d.arc((cx - 40, cy - 34, cx + 40, cy + 10), 180, 0, fill=GOLDS, width=4)


def scene_veiled_eye(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.ellipse((cx - 34, cy - 18, cx + 34, cy + 18), fill=accent)
    d.ellipse((cx - 16, cy - 8, cx + 16, cy + 8), fill=CREAM_HI)
    d.ellipse((cx - 6, cy - 4, cx + 6, cy + 4), fill=INK)


def scene_dagger(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.polygon([(cx - 6, cy + 32), (cx + 6, cy + 32), (cx + 3, cy + 4), (cx - 3, cy + 4)], fill=GUARD)
    d.polygon([(cx - 2, cy + 4), (cx + 2, cy + 4), (cx + 22, cy - 36), (cx - 22, cy - 36)], fill=GOLDS)
    d.line((cx - 22, cy - 36, cx + 22, cy - 36), fill=accent, width=2)


def scene_shield(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    col = ROYAL if opts.get("royal") else accent
    pts = [(cx, cy - 40), (cx + 34, cy - 16), (cx + 26, cy + 28), (cx, cy + 38), (cx - 26, cy + 28), (cx - 34, cy - 16)]
    d.polygon(pts, fill=col, outline=GOLDS)
    d.line((cx, cy - 28, cx, cy + 20), fill=GOLDS, width=3)
    if opts.get("spark"):
        d.line((cx - 30, cy - 36, cx - 10, cy - 50), fill=GOLDB, width=3)


def scene_manacles(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.arc((cx - 32, cy - 28, cx - 4, cy), 90, 270, fill=accent, width=6)
    d.arc((cx + 4, cy - 28, cx + 32, cy), 270, 90, fill=accent, width=6)


def scene_crossed_blades(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    for ang in (-28, 28):
        rad = math.radians(ang)
        x2 = cx + int(40 * math.sin(rad))
        y2 = cy - int(40 * math.cos(rad))
        d.line((cx, cy + 20, x2, y2 - 30), fill=GOLDS, width=5)


def scene_grave_hands(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.arc((cx - 50, cy + 4, cx + 50, cy + 36), 180, 360, fill=INK2, width=3)
    for ox in (-28, 28):
        d.ellipse((cx + ox - 16, cy - 16, cx + ox + 16, cy + 16), fill=CREAM_HI, outline=accent, width=2)


def scene_sealed_letter(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.rounded_rectangle((cx - 36, cy - 28, cx + 36, cy + 28), radius=4, fill=CREAM_HI, outline=accent, width=2)
    d.ellipse((cx + 14, cy + 8, cx + 34, cy + 28), fill=CURSED)
    d.polygon([(cx + 20, cy + 12), (cx + 30, cy + 18), (cx + 20, cy + 24)], fill=GOLDS)


def scene_cursed_sword(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.polygon([(cx - 3, cy + 28), (cx + 3, cy + 28), (cx + 2, cy - 8), (cx - 2, cy - 8)], fill=GUARD)
    d.polygon([(cx - 2, cy - 8), (cx + 2, cy - 8), (cx + 8, cy - 44), (cx - 8, cy - 44)], fill=CURSED, outline=GOLDS)
    if opts.get("repeat"):
        d.arc((cx + 20, cy - 20, cx + 44, cy + 4), 0, 270, fill=GOLDB, width=2)


def scene_soul_jar(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.polygon([(cx - 24, cy + 28), (cx + 24, cy + 28), (cx + 18, cy - 24), (cx - 18, cy - 24)], fill=accent)
    d.ellipse((cx - 16, cy - 36, cx + 16, cy - 12), fill=GOLDS)
    d.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=CREAM_HI)


def scene_coffin_crown(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.polygon([(cx - 36, cy - 12), (cx + 36, cy - 12), (cx + 28, cy + 30), (cx - 28, cy + 30)], fill=accent)
    d.polygon([(cx - 14, cy - 28), (cx, cy - 44), (cx + 14, cy - 28)], fill=GOLDB, outline=ROYAL)


def scene_royal_scroll(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    col = INK if opts.get("dark") else CREAM_HI
    d.rounded_rectangle((cx - 40, cy - 30, cx + 40, cy + 30), radius=6, fill=col, outline=accent, width=3)
    for ly in range(-16, 18, 8):
        d.line((cx - 26, cy + ly, cx + 16, cy + ly), fill=INK2, width=2)
    d.ellipse((cx + 18, cy + 6, cx + 40, cy + 28), fill=ROYAL if not opts.get("banish") else CURSED)


def scene_dove(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.ellipse((cx - 8, cy - 28, cx + 8, cy - 12), fill=GOLDB)
    d.polygon([(cx, cy - 12), (cx - 30, cy + 16), (cx + 30, cy + 16)], fill=accent)


def scene_tax_bag(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    col = ROYAL if opts.get("royal") else accent
    d.polygon([(cx - 26, cy - 24), (cx + 26, cy - 24), (cx + 32, cy + 24), (cx - 32, cy + 24)], fill=col)
    d.line((cx - 18, cy - 8, cx + 18, cy - 8), fill=GOLDS, width=3)
    for ox in (-14, 0, 14):
        d.ellipse((cx + ox - 8, cy + 10, cx + ox + 8, cy + 26), fill=GOLDB)


def scene_wax_seal(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.ellipse((cx - 34, cy - 34, cx + 34, cy + 34), fill=accent)
    d.ellipse((cx - 22, cy - 22, cx + 22, cy + 22), fill=GOLDB)
    d.text((cx, cy + 2), "G", fill=accent, font=font(28, bold=True), anchor="mm")


def scene_dice(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    fill = CURSED if opts.get("corrupt") else CREAM_HI
    d.rounded_rectangle((cx - 30, cy - 30, cx + 30, cy + 30), radius=8, fill=fill, outline=accent, width=3)
    for ox, oy in [(-10, -10), (10, 10), (-10, 10)]:
        d.ellipse((cx + ox - 5, cy + oy - 5, cx + ox + 5, cy + oy + 5), fill=accent)


def scene_wagon(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.rectangle((cx - 40, cy - 8, cx + 30, cy + 16), fill=accent)
    d.ellipse((cx - 28, cy + 12, cx - 8, cy + 32), fill=INK)
    d.ellipse((cx + 8, cy + 12, cx + 28, cy + 32), fill=INK)
    d.line((cx + 30, cy, cx + 48, cy - 20), fill=GOLDB, width=3)


def scene_purse(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.arc((cx - 28, cy - 20, cx + 28, cy + 20), 180, 0, fill=accent, width=20)
    d.rectangle((cx - 28, cy, cx + 28, cy + 24), fill=accent)
    d.arc((cx - 12, cy - 32, cx + 12, cy - 8), 180, 0, fill=GOLDB, width=4)


def scene_stall(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.polygon([(cx - 44, cy + 20), (cx + 44, cy + 20), (cx, cy - 28)], fill=GOLDS, outline=accent)
    d.rectangle((cx - 36, cy + 20, cx + 36, cy + 32), fill=accent)
    d.ellipse((cx - 16, cy + 6, cx - 4, cy + 18), fill=GOLDB)
    d.ellipse((cx + 4, cy + 6, cx + 16, cy + 18), fill=GOLDB)


def scene_brawl(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    scene_crossed_blades(d, inner, accent, opts)
    d.line((cx - 50, cy + 20, cx - 30, cy + 8), fill=GOLDB, width=3)
    d.line((cx + 30, cy + 8, cx + 50, cy + 20), fill=GOLDB, width=3)


def scene_whisper(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    for ox in (-20, 20):
        d.ellipse((cx + ox - 14, cy - 18, cx + ox + 14, cy + 10), fill=accent)
    for ang in [10, -10]:
        rad = math.radians(ang)
        d.arc((cx - 8, cy - 8, cx + 8, cy + 8), 300, 60, fill=GOLDS, width=3)


def scene_stitched(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.line((cx - 30, cy, cx + 30, cy), fill=accent, width=4)
    for ox in range(-24, 28, 8):
        d.line((cx + ox, cy - 6, cx + ox + 4, cy + 6), fill=CURSED, width=2)


def scene_mask(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.ellipse((cx - 32, cy - 20, cx + 32, cy + 20), fill=accent)
    d.ellipse((cx - 14, cy - 6, cx - 4, cy + 4), fill=INK)
    d.ellipse((cx + 4, cy - 6, cx + 14, cy + 4), fill=INK)
    d.arc((cx - 12, cy + 6, cx + 12, cy + 18), 0, 180, fill=GOLDS, width=2)


def scene_tonic(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.rectangle((cx - 12, cy - 32, cx + 12, cy + 24), fill=GOLDS, outline=accent, width=2)
    d.ellipse((cx - 16, cy - 38, cx + 16, cy - 22), fill=CREAM_HI, outline=accent, width=2)


def scene_question(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.text((cx, cy + 4), "?", fill=accent, font=font(64, bold=True), anchor="mm")
    d.ellipse((cx - 36, cy - 36, cx + 36, cy + 36), outline=GOLDB, width=3)


def scene_desk(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.rectangle((cx - 44, cy + 4, cx + 44, cy + 24), fill=accent)
    d.rectangle((cx - 20, cy - 20, cx + 20, cy + 4), fill=CREAM_HI, outline=INK2, width=2)


def scene_quill(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.line((cx - 24, cy + 24, cx + 20, cy - 28), fill=INK, width=4)
    d.polygon([(cx + 20, cy - 28), (cx + 32, cy - 20), (cx + 24, cy - 16)], fill=accent)


def scene_crystal(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.polygon([(cx, cy - 36), (cx + 24, cy), (cx, cy + 32), (cx - 24, cy)], fill=GOLDS, outline=accent)
    d.ellipse((cx - 10, cy - 10, cx + 10, cy + 10), fill=CREAM_HI)


def scene_rolled_map(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.rounded_rectangle((cx - 40, cy - 16, cx + 40, cy + 16), radius=8, fill=PARCH, outline=accent, width=2)
    d.ellipse((cx - 44, cy - 20, cx - 28, cy + 20), fill=accent)
    d.ellipse((cx + 28, cy - 20, cx + 44, cy + 20), fill=accent)


def scene_throne_call(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.rectangle((cx - 20, cy - 8, cx + 20, cy + 28), fill=ROYAL)
    d.polygon([(cx - 28, cy - 8), (cx, cy - 32), (cx + 28, cy - 8)], fill=GOLDB)
    d.line((cx, cy - 40, cx, cy - 52), fill=accent, width=3)


def scene_hourglass(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.polygon([(cx - 18, cy - 30), (cx + 18, cy - 30), (cx, cy)], fill=GOLDS, outline=accent)
    d.polygon([(cx - 18, cy + 30), (cx + 18, cy + 30), (cx, cy)], fill=GOLDS, outline=accent)


def scene_ledger(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.rectangle((cx - 36, cy - 28, cx + 36, cy + 28), fill=CREAM_HI, outline=accent, width=2)
    d.line((cx - 4, cy - 28, cx - 4, cy + 28), fill=GOLD, width=2)
    for ly in range(-18, 20, 7):
        d.line((cx - 28, cy + ly, cx + 28, cy + ly), fill=INK2, width=1)


def scene_dummy(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.ellipse((cx - 14, cy - 34, cx + 14, cy - 6), fill=GOLDB)
    d.rounded_rectangle((cx - 22, cy - 6, cx + 22, cy + 30), radius=6, fill=accent)
    d.line((cx - 34, cy + 4, cx - 22, cy + 16), fill=GUARD, width=5)
    d.line((cx + 22, cy + 16, cx + 34, cy + 4), fill=GUARD, width=5)


def scene_twin_blades(d, inner, accent, opts) -> None:
    scene_dagger(d, inner, accent, opts)
    cx, cy = cxcy(inner)
    d.polygon([(cx + 16, cy + 20), (cx + 22, cy + 20), (cx + 30, cy - 20), (cx + 24, cy - 20)], fill=GOLDS)


def scene_fist(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.ellipse((cx - 22, cy - 18, cx + 22, cy + 22), fill=accent)
    for ox in (-12, 0, 12):
        d.rectangle((cx + ox - 4, cy - 32, cx + ox + 4, cy - 14), fill=accent)


def scene_gauntlet(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.rounded_rectangle((cx - 20, cy - 24, cx + 20, cy + 28), radius=6, fill=KNIGHT)
    d.rectangle((cx - 28, cy - 4, cx - 16, cy + 20), fill=KNIGHT, outline=GOLDS)
    d.rectangle((cx + 16, cy - 4, cx + 28, cy + 20), fill=KNIGHT, outline=GOLDS)


def scene_banner(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.line((cx - 30, cy + 28, cx - 30, cy - 32), fill=GUARD, width=4)
    d.polygon([(cx - 30, cy - 32), (cx + 20, cy - 18), (cx - 30, cy - 4)], fill=accent, outline=GOLDS)


def scene_veil(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.pieslice((cx - 40, cy - 24, cx + 40, cy + 24), 200, 340, fill=accent)
    d.arc((cx - 30, cy - 4, cx + 30, cy + 28), 0, 180, fill=GOLDS, width=3)


def scene_urn(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.polygon([(cx - 22, cy + 24), (cx + 22, cy + 24), (cx + 16, cy - 16), (cx - 16, cy - 16)], fill=accent)
    d.ellipse((cx - 18, cy - 28, cx + 18, cy - 10), fill=GOLDS)


def scene_candle(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.rectangle((cx - 8, cy - 8, cx + 8, cy + 28), fill=CREAM_HI, outline=accent, width=2)
    d.ellipse((cx - 6, cy - 20, cx + 6, cy - 8), fill=GOLDB)
    d.ellipse((cx - 12, cy - 32, cx + 12, cy - 16), fill=(255, 220, 140))


def scene_offering(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.arc((cx - 40, cy + 4, cx + 40, cy + 28), 180, 360, fill=INK2, width=3)
    scene_purse(d, inner, accent, {"__": True})


def scene_wraith(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.ellipse((cx - 18, cy - 28, cx + 18, cy + 4), fill=GOLDS)
    for x in range(cx - 22, cx + 23, 11):
        d.line((x, cy + 4, x, cy + 32), fill=accent, width=4)


def scene_tome(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.rounded_rectangle((cx - 28, cy - 34, cx + 28, cy + 34), radius=4, fill=CURSED, outline=GOLDS, width=3)
    d.rectangle((cx - 20, cy - 26, cx + 20, cy + 26), fill=INK)
    d.text((cx, cy + 4), "†", fill=GOLDS, font=font(32, bold=True), anchor="mm")


def scene_rose(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.line((cx, cy + 24, cx, cy - 8), fill=MOSS, width=3)
    d.ellipse((cx - 16, cy - 20, cx + 16, cy + 4), fill=ROYAL)
    d.ellipse((cx - 8, cy - 28, cx + 8, cy - 12), fill=(180, 60, 70))


def scene_crown_empty(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.polygon([(cx - 30, cy + 12), (cx - 20, cy - 20), (cx - 6, cy + 2),
               (cx, cy - 28), (cx + 6, cy + 2), (cx + 20, cy - 20), (cx + 30, cy + 12)],
              fill=GOLDB, outline=ROYAL)
    d.rectangle((cx - 32, cy + 10, cx + 32, cy + 20), fill=ROYAL)
    d.ellipse((cx - 10, cy - 2, cx + 10, cy + 18), fill=CREAM_HI)


def scene_horn(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.pieslice((cx - 36, cy - 20, cx + 36, cy + 20), 300, 120, fill=GOLDB, outline=accent, width=3)


def scene_kneel(d, inner, accent, opts) -> None:
    cx, cy = cxcy(inner)
    d.ellipse((cx - 12, cy - 28, cx + 12, cy - 4), fill=accent)
    d.polygon([(cx - 20, cy + 24), (cx + 20, cy + 24), (cx + 8, cy - 4), (cx - 8, cy - 4)], fill=accent)
    d.rectangle((cx - 28, cy + 20, cx + 28, cy + 28), fill=GOLDS)


SCENES: dict[str, Callable] = {
    "arch": scene_arch,
    "coins_hand": scene_coins_hand,
    "forged": scene_forged,
    "boots": scene_boots,
    "scales_trade": scene_scales_trade,
    "tavern_mug": scene_tavern_mug,
    "blood_oath": scene_blood_oath,
    "accusation": scene_accusation,
    "footprints": scene_footprints,
    "archive": scene_archive,
    "path_gate": scene_path_gate,
    "veiled_eye": scene_veiled_eye,
    "dagger": scene_dagger,
    "shield": scene_shield,
    "manacles": scene_manacles,
    "crossed_blades": scene_crossed_blades,
    "grave_hands": scene_grave_hands,
    "sealed_letter": scene_sealed_letter,
    "cursed_sword": scene_cursed_sword,
    "soul_jar": scene_soul_jar,
    "coffin_crown": scene_coffin_crown,
    "royal_scroll": scene_royal_scroll,
    "dove": scene_dove,
    "tax_bag": scene_tax_bag,
    "wax_seal": scene_wax_seal,
    "dice": scene_dice,
    "wagon": scene_wagon,
    "purse": scene_purse,
    "stall": scene_stall,
    "brawl": scene_brawl,
    "whisper": scene_whisper,
    "stitched": scene_stitched,
    "mask": scene_mask,
    "tonic": scene_tonic,
    "question": scene_question,
    "desk": scene_desk,
    "quill": scene_quill,
    "crystal": scene_crystal,
    "rolled_map": scene_rolled_map,
    "throne_call": scene_throne_call,
    "hourglass": scene_hourglass,
    "ledger": scene_ledger,
    "dummy": scene_dummy,
    "twin_blades": scene_twin_blades,
    "fist": scene_fist,
    "gauntlet": scene_gauntlet,
    "banner": scene_banner,
    "veil": scene_veil,
    "urn": scene_urn,
    "candle": scene_candle,
    "offering": scene_offering,
    "wraith": scene_wraith,
    "tome": scene_tome,
    "rose": scene_rose,
    "crown_empty": scene_crown_empty,
    "horn": scene_horn,
    "kneel": scene_kneel,
}


def wrap_title(title: str, max_len: int = 24) -> str:
    if len(title) <= max_len:
        return title
    return title[: max_len - 1] + "…"


def render_card(card_id: str, meta: dict) -> Image.Image:
    deck = meta["deck"]
    accent = DECK_ACCENT[deck]
    recipe = CARD_ART.get(card_id, {"scene": "question"})
    scene_name = recipe["scene"]
    opts = {k: v for k, v in recipe.items() if k != "scene"}

    img = Image.new("RGB", (W, H), CREAM)
    deck_gradient(img, deck)
    d = ImageDraw.Draw(img)
    inner = draw_frame(d, deck, accent)
    draw_timing_seal(d, meta["timing"], accent)

    if opts.get("corrupt"):
        draw_corrupt_mist(d, inner)

    # subtle inner panel wash
    x0, y0, x1, y1 = inner
    d.rounded_rectangle((x0 + 4, y0 + 4, x1 - 4, y1 - 4), radius=8, fill=CREAM_HI, outline=None)

    painter = SCENES.get(scene_name, scene_question)
    painter(d, inner, accent, opts)

    title = wrap_title(meta["name"])
    f = font(11 if len(title) > 20 else 12, bold=True)
    tw = d.textlength(title, font=f)
    d.text(((W - tw) / 2, H - 26), title, fill=CREAM_HI, font=f)
    deck_lbl = deck.upper()
    dw = d.textlength(deck_lbl, font=font(8, bold=True))
    d.text(((W - dw) / 2, H - 14), deck_lbl, fill=GOLDS, font=font(8, bold=True))

    return add_paper_texture(img, 0.045)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    meta = load_card_meta()
    ids = [c["id"] for c in dethrone_data.ACTION_CARDS]
    assert len(ids) == 76
    missing = [i for i in ids if i not in CARD_ART]
    if missing:
        raise SystemExit(f"Missing CARD_ART entries: {missing}")

    files: dict[str, str] = {}
    for card_id in ids:
        fname = f"action-{card_id}-v3b.jpg"
        img = render_card(card_id, meta[card_id])
        path = OUT / fname
        img.save(path, "JPEG", quality=90, optimize=True)
        files[card_id] = fname

    manifest = {
        "template": "V3b stylised action vignettes (per-card motifs)",
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
    print(f"wrote {len(files)} stylised vignettes ({W}x{H})")


if __name__ == "__main__":
    main()
