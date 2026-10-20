#!/usr/bin/env python3
"""Draw the icons from code, so they match the app and can be rebuilt.

    python3 tools/make_icons.py

Writes icons/icon.svg, the three PNG sizes the manifest asks for, the browser
favicons and the Apple touch icon. No external image, nothing to trace.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "icons"
INK = (10, 29, 35, 255)
TEAL = (15, 102, 116, 255)
PAPER = (255, 255, 255, 255)

# The mark: three corner squares and a block in the bottom right, the shape
# everyone recognises as a QR code.
FINDER = [(0.16, 0.16), (0.62, 0.16), (0.16, 0.62)]
BLOCKS = [(0.64, 0.64), (0.80, 0.64), (0.64, 0.80)]


def draw_mark(size: int, background: tuple[int, int, int, int] | None, radius: float) -> Image.Image:
    scale = 4
    side = size * scale
    img = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    if background is not None:
        draw.rounded_rectangle([0, 0, side - 1, side - 1], radius=int(side * radius), fill=background)

    unit = side * 0.15
    gap = unit * 0.3
    for x, y in FINDER:
        left = side * x
        top = side * y
        draw.rounded_rectangle(
            [left, top, left + unit, top + unit],
            radius=int(unit * 0.24),
            outline=PAPER,
            width=int(unit * 0.16),
        )
        draw.rounded_rectangle(
            [left + gap, top + gap, left + unit - gap, top + unit - gap],
            radius=int(unit * 0.1),
            fill=PAPER,
        )
    for x, y in BLOCKS:
        left = side * x
        top = side * y
        draw.rounded_rectangle(
            [left, top, left + unit, top + unit],
            radius=int(unit * 0.22),
            fill=PAPER,
        )

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    ICONS.mkdir(exist_ok=True)

    draw_mark(512, TEAL, 0.22).save(ICONS / "icon-512.png")
    draw_mark(192, TEAL, 0.22).save(ICONS / "icon-192.png")
    # Maskable icons need their safe zone: the mark sits inside 80 percent.
    mask = Image.new("RGBA", (512, 512), TEAL)
    mark = draw_mark(410, None, 0)
    mask.alpha_composite(mark, (51, 51))
    mask.save(ICONS / "icon-512-maskable.png")

    draw_mark(180, TEAL, 0.22).save(ROOT / "apple-touch-icon.png")
    draw_mark(32, TEAL, 0.22).save(ROOT / "favicon-32.png")
    favicon = draw_mark(64, TEAL, 0.22)
    favicon.save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="QR Generator">
  <rect width="100" height="100" rx="22" fill="#0f6674"/>
  <g fill="none" stroke="#ffffff" stroke-width="3.2">
    <rect x="16" y="16" width="16" height="16" rx="3.5"/>
    <rect x="62" y="16" width="16" height="16" rx="3.5"/>
    <rect x="16" y="62" width="16" height="16" rx="3.5"/>
  </g>
  <g fill="#ffffff">
    <rect x="21" y="21" width="6" height="6" rx="1.2"/>
    <rect x="67" y="21" width="6" height="6" rx="1.2"/>
    <rect x="21" y="67" width="6" height="6" rx="1.2"/>
    <rect x="62" y="62" width="16" height="16" rx="3.2"/>
  </g>
</svg>
"""
    (ICONS / "icon.svg").write_text(svg, encoding="utf-8")
    print("icons written")


if __name__ == "__main__":
    main()
