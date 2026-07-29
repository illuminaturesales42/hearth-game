"""
Before/after sheets for a catalogue revision.

Pairs each building's five states from a snapshot directory (the sprites as
they were) against the current ones, stacked so BEFORE sits directly above
AFTER for the same state. That vertical adjacency is the point — a side-by-side
of two 17x5 grids is unreadable, but one building at a time with the states
column-aligned makes a regression obvious at a glance.

Writes one sheet per building plus a combined strip, so a single file can be
sent for review and individual buildings can be checked closely.

Usage (ComfyUI venv interpreter for PIL):
  ...python.exe tools/comfy_beforeafter.py
  ...python.exe tools/comfy_beforeafter.py --only bakery farm townhall
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from comfy_dialin import SUBJECT_CLAUSES  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
BEFORE = REPO / "tools" / "comfy_out" / "_before"
AFTER = REPO / "tools" / "comfy_out" / "cutout" / "village"
OUT = REPO / "tools" / "comfy_out" / "beforeafter"
STATES = ["ruin", "wip", "l1", "l2", "l3"]

BG = (18, 22, 32)
ROW_BEFORE = (34, 28, 30)
ROW_AFTER = (24, 34, 30)


def _fonts():
    try:
        return ImageFont.truetype("arial.ttf", 13), ImageFont.truetype("arialbd.ttf", 15)
    except OSError:
        f = ImageFont.load_default()
        return f, f


def building_sheet(b: str, cell: int = 230) -> Image.Image:
    f, fb = _fonts()
    left, hdr, lab = 96, 26, 20
    w = left + len(STATES) * cell
    h = hdr + 2 * (cell + lab)
    sheet = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(sheet)
    d.text((8, 6), b, fill=(255, 214, 138), font=fb)
    for c, s in enumerate(STATES):
        d.text((left + c * cell + cell // 2 - 14, 6), s.upper(), fill=(150, 175, 220), font=f)
    for r, (label, root, tint) in enumerate(
        [("BEFORE", BEFORE, ROW_BEFORE), ("AFTER", AFTER, ROW_AFTER)]
    ):
        y = hdr + r * (cell + lab)
        d.rectangle([0, y, w, y + cell + lab - 2], fill=tint)
        d.text((8, y + cell // 2 - 7), label, fill=(220, 220, 230), font=fb)
        for c, s in enumerate(STATES):
            p = root / f"{b}_{s}.png"
            if not p.exists():
                d.text((left + c * cell + 20, y + cell // 2), "(none)", fill=(120, 130, 150), font=f)
                continue
            im = Image.open(p).convert("RGBA")
            im.thumbnail((cell - 12, cell - 12), Image.LANCZOS)
            sheet.paste(im, (left + c * cell + (cell - im.width) // 2, y + (cell - im.height) // 2), im)
    return sheet


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="limit to these buildings")
    ap.add_argument("--cell", type=int, default=230)
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    names = args.only or sorted(SUBJECT_CLAUSES)
    sheets = []
    for b in names:
        s = building_sheet(b, args.cell)
        dest = OUT / f"{b}_beforeafter.png"
        s.save(dest)
        sheets.append(s)
        print(f"  {dest.name}")

    if sheets:
        w = max(s.width for s in sheets)
        combined = Image.new("RGB", (w, sum(s.height + 8 for s in sheets)), BG)
        y = 0
        for s in sheets:
            combined.paste(s, (0, y))
            y += s.height + 8
        dest = OUT / "ALL_beforeafter.png"
        combined.save(dest)
        print(f"\ncombined: {dest}  ({len(sheets)} buildings, {combined.size[0]}x{combined.size[1]})")


if __name__ == "__main__":
    main()
