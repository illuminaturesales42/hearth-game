"""
Extract the machine-usable pieces of the Building Style Guide
(`New  Style.png`) for the art dial-in:

  palette   sample the swatch rows (roof/wood/stone/accents/lighting) into hex
            lists -> tools/comfy_out/style_guide.json, so prompts carry the
            guide's ACTUAL colours instead of guesses
  boards    crop the guide's building panels and matte them onto the neutral
            grey render backdrop -> IPAdapter style boards. Matting matters:
            the portrait-board experiment proved an adapter transfers the
            reference's BACKGROUND with enthusiasm, so the boards must show
            buildings-on-grey, not buildings-on-parchment.
  target    crop the guide's own L1 panel -> the TARGET cell that sits inside
            sweep contact sheets for direct side-by-side judging

  python tools/comfy_style_guide.py           # writes everything + debug overlay
  python tools/comfy_style_guide.py --debug   # only the overlay, to check crops

All regions are FRACTIONS of the sheet size, so a re-exported guide at a new
resolution keeps working. Verify with the overlay before trusting new crops.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

GUIDE = Path(r"C:\Users\illum\OneDrive\Desktop\Hearth\Graphics and UI\New  Style.png")
OUT = Path(__file__).resolve().parent / "comfy_out"
# the neutral grey the winning recipe renders its backdrop in — boards are
# matted onto this so the adapter sees the backdrop we WANT it to reproduce
BACKDROP = (168, 172, 170)

# ---- fractional regions (x0, y0, x1, y1) of the sheet ----------------------
PROGRESSION = {
    "ruined": (0.282, 0.050, 0.408, 0.260),
    "wip": (0.409, 0.048, 0.553, 0.240),
    "l1": (0.556, 0.060, 0.707, 0.245),
    "l2": (0.711, 0.058, 0.855, 0.248),
    "l3": (0.859, 0.058, 0.999, 0.255),
}
EXAMPLES = {
    "cottage": (0.280, 0.530, 0.403, 0.735),
    "workshop": (0.403, 0.530, 0.526, 0.735),
    "storehouse": (0.526, 0.530, 0.653, 0.738),
    "blacksmith": (0.653, 0.530, 0.776, 0.738),
    "townhall": (0.776, 0.525, 0.889, 0.740),
    "lighthouse": (0.889, 0.525, 0.987, 0.742),
}
# swatch rows: (label, y-fraction of row centre); 6 swatches per row
PALETTE_ROWS = [
    ("roof", 0.150),
    ("wood", 0.187),
    ("stone", 0.225),
    ("accents", 0.262),
    ("lighting", 0.299),
]
SWATCH_X0 = 0.0697  # centre of the first swatch
SWATCH_STEP = 0.0342
SWATCH_N = 6


def crop_frac(im: Image.Image, box: tuple[float, float, float, float]) -> Image.Image:
    w, h = im.size
    return im.crop((round(box[0] * w), round(box[1] * h), round(box[2] * w), round(box[3] * h)))


def sample_palette(im: Image.Image) -> dict[str, list[str]]:
    """Median-of-patch per swatch — robust to the sheet's painterly texture."""
    w, h = im.size
    out: dict[str, list[str]] = {}
    for label, fy in PALETTE_ROWS:
        row: list[str] = []
        for k in range(SWATCH_N):
            cx = round((SWATCH_X0 + k * SWATCH_STEP) * w)
            cy = round(fy * h)
            patch = im.crop((cx - 6, cy - 6, cx + 6, cy + 6))
            px = sorted(patch.getdata(), key=lambda p: p[0] + p[1] + p[2])
            r, g, b = px[len(px) // 2][:3]
            row.append(f"#{r:02x}{g:02x}{b:02x}")
        out[label] = row
    return out


def matte_panel(panel: Image.Image, size: int = 512) -> Image.Image:
    """A guide panel on the neutral grey backdrop, fitted into a square cell.

    The guide's parchment shows around each building; a flat replace is
    impossible without a cutout, so instead the panel is centred SMALL on a
    dominant grey field — the adapter's global 'background' signal then reads
    grey, and the parchment shrinks to a minor feature.
    """
    cell = Image.new("RGB", (size, size), BACKDROP)
    fitted = panel.copy()
    fitted.thumbnail((int(size * 0.72), int(size * 0.72)), Image.LANCZOS)
    cell.paste(fitted, ((size - fitted.width) // 2, (size - fitted.height) // 2))
    return cell


def board(panels: list[Image.Image], dest: Path) -> None:
    b = Image.new("RGB", (1024, 1024), BACKDROP)
    for i, p in enumerate(panels[:4]):
        b.paste(matte_panel(p), ((i % 2) * 512, (i // 2) * 512))
    b.save(dest)


def debug_overlay(im: Image.Image, dest: Path) -> None:
    ov = im.copy()
    d = ImageDraw.Draw(ov)
    w, h = im.size
    for name, box in {**PROGRESSION, **{f"ex_{k}": v for k, v in EXAMPLES.items()}}.items():
        px = (box[0] * w, box[1] * h, box[2] * w, box[3] * h)
        d.rectangle(px, outline=(255, 0, 255), width=3)
        d.text((px[0] + 4, px[1] + 4), name, fill=(255, 0, 255))
    for label, fy in PALETTE_ROWS:
        for k in range(SWATCH_N):
            cx = (SWATCH_X0 + k * SWATCH_STEP) * w
            cy = fy * h
            d.rectangle((cx - 8, cy - 8, cx + 8, cy + 8), outline=(0, 255, 0), width=2)
    ov.thumbnail((1536, 1024))
    ov.save(dest)


def compare_sheet(im: Image.Image, tag: str, dest: Path, village: bool = False) -> None:
    """Guide's own progression row above, ours below, states column-aligned.

    The only honest way to judge 'does this match the guide' — same order, same
    scale, adjacent. Missing states render as an empty cell rather than
    shifting the columns out of alignment.
    """
    order = ["ruin", "wip", "l1", "l2", "l3"]
    key = {"ruin": "ruined", "wip": "wip", "l1": "l1", "l2": "l2", "l3": "l3"}
    prog = OUT / "progression"
    cell = 420
    label_h = 26
    sheet = Image.new("RGB", (len(order) * cell, 2 * (cell + label_h)), (28, 32, 44))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("arial.ttf", 17)
    except OSError:
        font = ImageFont.load_default()

    for col, state in enumerate(order):
        # row 0 — the guide
        panel = crop_frac(im, PROGRESSION[key[state]])
        panel.thumbnail((cell - 12, cell - 12), Image.LANCZOS)
        sheet.paste(panel, (col * cell + (cell - panel.width) // 2, (cell - panel.height) // 2))
        draw.text((col * cell + 8, cell + 4), f"GUIDE  {state}", fill=(180, 200, 255), font=font)
        # row 1 — ours
        y0 = cell + label_h
        src = (OUT / "village" / f"{tag}_{state}.png") if village else (prog / f"forge_{state}_ident_{tag}.png")
        if src.exists():
            ours = Image.open(src).convert("RGB")
            ours.thumbnail((cell - 12, cell - 12), Image.LANCZOS)
            sheet.paste(ours, (col * cell + (cell - ours.width) // 2, y0 + (cell - ours.height) // 2))
            draw.text((col * cell + 8, y0 + cell + 4), f"OURS  {state}", fill=(255, 214, 138), font=font)
        else:
            draw.text((col * cell + 8, y0 + cell // 2), "(not rendered)", fill=(120, 130, 150), font=font)
    sheet.save(dest)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--debug", action="store_true", help="only write the crop overlay")
    ap.add_argument("--compare", metavar="TAG", help="build the guide-vs-ours progression sheet for this run tag")
    ap.add_argument("--compare-village", metavar="BUILDING", help="guide row vs a comfy_village.py progression")
    args = ap.parse_args()

    if args.compare_village:
        OUT.mkdir(parents=True, exist_ok=True)
        im = Image.open(GUIDE).convert("RGB")
        dest = OUT / f"_guide_vs_{args.compare_village}.png"
        compare_sheet(im, args.compare_village, dest, village=True)
        print(f"comparison: {dest}")
        return

    if args.compare:
        OUT.mkdir(parents=True, exist_ok=True)
        im = Image.open(GUIDE).convert("RGB")
        dest = OUT / f"_guide_vs_ours_{args.compare}.png"
        compare_sheet(im, args.compare, dest)
        print(f"comparison: {dest}")
        return

    OUT.mkdir(parents=True, exist_ok=True)
    im = Image.open(GUIDE).convert("RGB")

    debug_overlay(im, OUT / "_guide_crop_overlay.png")
    print(f"overlay: {OUT / '_guide_crop_overlay.png'}")
    if args.debug:
        return

    palette = sample_palette(im)
    (OUT / "style_guide.json").write_text(json.dumps(palette, indent=2))
    for k, v in palette.items():
        print(f"{k:9s} {' '.join(v)}")

    prog = [crop_frac(im, PROGRESSION[k]) for k in ("l1", "l2", "l3", "wip")]
    board(prog, OUT / "_guide_board_prog.png")
    ex = [crop_frac(im, EXAMPLES[k]) for k in ("blacksmith", "cottage", "workshop", "lighthouse")]
    board(ex, OUT / "_guide_board_examples.png")
    # A RUIN-ONLY board. The main board is four teal-roofed buildings, and an
    # IPAdapter transfers everything it is shown — on a roofless ruin it had
    # nowhere to put the teal but the stonework, which is why sawmill/bakery
    # ruins came out mint-green no matter how the PROMPT was reworded.
    ruin_panel = crop_frac(im, PROGRESSION["ruined"])
    board([ruin_panel] * 4, OUT / "_guide_board_ruin.png")
    # Same reasoning for the half-built state: the guide's scaffolding panel is
    # fresh timber over raw stone with no roof, which is what a wip should
    # inherit. Shown the teal-roofed board instead, the adapter dumped teal
    # into the open bays and floor of the sawmill wip.
    wip_panel = crop_frac(im, PROGRESSION["wip"])
    board([wip_panel] * 4, OUT / "_guide_board_wip.png")
    print(f"boards: {OUT / '_guide_board_prog.png'}, {OUT / '_guide_board_examples.png'}")

    target = crop_frac(im, PROGRESSION["l1"])
    target.save(OUT / "_guide_target_l1.png")
    print(f"target: {OUT / '_guide_target_l1.png'}")


if __name__ == "__main__":
    main()
