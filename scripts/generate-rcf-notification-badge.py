#!/usr/bin/env python3
"""Generate a transparent, monochrome RCF shield for Android notification status bar.

Android tints a small notification icon with its system color. The full-color
home-screen icon is intentionally NOT used as a badge: it has an opaque background
and otherwise becomes a white square or blob in the status bar.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
SCALE = 4
SIZE = 96
WHITE = (255, 255, 255, 255)
TRANSPARENT = (0, 0, 0, 0)

canvas = Image.new("RGBA", (SIZE * SCALE, SIZE * SCALE), TRANSPARENT)
draw = ImageDraw.Draw(canvas)

# Simplified outline of the approved Rõuge CrossFit shield emblem.
# Leave substantial transparent space so Android can tint the symbol cleanly.
shield = [(48, 8), (82, 25), (82, 58), (48, 85),
          (14, 58), (14, 25), (48, 8)]
draw.line([(x * SCALE, y * SCALE) for x, y in shield],
          fill=WHITE, width=7 * SCALE, joint="curve")

font = ImageFont.truetype(
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    23 * SCALE
)
draw.text((48 * SCALE, 47 * SCALE), "RCF",
          font=font, fill=WHITE, anchor="mm")

for size in (96, 192):
    image = canvas.resize((size, size), Image.Resampling.LANCZOS)
    assert image.getpixel((0, 0))[3] == 0
    assert image.getpixel((size - 1, size - 1))[3] == 0
    assert image.getbbox(), "Notification badge is empty"
    target = ROOT / f"notification-badge-rcf-{size}.png"
    image.save(target, optimize=True)
    print(f"{target.name}: {target.stat().st_size} bytes")
