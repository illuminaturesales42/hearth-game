"""Slice the per-building progression strips (Transparent/Batches/Buildings/*.png)
into their five stages — ruin, construction (wip), L1, L2, L3 — key the white
background (edge-flood, so interior cream awnings survive), autocrop, defringe.

Each sheet is one building painted left→right through its five states on a white
(or already-transparent) ground. We detect the five blobs by gaps in the column
alpha profile, so uneven sheet widths and spacing all work without hardcoded
boxes.

Default run writes a PREVIEW dir + a contact sheet for eyeballing. Pass --apply
to also copy L1/L2/L3 over the live public/art/town_<name>{,_l2,_l3}.png ids
(which already exist in the manifest, so no manifest change is needed).

Usage:
  python tools/slice_buildings.py            # preview only
  python tools/slice_buildings.py --apply     # + overwrite live L1/L2/L3
"""

import sys
from pathlib import Path

from PIL import Image

# Reuse the exact keying/cleanup the rest of the pipeline uses.
sys.path.insert(0, str(Path(__file__).parent))
from slice_assets import remove_bg, defringe, alpha_autocrop  # noqa: E402

SRC = Path(
    r"C:/Users/illum/OneDrive/Desktop/Hearth/Graphics and UI/Core/Final Assets/Transparent/Batches/Buildings"
)
REPO = Path(__file__).resolve().parent.parent
OUT_LIVE = REPO / "public" / "art"
OUT_PREVIEW = REPO / "tools" / "_build_preview"
CONTACT = REPO / "tools" / "buildings_contact.png"

# sheet filename -> town_<name> id stem
NAME = {
    "Bakery.png": "bakery",
    "Blacksmith.png": "blacksmith",
    "Cotage.png": "cottage",
    "Dock.png": "dock",
    "Fish Hut.png": "fisherhut",
    "Garden.png": "garden",
    "Libary.png": "library",
    "Market.png": "market",
    "Sawmill.png": "sawmill",
    "Town hall.png": "townhall",
    "workshop.png": "workshop",
}

# stage index (left→right) -> id suffix. L1 is the base town_<name>.
STAGE_SUFFIX = {2: "", 3: "_l2", 4: "_l3", 0: "_ruin", 1: "_wip"}
KEY_WHITE = (255, 255, 255)
KEY_TOL = 40


def denoise_alpha(im: Image.Image, floor: int = 24) -> Image.Image:
    """Zero out faint alpha (soft shadow haze / export noise) so autocrop and
    segmentation see clean edges. Keeps anti-aliasing above the floor."""
    im = im.convert("RGBA")
    r, g, b, a = im.split()
    a = a.point(lambda v: v if v >= floor else 0)
    return Image.merge("RGBA", (r, g, b, a))


def solid_crop(im: Image.Image, thresh: int = 90, pad_frac: float = 0.04) -> Image.Image:
    """Crop to the bbox of reasonably-opaque content (ignores faint remnants
    that defeat a plain alpha bbox), plus padding."""
    im = im.convert("RGBA")
    mask = im.getchannel("A").point(lambda v: 255 if v >= thresh else 0)
    box = mask.getbbox()
    if not box:
        return im
    w, h = im.size
    pw = int((box[2] - box[0]) * pad_frac)
    ph = int((box[3] - box[1]) * pad_frac)
    return im.crop((max(0, box[0] - pw), max(0, box[1] - ph), min(w, box[2] + pw), min(h, box[3] + ph)))


def already_transparent(im: Image.Image) -> bool:
    """True if the sheet arrived pre-keyed (transparent border)."""
    im = im.convert("RGBA")
    w, h = im.size
    corners = [im.getpixel(p)[3] for p in ((0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1))]
    return max(corners) == 0


