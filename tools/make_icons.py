"""
make_icons.py — derive every app-icon variant from one approved source.

The game's *face*: PWA install icons (any + maskable), the iOS home-screen
apple-touch-icon, the browser favicon, and the in-app splash / FTUE emblem —
all generated from a single square source so they stay identical everywhere.

Run after regenerating the app icon:
    python tools/make_icons.py                       # uses the default source
    python tools/make_icons.py path/to/icon.png      # or an explicit source

Source default: the approved icon copied into the Final Assets pipeline
(Core/Final Assets/Generated/app_icon.png). Outputs land in public/ so Vite
serves them at the root and vite-plugin-pwa precaches them.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw

# --- paths -----------------------------------------------------------------
REPO = Path(__file__).resolve().parent.parent
PUBLIC = REPO / "public"
ICONS = PUBLIC / "icons"
ART = PUBLIC / "art"

SRC_DEFAULT = Path(
    "C:/Users/illum/OneDrive/Desktop/Hearth/Graphics and UI"
    "/Core/Final Assets/Generated/app_icon.png"
)

# Deep harbour navy — the icon's own background, used to full-bleed the
# maskable + apple-touch variants so an OS mask never reveals a bare corner.
NAVY = (15, 22, 38)
LANCZOS = Image.Resampling.LANCZOS


def rounded_card(src: Image.Image, radius_frac: float = 0.088,
                 inset_frac: float = 0.008) -> Image.Image:
    """The icon as a rounded card with transparent corners, trimmed to bbox.

    Used for the in-app emblem (floats on parchment/navy) and as the paste
    source for the full-bleed variants so no hard black corner survives.
    """
    im = src.convert("RGBA")
    w, h = im.size
    inset = round(min(w, h) * inset_frac)
    rad = round(min(w, h) * radius_frac)
    mask = Image.new("L", (w, h), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [inset, inset, w - 1 - inset, h - 1 - inset], radius=rad, fill=255
    )
    im.putalpha(mask)
    bbox = im.getbbox()
    return im.crop(bbox) if bbox else im


def framed(card: Image.Image, size: int, content_frac: float,
           bg: tuple[int, int, int] = NAVY) -> Image.Image:
    """Full-bleed opaque square: solid bg with the card centred at
    `content_frac` of the width (keeps focal content inside the mask safe zone).
    """
    canvas = Image.new("RGB", (size, size), bg)
    cw = round(size * content_frac)
    c = card.copy()
    c.thumbnail((cw, cw), LANCZOS)
    x = (size - c.width) // 2
    y = (size - c.height) // 2
    canvas.paste(c, (x, y), c)
    return canvas


def square(src: Image.Image, size: int, mode: str = "RGB") -> Image.Image:
    return src.convert(mode).resize((size, size), LANCZOS)


def main() -> None:
    src_path = Path(sys.argv[1]) if len(sys.argv) > 1 else SRC_DEFAULT
    if not src_path.exists():
        raise SystemExit(f"source icon not found: {src_path}")

    src = Image.open(src_path)
    print(f"source: {src_path.name} {src.size} {src.mode}")

    ICONS.mkdir(parents=True, exist_ok=True)
    ART.mkdir(parents=True, exist_ok=True)

    card = rounded_card(src)  # RGBA, transparent corners
    written: list[str] = []

    def save(img: Image.Image, path: Path) -> None:
        img.save(path)
        written.append(str(path.relative_to(REPO)))

    # PWA "any" icons — shown as-is by launchers; keep the designed rounded look.
    save(square(src, 512), ICONS / "icon-512.png")
    save(square(src, 192), ICONS / "icon-192.png")

    # PWA maskable — OS masks to circle/squircle; full-bleed navy, safe-zone inset.
    save(framed(card, 512, 0.82), ICONS / "maskable-512.png")
    save(framed(card, 192, 0.82), ICONS / "maskable-192.png")

    # iOS home screen — gentle squircle; full-bleed navy, no transparency.
    save(framed(card, 180, 0.90), PUBLIC / "apple-touch-icon.png")

    # Browser favicon — multi-size .ico plus explicit pngs.
    ico = src.convert("RGBA").resize((48, 48), LANCZOS)
    ico.save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    written.append("public/favicon.ico")
    save(square(src, 32, "RGBA"), PUBLIC / "favicon-32.png")
    save(square(src, 16, "RGBA"), PUBLIC / "favicon-16.png")

    # In-app splash emblem: the rounded card (transparent corners) so it floats
    # cleanly over the splash gradient. Referenced by a direct /art/app_icon.png
    # path from index.html — NOT via the generated art-manifest, and distinct
    # from the purpose-built splash_emblem.png (the Emberhollow lighthouse crest),
    # which this tool deliberately leaves untouched.
    save(card.resize((512, 512), LANCZOS), ART / "app_icon.png")

    print("wrote:")
    for w in written:
        print(f"  {w}")


if __name__ == "__main__":
    main()
