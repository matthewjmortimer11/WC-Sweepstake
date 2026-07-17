#!/usr/bin/env python3
"""Generate a DISTINCT Wheesht PWA icon set for the /games party-games hub.

Same "Wheesht" wordmark lockup as the main app icons (scripts/generate_pwa_icons.py),
but recoloured so the games launcher is unmistakably its own app on the home
screen while staying in the Wheesht family. The palette is parameterised so we
can preview variants; the chosen one is written as icon-games-*.png etc.
"""

from __future__ import annotations

import struct
import zlib
from pathlib import Path

from fontTools.pens.basePen import BasePen
from fontTools.ttLib import TTFont


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "static" / "icons"
FONT = ROOT / "scripts" / "vendor" / "fonts" / "BricolageGrotesque-800.ttf"
WORD = "Wheesht"


class _FlatPen(BasePen):
    def __init__(self, glyphSet, steps: int = 16):
        super().__init__(glyphSet)
        self.steps = steps
        self.contours: list[list[tuple[float, float]]] = []
        self._cur: list[tuple[float, float]] = []
        self._pt = (0.0, 0.0)

    def _moveTo(self, p):
        if self._cur:
            self.contours.append(self._cur)
        self._cur = [p]
        self._pt = p

    def _lineTo(self, p):
        self._cur.append(p)
        self._pt = p

    def _qCurveToOne(self, c, p):
        x0, y0 = self._pt
        for i in range(1, self.steps + 1):
            t = i / self.steps
            mt = 1 - t
            x = mt * mt * x0 + 2 * mt * t * c[0] + t * t * p[0]
            y = mt * mt * y0 + 2 * mt * t * c[1] + t * t * p[1]
            self._cur.append((x, y))
        self._pt = p

    def _curveToOne(self, c1, c2, p):
        x0, y0 = self._pt
        for i in range(1, self.steps + 1):
            t = i / self.steps
            mt = 1 - t
            x = mt**3 * x0 + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t**3 * p[0]
            y = mt**3 * y0 + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t**3 * p[1]
            self._cur.append((x, y))
        self._pt = p

    def _closePath(self):
        if self._cur:
            self.contours.append(self._cur)
        self._cur = []

    def _endPath(self):
        self._closePath()


def word_contours(text: str):
    font = TTFont(str(FONT))
    glyphset = font.getGlyphSet()
    cmap = font.getBestCmap()
    contours: list[list[tuple[float, float]]] = []
    penx = 0.0
    for ch in text:
        name = cmap.get(ord(ch))
        if name is None:
            continue
        pen = _FlatPen(glyphset)
        glyphset[name].draw(pen)
        for con in pen.contours:
            contours.append([(x + penx, y) for (x, y) in con])
        penx += glyphset[name].width
    ys = [p[1] for con in contours for p in con]
    return contours, penx, min(ys), max(ys)


def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def png(width: int, height: int, rgba: bytearray) -> bytes:
    rows = bytearray()
    stride = width * 4
    for y in range(height):
        rows.append(0)
        rows.extend(rgba[y * stride : (y + 1) * stride])
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(rows), 9)) + chunk(b"IEND", b"")


_WORD_CACHE = None