def column_runs(im: Image.Image, min_alpha: int = 120, gap_frac: float = 0.006) -> list[tuple[int, int]]:
    """Contiguous column ranges that hold SOLID content. A column counts only
    if it has a run of >=`min_solid` vertically-adjacent near-opaque pixels —
    this ignores the soft, low-alpha base shadows that otherwise bridge the
    white gaps between the five buildings. Runs separated by a gap narrower than
    gap_frac*w are merged (a building's own internal transparency); runs thinner
    than min_width_frac*w are dropped (stray flags/specks)."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.getchannel("A").load()
    min_solid = max(4, int(h * 0.02))  # a real building column has a solid vertical span
    col_has = []
    for x in range(w):
        run = best = 0
        for y in range(h):
            if px[x, y] >= min_alpha:
                run += 1
                best = max(best, run)
            else:
                run = 0
        col_has.append(best >= min_solid)
    runs: list[tuple[int, int]] = []
    x = 0
    while x < w:
        if not col_has[x]:
            x += 1
            continue
        x0 = x
        while x < w and col_has[x]:
            x += 1
        runs.append((x0, x))
    min_gap = int(w * gap_frac)
    merged: list[tuple[int, int]] = []
    for r in runs:
        if merged and r[0] - merged[-1][1] <= min_gap:
            merged[-1] = (merged[-1][0], r[1])
        else:
            merged.append(r)
    min_w = int(w * 0.03)
    return [r for r in merged if r[1] - r[0] >= min_w]


def slice_sheet(path: Path):
    im = Image.open(path).convert("RGBA")
    if not already_transparent(im):
        im = remove_bg(im, KEY_TOL, KEY_WHITE)
    im = denoise_alpha(im)
    runs = column_runs(im)
    # keep the five widest runs, then restore left→right order (drops any stray speck)
    runs = sorted(sorted(runs, key=lambda r: r[1] - r[0], reverse=True)[:5])
    cells = []
    for x0, x1 in runs:
        cell = solid_crop(defringe(im.crop((x0, 0, x1, im.height))))
        cells.append(cell)
    return cells


def contact(all_cells: dict[str, list[Image.Image]]):
    THUMB = 200
    rows = len(all_cells)
    cols = 5
    pad = 8
    W = cols * (THUMB + pad) + pad
    H = rows * (THUMB + pad) + pad
    sheet = Image.new("RGBA", (W, H), (24, 22, 34, 255))
    for r, (name, cells) in enumerate(sorted(all_cells.items())):
        for c, cell in enumerate(cells):
            t = cell.copy()
            t.thumbnail((THUMB, THUMB), Image.LANCZOS)
            x = pad + c * (THUMB + pad) + (THUMB - t.width) // 2
            y = pad + r * (THUMB + pad) + (THUMB - t.height) // 2
            sheet.alpha_composite(t, (x, y))
    sheet.convert("RGB").save(CONTACT)
    print(f"contact -> {CONTACT}")


def main():
    apply = "--apply" in sys.argv
    OUT_PREVIEW.mkdir(parents=True, exist_ok=True)
    all_cells: dict[str, list[Image.Image]] = {}
    for fname, stem in NAME.items():
        path = SRC / fname
        if not path.exists():
            print(f"skip {fname}: missing")
            continue
        cells = slice_sheet(path)
        all_cells[stem] = cells
        print(f"{fname:16} -> {len(cells)} stages {[c.size for c in cells]}")
        if len(cells) != 5:
            # Wrong split → stage mapping would be wrong. Never apply; keep the
            # building's existing art and flag it for a manual box pass.
            print(f"  !! expected 5 stages, got {len(cells)} — SKIPPED (keeps current art)")
            continue
        for i, cell in enumerate(cells):
            suffix = STAGE_SUFFIX.get(i)
            if suffix is None:
                continue
            ident = f"town_{stem}{suffix}"
            cell.save(OUT_PREVIEW / f"{ident}.png")
            # Only L1/L2/L3 map to existing manifest ids — apply those live.
            if apply and suffix in ("", "_l2", "_l3"):
                cell.save(OUT_LIVE / f"{ident}.png")
    contact(all_cells)
    print("APPLIED to public/art" if apply else "PREVIEW only (run with --apply to go live)")


if __name__ == "__main__":
    main()
