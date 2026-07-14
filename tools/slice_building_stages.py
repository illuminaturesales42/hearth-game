"""
slice_building_stages.py — cut the per-building 5-stage sheets into matched
ruin → scaffold → built → L2 → L3 sprites.

Each sheet in Transparent/Batches/Buildings/ shows ONE building drawn at a
consistent world scale across its life: a storm-worn ruin, an under-construction
scaffold, the finished build, and two upgrade tiers. This replaces the generic
town_ruin_/town_wip_ pool + the old L2/L3 slices with art that actually matches
each building.

Relative scale matters — the ruin is genuinely smaller and lower than the
mansion. So for each building we crop every stage tight, then drop it into a
COMMON cell (the union size across that building's stages), bottom-centre
anchored. All five sprites end up the same dimensions, so the map draws them at
one footprint width while their intrinsic sizes (and ground baselines) are
preserved — the building visibly grows as it's restored and upgraded.

Run:  python tools/slice_building_stages.py [building ...]   (default: all)
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parent.parent
ART = REPO / "public" / "art"
MANIFEST = REPO / "src" / "art-manifest.ts"
BATCHES = Path(
    "C:/Users/illum/OneDrive/Desktop/Hearth/Graphics and UI/Core/Final Assets/Transparent/Batches"
)
ATH = 60  # alpha above this = solid content (ignores soft contact-shadow haze)

# id-suffix per stage, in sheet order (left→right). '' = the base sprite id.
STAGES_5 = ["_ruin", "_wip", "", "_l2", "_l3"]
# Dock only has four frames (bare→crane→roofed→full) and no scaffold; map the
# three working frames to the three built tiers and reuse the bare dock as both
# ruin and scaffold.
STAGES_DOCK = ["_ruin", "", "_l2", "_l3"]

SHEETS: dict[str, dict] = {
    "cottage": {"file": "Buildings/Cotage.png", "stages": STAGES_5},
    "bakery": {"file": "Buildings/Bakery.png", "stages": STAGES_5},
    "market": {"file": "Buildings/Market.png", "stages": STAGES_5},
    "garden": {"file": "Buildings/Garden.png", "stages": STAGES_5},
    "townhall": {"file": "Buildings/Town hall.png", "stages": STAGES_5},
    "workshop": {"file": "Buildings/workshop.png", "stages": STAGES_5},
    "farm": {"file": "Farm.png", "stages": STAGES_5},
    "fisherhut": {"file": "Buildings/Fish Hut.png", "stages": STAGES_5},
    "sawmill": {"file": "Buildings/Sawmill.png", "stages": STAGES_5},
    "blacksmith": {"file": "Buildings/Blacksmith.png", "stages": STAGES_5},
    "library": {"file": "Buildings/Libary.png", "stages": STAGES_5},
    "dock": {"file": "Buildings/Dock.png", "stages": STAGES_DOCK, "wip_from": "_ruin"},
}


def dewhite(im: Image.Image) -> Image.Image:
    """Most of these sheets ship on an opaque WHITE background (only Garden and
    Town hall are truly transparent). Border-flood the white away to synthesise
    alpha; interior white building parts (awnings, plaster) aren't border-
    connected, so they survive. Dense perimeter seeds + a generous threshold eat
    the anti-aliased fringe so buildings don't keep a white halo on the meadow."""
    rgba = im.convert("RGBA")
    if (np.array(rgba)[:, :, 3] < 10).mean() > 0.05:
        return rgba  # already transparent (Garden / Town hall)
    rgb = im.convert("RGB")
    scratch = rgb.copy()
    KEY = (255, 0, 255)
    w, h = rgb.size
    seeds: list[tuple[int, int]] = []
    for x in range(2, w, 40):
        seeds += [(x, 2), (x, h - 3)]
    for y in range(2, h, 40):
        seeds += [(2, y), (w - 3, y)]
    for s in seeds:
        try:
            ImageDraw.floodfill(scratch, s, KEY, thresh=70)
        except Exception:
            pass
    keyed = (np.array(scratch) == KEY).all(axis=2)
    arr = np.dstack([np.array(rgb), np.where(keyed, 0, 255).astype(np.uint8)])
    return Image.fromarray(arr)


