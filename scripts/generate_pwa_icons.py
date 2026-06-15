#!/usr/bin/env python3
"""Generate the Wheesht PWA PNG icon set without runtime third-party deps.

The mark is the "Wheesht" wordmark set in the app's display face, Bricolage
Grotesque (the same font as the in-app masthead), on the brand yellow with a
match-programme ink keyline and the signature red dot. Glyph outlines are
read from the vendored TTF with fontTools, flattened to polygons and filled
here, so no image library is needed.
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


# --------------------------------------------------------------------------- #
#  Glyph outlines -> flattened polygons (font units, y-up)
# --------------------------------------------------------------------------- #
class _FlatPen(BasePen):
    """Records contours as polylines, flattening quadratic/cubic segments."""

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
    """Return (contours, width, ymin, ymax) for `text` in font units (y-up)."""
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


# --------------------------------------------------------------------------- #
#  PNG writer
# --------------------------------------------------------------------------- #
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


# --------------------------------------------------------------------------- #
#  Icon
# --------------------------------------------------------------------------- #
_WORD_CACHE = None


def make_icon(size: int, filename: str, maskable: bool = False) -> None:
    global _WORD_CACHE
    if _WORD_CACHE is None:
        _WORD_CACHE = word_contours(WORD)
    contours, w_units, ymin, ymax = _WORD_CACHE

    scale = 4
    canvas = size * scale
    pixels = bytearray(canvas * canvas * 4)
    yellow = (245, 200, 0, 255)
    ink = (26, 26, 26, 255)
    red = (232, 39, 42, 255)

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
    fill(yellow)
    if not maskable:
        border = round(c * 0.055)
        rect(0, 0, c, border, ink)
        rect(0, c - border, c, c, ink)
        rect(0, 0, border, c, ink)
        rect(c - border, 0, c, c, ink)

    # --- fit the "Wheesht." lockup (word + red full stop) into the frame - #
    pad = 0.265 if maskable else 0.13     # fraction of canvas kept clear each side
    box_w = c * (1 - 2 * pad)
    glyph_w = w_units
    glyph_h = ymax - ymin
    dot_r = c * (0.050 if not maskable else 0.044)
    gap = dot_r * 0.85
    # the word takes the box width minus room for the trailing dot
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
        return (ymax - py) * s + oy   # flip y (font is y-up)

    # transform contours to canvas space
    cpolys = [[(tx(px), ty(py)) for (px, py) in con] for con in contours]

    # build non-horizontal edges
    edges = []
    miny = miny_i = 10 ** 9
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

    # even-odd scanline fill
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

    # --- signature red dot — a confident full stop after the word -------- #
    dot_x = ox + draw_w + gap + dot_r
    dot_y = oy + draw_h - dot_r
    circle(dot_x, dot_y, dot_r, red)

    # --- downsample (box filter) ----------------------------------------- #
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


def main() -> None:
    make_icon(192, "icon-192.png")
    make_icon(512, "icon-512.png")
    make_icon(192, "maskable-192.png", maskable=True)
    make_icon(512, "maskable-512.png", maskable=True)
    make_icon(180, "apple-touch-icon.png")


if __name__ == "__main__":
    main()
