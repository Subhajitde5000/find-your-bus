#!/usr/bin/env python3
"""Draw the installable-app icons from the site's own brand mark.

The icons are generated rather than committed as opaque binaries, so they can be
re-drawn if the brand colour changes and nobody has to open an image editor.

Run from the repository root::

    .venv/bin/pip install pillow
    .venv/bin/python fontend/scripts/make_icons.py

Writes into ``fontend/public/icons``:

``icon-192.png``, ``icon-512.png``
    Standard icons. Chrome installs from these.
``icon-maskable-512.png``
    Same drawing inside the maskable safe zone (the middle 80%), so an Android launcher
    can crop it to a circle or a squircle without cutting the bus.
``icon.svg``
    A vector copy, for browsers that prefer one.

The drawing is the site's brand square: bus green (#195a45), a white bus seen from the
front, and the accent orange (#e9865c) used for the route dot. Nothing is downloaded.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "icons"

BRAND = (25, 90, 69, 255)
BRAND_DARK = (16, 72, 51, 255)
WHITE = (255, 255, 255, 255)
ACCENT = (233, 134, 92, 255)
GLASS = (214, 233, 221, 255)


def rounded(draw: ImageDraw.ImageDraw, box, radius, fill) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_bus(draw: ImageDraw.ImageDraw, size: int, pad: float) -> None:
    """A bus seen from the front, scaled to `size` with `pad` of margin each side."""
    unit = size / 512
    left = pad * size
    right = size - pad * size
    top = size * 0.24
    bottom = size * 0.74
    body_radius = 46 * unit

    # Body.
    rounded(draw, (left, top, right, bottom), body_radius, WHITE)

    # Windscreen.
    rounded(
        draw,
        (left + 34 * unit, top + 34 * unit, right - 34 * unit, top + 150 * unit),
        26 * unit,
        GLASS,
    )

    # Destination blind above the windscreen.
    rounded(
        draw,
        (left + 90 * unit, top + 8 * unit, right - 90 * unit, top + 28 * unit),
        8 * unit,
        BRAND_DARK,
    )

    # Bumper.
    rounded(
        draw,
        (left + 22 * unit, bottom - 56 * unit, right - 22 * unit, bottom - 18 * unit),
        14 * unit,
        BRAND,
    )

    # Headlights, one of them the accent orange so the mark matches the site.
    for cx, colour in ((left + 62 * unit, ACCENT), (right - 62 * unit, ACCENT)):
        rounded(draw, (cx - 22 * unit, bottom - 46 * unit, cx + 22 * unit, bottom - 26 * unit), 9 * unit, colour)

    # Wheels.
    wheel_top = bottom - 6 * unit
    for cx in (left + 74 * unit, right - 74 * unit):
        rounded(draw, (cx - 30 * unit, wheel_top, cx + 30 * unit, wheel_top + 44 * unit), 14 * unit, BRAND_DARK)

    # Route dot, the same accent used for the pulse on the site header.
    dot_r = 15 * unit
    cx, cy = right - 44 * unit, top - 34 * unit
    draw.ellipse((cx - dot_r, cy - dot_r, cx + dot_r, cy + dot_r), fill=ACCENT)


def make(size: int, maskable: bool = False) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    # The whole tile is the brand colour, so a launcher that crops it still shows green.
    corner = 0 if maskable else math.ceil(size * 0.19)
    rounded(draw, (0, 0, size, size), corner, BRAND)
    # A maskable icon keeps its drawing inside the middle 80%.
    draw_bus(draw, size, pad=0.24 if maskable else 0.13)
    return image


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512" role="img" aria-label="Cholo Kolkata Bus Guide">
  <rect width="512" height="512" rx="97" fill="#195a45"/>
  <rect x="67" y="123" width="378" height="256" rx="46" fill="#ffffff"/>
  <rect x="101" y="157" width="310" height="116" rx="26" fill="#d6e9dd"/>
  <rect x="157" y="131" width="198" height="20" rx="8" fill="#104833"/>
  <rect x="89" y="323" width="334" height="38" rx="14" fill="#195a45"/>
  <rect x="107" y="333" width="44" height="20" rx="9" fill="#e9865c"/>
  <rect x="361" y="333" width="44" height="20" rx="9" fill="#e9865c"/>
  <rect x="111" y="373" width="60" height="44" rx="14" fill="#104833"/>
  <rect x="341" y="373" width="60" height="44" rx="14" fill="#104833"/>
  <circle cx="424" cy="89" r="15" fill="#e9865c"/>
</svg>
"""


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    for size in (192, 512):
        target = OUT / f"icon-{size}.png"
        make(size).save(target)
        written.append(str(target))
    maskable = OUT / "icon-maskable-512.png"
    make(512, maskable=True).save(maskable)
    written.append(str(maskable))
    # A 180 px apple-touch-icon: iOS ignores the manifest's icons for the home screen.
    apple = OUT / "apple-touch-icon.png"
    make(180).save(apple)
    written.append(str(apple))
    svg = OUT / "icon.svg"
    svg.write_text(SVG, encoding="utf-8")
    written.append(str(svg))
    for path in written:
        print(f"wrote {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