def split_stages(al: np.ndarray, n: int) -> list[tuple[int, int]]:
    """Split the sheet into n horizontal stage segments. The buildings sit on
    roughly even centres but their soft shadows bridge the gaps, so we anchor n
    equal bins then snap each interior boundary to the emptiest column in a
    search window around it (the true valley between two buildings)."""
    w = al.shape[1]
    content = (al > ATH).sum(axis=0)  # solid-pixel count per column
    xs = np.where(content > 0)[0]
    x0, x1 = int(xs[0]), int(xs[-1]) + 1
    span = x1 - x0
    bounds = [x0]
    for k in range(1, n):
        guess = x0 + span * k // n
        win = max(8, int(span / n * 0.35))
        lo, hi = max(x0 + 1, guess - win), min(x1 - 1, guess + win)
        cut = lo + int(np.argmin(content[lo:hi]))
        bounds.append(cut)
    bounds.append(x1)
    return [(bounds[i], bounds[i + 1]) for i in range(n)]


def tight(im: Image.Image, box: tuple[int, int]) -> Image.Image | None:
    """Crop a stage segment, then autocrop to its own alpha bounds. Uses a
    DENSITY gate rather than any-pixel: several of these sheets carry faint
    sub-visible alpha noise at the canvas edges, which a plain .any() autocrop
    would treat as content and blow the crop out to the full sheet height. A row
    or column only counts if it holds a real run of solid pixels."""
    seg = im.crop((box[0], 0, box[1], im.height))
    a = np.array(seg)[:, :, 3]
    solid = a > 110  # well above shadow haze / compression noise
    row_thr = max(4, int(a.shape[1] * 0.004))
    col_thr = max(4, int(a.shape[0] * 0.004))
    ys = np.where(solid.sum(axis=1) >= row_thr)[0]
    xs = np.where(solid.sum(axis=0) >= col_thr)[0]
    if len(ys) == 0 or len(xs) == 0:
        return None
    return seg.crop((int(xs[0]), int(ys[0]), int(xs[-1]) + 1, int(ys[-1]) + 1))


def update_manifest(new_ids: set[str]) -> None:
    text = MANIFEST.read_text(encoding="utf-8")
    m = re.search(r"new Set\(\[(.*?)\]\)", text, re.S)
    existing = set(re.findall(r"'([^']+)'", m.group(1)))
    all_ids = sorted(existing | new_ids)
    block = "new Set([\n" + "".join(f"  '{i}',\n" for i in all_ids) + "])"
    MANIFEST.write_text(text[: m.start()] + block + text[m.end():], encoding="utf-8", newline="")
    if new_ids - existing:
        print(f"manifest +{len(new_ids - existing)} new id(s)")


def main() -> None:
    want = sys.argv[1:] or list(SHEETS)
    written: set[str] = set()
    for name in want:
        cfg = SHEETS.get(name)
        if not cfg:
            print(f"SKIP unknown building: {name}")
            continue
        path = BATCHES / cfg["file"]
        if not path.exists():
            print(f"SKIP missing: {path}")
            continue
        im = dewhite(Image.open(path))
        stages = cfg["stages"]
        boxes = split_stages(np.array(im)[:, :, 3], len(stages))
        crops = [tight(im, b) for b in boxes]
        if any(c is None for c in crops):
            print(f"{name}: !! empty segment ({[c is not None for c in crops]})")
            continue
        # The built tiers (base / L2 / L3) are saved tight so each fills the
        # building's map footprint exactly like the existing sprites — no scale
        # regression. The ruin and scaffold are smaller than the finished build,
        # so they're dropped into a cell the size of the BASE stage (bottom-centre
        # anchored). Drawn at the same footprint width they then read as a smaller,
        # broken/half-built version sitting on the same ground line.
        base = crops[stages.index("")]
        bw, bh = base.size
        made: dict[str, Image.Image] = {}
        print(f"{name}: {len(crops)} stages, base {bw}x{bh}")
        for suffix, crop in zip(stages, crops):
            if suffix in ("", "_l2", "_l3"):
                canvas = crop  # tight — fills the footprint
            else:  # _ruin / _wip — scale relative to the finished build
                cw, ch = max(bw, crop.width), max(bh, crop.height)
                canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
                canvas.alpha_composite(crop, ((cw - crop.width) // 2, ch - crop.height))
            idn = f"town_{name}{suffix}"
            canvas.save(ART / f"{idn}.png")
            made[suffix] = canvas
            written.add(idn)
            print(f"    {idn:22} stage {crop.width}x{crop.height}")
        # buildings that reuse one stage for another state (dock: wip = ruin)
        if cfg.get("wip_from") is not None:
            src = made[cfg["wip_from"]]
            idn = f"town_{name}_wip"
            src.save(ART / f"{idn}.png")
            written.add(idn)
            print(f"    {idn:22} (copied from {cfg['wip_from'] or 'base'})")
    if written:
        update_manifest(written)
    print(f"done: {len(written)} sprites")


if __name__ == "__main__":
    main()