def make_icon(size: int, filename: str, palette: dict, maskable: bool = False) -> None:
    global _WORD_CACHE
    if _WORD_CACHE is None:
        _WORD_CACHE = word_contours(WORD)
    contours, w_units, ymin, ymax = _WORD_CACHE

    bg = palette["bg"]
    ink = palette["word"]
    red = palette["dot"]
    keyline = palette.get("keyline")

    scale = 4
    canvas = size * scale
    pixels = bytearray(canvas * canvas * 4)

    def set_px(x: int, y: int, color) -> None:
        if 0 <= x < canvas and 0 <= y < canvas:
            i = (y * canvas + x) * 4
            pixels[i : i + 4] = bytes(color)

    def fill(color) -> None:
        row = bytes(color) * canvas
        for y in range(canvas):
            pixels[y * canvas * 4 : (y + 1) * canvas * 4] = row

    def rect(x0, y0, x1, y1, color) -> None:
        for y in range(int(y0), int(y1)):
            for x in range(int(x0), int(x1)):
                set_px(x, y, color)

    def circle(cx, cy, r, color) -> None:
        r2 = r * r
        for y in range(int(cy - r), int(cy + r) + 1):
            for x in range(int(cx - r), int(cx + r) + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r2:
                    set_px(x, y, color)

    c = canvas
    fill(bg)
    if not maskable and keyline is not None:
        border = round(c * 0.055)
        rect(0, 0, c, border, keyline)
        rect(0, c - border, c, c, keyline)
        rect(0, 0, border, c, keyline)
        rect(c - border, 0, c, c, keyline)

    pad = 0.265 if maskable else 0.13
    box_w = c * (1 - 2 * pad)
    glyph_w = w_units
    glyph_h = ymax - ymin
    dot_r = c * (0.050 if not maskable else 0.044)
    gap = dot_r * 0.85
    s = (box_w - gap - 2 * dot_r) / glyph_w
    max_h = c * (0.34 if maskable else 0.30)
    if glyph_h * s > max_h:
        s = max_h / glyph_h
    draw_w = glyph_w * s
    draw_h = glyph_h * s
    group_w = draw_w + gap + 2 * dot_r
    ox = (c - group_w) / 2.0
    oy = (c - draw_h) / 2.0

    def tx(px):
        return (px) * s + ox

    def ty(py):
        return (ymax - py) * s + oy

    cpolys = [[(tx(px), ty(py)) for (px, py) in con] for con in contours]

    edges = []
    miny = 10 ** 9
    maxy = -10 ** 9
    for con in cpolys:
        n = len(con)
        for i in range(n):
            x0, y0 = con[i]
            x1, y1 = con[(i + 1) % n]
            if y0 == y1:
                continue
            edges.append((x0, y0, x1, y1))
            miny = min(miny, y0, y1)
            maxy = max(maxy, y0, y1)
    miny_i = max(0, int(miny))
    maxy_i = min(canvas, int(maxy) + 1)

    for y in range(miny_i, maxy_i):
        yc = y + 0.5
        xs = []
        for (x0, y0, x1, y1) in edges:
            if (y0 <= yc < y1) or (y1 <= yc < y0):
                xs.append(x0 + (yc - y0) * (x1 - x0) / (y1 - y0))
        if not xs:
            continue
        xs.sort()
        for k in range(0, len(xs) - 1, 2):
            xa = int(round(xs[k]))
            xb = int(round(xs[k + 1]))
            if xb > xa:
                row = bytes(ink) * (xb - xa)
                i = (y * canvas + xa) * 4
                pixels[i : i + (xb - xa) * 4] = row

    dot_x = ox + draw_w + gap + dot_r
    dot_y = oy + draw_h - dot_r
    circle(dot_x, dot_y, dot_r, red)

    final = bytearray(size * size * 4)
    inv = 1.0 / (scale * scale)
    for y in range(size):
        for x in range(size):
            t0 = t1 = t2 = t3 = 0
            for yy in range(scale):
                base = ((y * scale + yy) * canvas + x * scale) * 4
                for xx in range(scale):
                    i = base + xx * 4
                    t0 += pixels[i]
                    t1 += pixels[i + 1]
                    t2 += pixels[i + 2]
                    t3 += pixels[i + 3]
            o = (y * size + x) * 4
            final[o : o + 4] = bytes((round(t0 * inv), round(t1 * inv), round(t2 * inv), round(t3 * inv)))

    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / filename).write_bytes(png(size, size, final))


# Distinct palettes for the games hub (main app stays yellow-on-ink).
VARIANTS = {
    # Dark tile, yellow wordmark, red dot, yellow keyline.
    "ink": {"bg": (26, 26, 26, 255), "word": (245, 200, 0, 255), "dot": (232, 39, 42, 255), "keyline": (245, 200, 0, 255)},
    # Red tile, cream wordmark, yellow dot, cream keyline.
    "red": {"bg": (232, 39, 42, 255), "word": (250, 244, 227, 255), "dot": (245, 200, 0, 255), "keyline": (250, 244, 227, 255)},
}


def build(variant: str, prefix: str = "games") -> None:
    pal = VARIANTS[variant]
    make_icon(192, f"icon-{prefix}-192.png", pal)
    make_icon(512, f"icon-{prefix}-512.png", pal)
    make_icon(192, f"maskable-{prefix}-192.png", pal, maskable=True)
    make_icon(512, f"maskable-{prefix}-512.png", pal, maskable=True)
    make_icon(180, f"apple-touch-icon-{prefix}.png", pal)


if __name__ == "__main__":
    import sys

    # Preview mode: `python generate_games_icons.py preview` writes both 512s.
    if len(sys.argv) > 1 and sys.argv[1] == "preview":
        for v in VARIANTS:
            make_icon(512, f"_preview-{v}-512.png", VARIANTS[v])
            print("wrote", OUT / f"_preview-{v}-512.png")
    else:
        variant = sys.argv[1] if len(sys.argv) > 1 else "ink"
        build(variant)
        print("built games icon set:", variant)
