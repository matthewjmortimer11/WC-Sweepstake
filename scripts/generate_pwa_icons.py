#!/usr/bin/env python3
"""Generate the Wheesht PWA PNG icon set without third-party dependencies."""

from __future__ import annotations

import struct
import zlib
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "static" / "icons"


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


def make_icon(size: int, filename: str, maskable: bool = False) -> None:
    scale = 3
    canvas = size * scale
    pixels = bytearray(canvas * canvas * 4)
    yellow = (245, 200, 0, 255)
    ink = (26, 26, 26, 255)
    red = (232, 39, 42, 255)
    cream = (244, 238, 227, 255)

    def set_px(x: int, y: int, color: tuple[int, int, int, int]) -> None:
        if x < 0 or y < 0 or x >= canvas or y >= canvas:
            return
        i = (y * canvas + x) * 4
        pixels[i : i + 4] = bytes(color)

    def fill(color: tuple[int, int, int, int]) -> None:
        row = bytes(color) * canvas
        for y in range(canvas):
            pixels[y * canvas * 4 : (y + 1) * canvas * 4] = row

    def rect(x0: int, y0: int, x1: int, y1: int, color: tuple[int, int, int, int]) -> None:
        for y in range(y0, y1):
            for x in range(x0, x1):
                set_px(x, y, color)

    def circle(cx: float, cy: float, r: float, color: tuple[int, int, int, int]) -> None:
        r2 = r * r
        for y in range(int(cy - r), int(cy + r) + 1):
            for x in range(int(cx - r), int(cx + r) + 1):
                if (x - cx) ** 2 + (y - cy) ** 2 <= r2:
                    set_px(x, y, color)

    def line(x1: float, y1: float, x2: float, y2: float, width: float, color: tuple[int, int, int, int]) -> None:
        vx, vy = x2 - x1, y2 - y1
        vv = vx * vx + vy * vy
        radius = width / 2
        for y in range(int(min(y1, y2) - width), int(max(y1, y2) + width) + 1):
            for x in range(int(min(x1, x2) - width), int(max(x1, x2) + width) + 1):
                t = max(0, min(1, ((x - x1) * vx + (y - y1) * vy) / vv))
                px, py = x1 + t * vx, y1 + t * vy
                if (x - px) ** 2 + (y - py) ** 2 <= radius * radius:
                    set_px(x, y, color)
        circle(x1, y1, radius, color)
        circle(x2, y2, radius, color)

    fill(yellow)
    if not maskable:
        border = round(canvas * 0.055)
        rect(0, 0, canvas, border, ink)
        rect(0, canvas - border, canvas, canvas, ink)
        rect(0, 0, border, canvas, ink)
        rect(canvas - border, 0, canvas, canvas, ink)

    width = round(canvas * (0.095 if maskable else 0.11))
    left = canvas * (0.24 if maskable else 0.20)
    right = canvas * (0.76 if maskable else 0.80)
    top = canvas * 0.29
    bottom = canvas * 0.72
    mid = canvas * 0.60

    line(left, top, canvas * 0.34, bottom, width, ink)
    line(canvas * 0.34, bottom, canvas * 0.50, mid, width, ink)
    line(canvas * 0.50, mid, canvas * 0.66, bottom, width, ink)
    line(canvas * 0.66, bottom, right, top, width, ink)
    line(left + canvas * 0.018, top - canvas * 0.01, canvas * 0.34 + canvas * 0.018, bottom - canvas * 0.01, max(2, width * 0.22), cream)
    circle(canvas * 0.77, canvas * 0.24, canvas * 0.055, red)

    final = bytearray(size * size * 4)
    for y in range(size):
        for x in range(size):
            total = [0, 0, 0, 0]
            for yy in range(scale):
                for xx in range(scale):
                    i = ((y * scale + yy) * canvas + (x * scale + xx)) * 4
                    for c in range(4):
                        total[c] += pixels[i + c]
            o = (y * size + x) * 4
            final[o : o + 4] = bytes(round(v / (scale * scale)) for v in total)

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
