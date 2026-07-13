"""
slice_merge_chain.py — cut a merge-chain sheet into centred board tiles.

The regenerated chain sheets (Core/Final Assets/Merge Slice/) are real-alpha PNGs:
one chain per sheet, items on a transparent background in a 2-row grid. This tool
alpha-detects each item, crops it, and **pads it into a centred square** so it sits
dead-centre in its board cell (fixing the off-centre tiles), then writes
public/art/item_<chain>_<level>.png.

`ids` lists the tiles in reading order (row-major, top-left → bottom-right); use
`None` to skip a stray/filler cell the generator added.

Run:  python tools/slice_merge_chain.py [chain ...]   (default: all configured)
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
SRC = Path(
    "C:/Users/illum/OneDrive/Desktop/Hearth/Graphics and UI/Core/Final Assets/Merge Slice"
)
ATH = 40       # alpha above this = item content (excludes faint drop-shadow)
PAD = 1.10     # square canvas side = max(item w, h) * PAD (a little breathing room)
LANCZOS = Image.Resampling.LANCZOS

CHAINS: dict[str, dict] = {
    # ids are in reading order (row-major); None skips a stray/filler cell, and the
    # numbers map each grid slot to the correct merge LEVEL (the generator sometimes
    # reorders items across rows, so identity — not position — drives the mapping).
    # wood: stray stone wall in the 7th reading slot — skip it.
    "wood": {
        "file": "Merge_Wood(fixed).png",
        "ids": [
            "item_wood_0", "item_wood_1", "item_wood_2", "item_wood_3",
            "item_wood_4", "item_wood_5", None, "item_wood_6",
        ],
    },
    # harvest: 5 top (wheat,loaf,pie,cake,basket) + 3 bottom (feast, fair-prize trophy,
    # stray veg sack). Skip the sack.
    "harvest": {
        "file": "Merge_Harvest fix.png",
        "ids": [
            "item_harvest_0", "item_harvest_1", "item_harvest_2", "item_harvest_3",
            "item_harvest_4", "item_harvest_5", "item_harvest_6", None,
        ],
    },
    # keepsake: correct 7, but the fishing net (level 5) sits in the top row, so
    # top = letter,paper,kettle,NET(5); bottom = bench(3),desk(4),rowboat(6).
    "keepsake": {
        "file": "Merge_Keepsake Fix.png",
        "ids": [
            "item_keepsake_0", "item_keepsake_1", "item_keepsake_2", "item_keepsake_5",
            "item_keepsake_3", "item_keepsake_4", "item_keepsake_6",
        ],
    },
    # clay: 4 top (clay,lump,ball, stray grey stone cube) + 4 bottom (coil=Mound,
    # bricks,kiln,amphora). Skip the grey cube.
    "clay": {
        "file": "Merge_Clay fix.png",
        "ids": [
            "item_clay_0", "item_clay_1", "item_clay_2", None,
            "item_clay_3", "item_clay_4", "item_clay_5", "item_clay_6",
        ],
    },
    # stone: correct 7 in order (opaque checker bg — auto-keyed).
    "stone": {
        "file": "Merge_Stone fix.png",
        "ids": [f"item_stone_{i}" for i in range(7)],
    },
    # seeds: correct 7 in order, 5 top + 2 bottom (opaque checker bg — auto-keyed).
    "seeds": {
        "file": "Merge_Seedes fix.png",
        "ids": [f"item_seeds_{i}" for i in range(7)],
    },
}


def bands(prof: np.ndarray, mn: int, gap: int) -> list[tuple[int, int]]:
    out: list[list[int]] = []
    s = None
    for i, v in enumerate(prof):
        if v and s is None:
            s = i
        elif not v and s is not None:
            out.append([s, i])
            s = None
    if s is not None:
        out.append([s, len(prof)])
    m: list[list[int]] = []
    for b in out:
        if m and b[0] - m[-1][1] <= gap:
            m[-1][1] = b[1]
        else:
            m.append(b)
    return [(a, b) for a, b in m if b - a >= mn]


def detect_cells(al: np.ndarray) -> list[tuple[int, int, int, int]]:
    """Row-major list of tight (x0,y0,x1,y1) item boxes."""
    h, w = al.shape
    rows = bands((al > ATH).any(axis=1), int(h * 0.06), int(h * 0.03))
    cells: list[tuple[int, int, int, int]] = []
    for (y0, y1) in rows:
        cols = bands((al[y0:y1] > ATH).any(axis=0), int(w * 0.03), int(w * 0.015))
        for (x0, x1) in cols:
            sub = al[y0:y1, x0:x1]
            ys = np.where(sub.max(axis=1) > ATH)[0]
            xs = np.where(sub.max(axis=0) > ATH)[0]
            cells.append((x0 + xs[0], y0 + ys[0], x0 + xs[-1] + 1, y0 + ys[-1] + 1))
    return cells


def ensure_alpha(im: Image.Image) -> Image.Image:
    """If the sheet has no real transparency (a painted checkerboard / flat light bg),
    border-flood the background away to synthesise an alpha channel. Interior item
    pixels aren't border-connected, so they survive."""
    rgba = im.convert("RGBA")
    if (np.array(rgba)[:, :, 3] < 10).mean() > 0.05:
        return rgba  # already has real transparency
    rgb = im.convert("RGB")
    scratch = rgb.copy()
    KEY = (255, 0, 255)
    w, h = rgb.size
    seeds: list[tuple[int, int]] = []
    for x in range(2, w, 110):
        seeds += [(x, 2), (x, h - 3)]
    for y in range(2, h, 110):
        seeds += [(2, y), (w - 3, y)]
    for s in seeds:
        try:
            ImageDraw.floodfill(scratch, s, KEY, thresh=72)
        except Exception:
            pass
    keyed = (np.array(scratch) == KEY).all(axis=2)
    print(f"    (opaque bg keyed: {keyed.mean():.2f} removed)")
    arr = np.dstack([np.array(rgb), np.where(keyed, 0, 255).astype(np.uint8)])
    return Image.fromarray(arr)


def square(img: Image.Image) -> Image.Image:
    w, h = img.size
    s = int(round(max(w, h) * PAD))
    canvas = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    canvas.alpha_composite(img, ((s - w) // 2, (s - h) // 2))
    return canvas


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
    want = sys.argv[1:] or list(CHAINS)
    written: set[str] = set()
    for chain in want:
        cfg = CHAINS.get(chain)
        if not cfg:
            print(f"SKIP unknown chain: {chain}")
            continue
        path = SRC / cfg["file"]
        if not path.exists():
            print(f"SKIP missing: {path}")
            continue
        im = ensure_alpha(Image.open(path))
        al = np.array(im)[:, :, 3]
        cells = detect_cells(al)
        ids = cfg["ids"]
        status = "OK" if len(cells) == len(ids) else f"!! {len(cells)} cells vs {len(ids)} ids"
        print(f"{chain}: {len(cells)} cells [{status}]")
        for i, box in enumerate(cells):
            if i >= len(ids) or ids[i] is None:
                print(f"    cell {i}: skipped")
                continue
            tile = square(im.crop(box))
            tile.save(ART / f"{ids[i]}.png")
            written.add(ids[i])
            iw, ih = box[2] - box[0], box[3] - box[1]
            print(f"    {ids[i]:16} item {iw}x{ih} -> square {tile.size[0]}")
    if written:
        update_manifest(written)
    print(f"done: {len(written)} tiles")


if __name__ == "__main__":
    main()
