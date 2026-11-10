#!/usr/bin/env python3
"""Generate the social preview and app PNG icons from the approved RCF WebP artwork."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT = Path(__file__).resolve().parents[1]
DARK = (20, 25, 30)
LIME = (185, 234, 111)
PALE = (244, 246, 247)
MUTED = (204, 218, 224)
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

# The phone-ready RCF badge, added after the user selected the current logo.
icon = Image.open(ROOT / "icon-512-rcf.webp").convert("RGBA")
for size in (192, 512):
    surface = Image.new("RGBA", (size, size), DARK + (255,))
    fitted = ImageOps.contain(icon, (size, size), Image.Resampling.LANCZOS)
    surface.alpha_composite(fitted, ((size - fitted.width)//2, (size - fitted.height)//2))
    surface.convert("RGB").save(ROOT / f"icon-{size}.png", optimize=True)

    # Android adaptive launcher: opaque dark background all the way to the
    # icon edges, with the original approved badge inside the 80% safe circle.
    # A 56% square fits entirely within that circle even with corner content.
    adaptive = Image.new("RGBA", (size, size), DARK + (255,))
    safe_side = round(size * .56)
    safe_icon = ImageOps.contain(icon, (safe_side, safe_side), Image.Resampling.LANCZOS)
    adaptive.alpha_composite(safe_icon, ((size - safe_icon.width)//2, (size - safe_icon.height)//2))
    adaptive.convert("RGB").save(ROOT / f"icon-{size}-maskable.png", optimize=True)

# The original user-selected RCF logo, not the old September icon.
logo = Image.open(ROOT / "brand-rcf.webp").convert("RGBA")
canvas = Image.new("RGB", (1200, 630), DARK)
draw = ImageDraw.Draw(canvas)
draw.rounded_rectangle((56, 72, 1144, 558), radius=42, fill=(36, 45, 52), outline=(83, 101, 105), width=2)
draw.rounded_rectangle((84, 112, 498, 518), radius=38, fill=(20, 34, 27))
fitted = ImageOps.contain(logo, (380, 380), Image.Resampling.LANCZOS)
canvas.paste(fitted, (291 - fitted.width//2, 315 - fitted.height//2), fitted)

title_font = ImageFont.truetype(FONT_BOLD, 80)
subtitle_font = ImageFont.truetype(FONT_BOLD, 74)
detail_font = ImageFont.truetype(FONT_REGULAR, 31)
draw.text((535, 206), "RÕUGE", font=title_font, fill=PALE)
draw.text((535, 306), "CROSSFIT", font=subtitle_font, fill=LIME)
draw.line((540, 415, 1080, 415), fill=(100, 126, 101), width=3)
draw.text((540, 441), "Liitu treeningutega", font=detail_font, fill=MUTED)
target = ROOT / "social-preview-rcf.png"
canvas.save(target, optimize=True)
assert target.stat().st_size < 600_000, "Share preview must remain small enough for messaging apps"
print("Generated:", *(f"{p.name} {p.stat().st_size} bytes" for p in
    (ROOT / "icon-192.png", ROOT / "icon-512.png",
     ROOT / "icon-192-maskable.png", ROOT / "icon-512-maskable.png", target)))
