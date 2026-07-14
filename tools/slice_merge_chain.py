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

    # ---- second wave: the remaining 14 chains -------------------------------
    # flowers: 4 top (bud,bloom,posy,bouquet) + 4 bottom; a stray potted-green plant
    # leads the bottom row — skip it. bed/wild/cart follow.
    "flowers": {
        "file": "Merge_Flowers fix.png",
        "ids": [
            "item_flowers_0", "item_flowers_1", "item_flowers_2", "item_flowers_3",
            None, "item_flowers_4", "item_flowers_5", "item_flowers_6",
        ],
    },
    # water: clean 7 in order (4 top + 3 bottom): droplet,splash,bowl,bucket / barrel,trough,fountain.
    "water": {
        "file": "Merge_Water fix.png",
        "ids": [f"item_water_{i}" for i in range(7)],
    },
    # copper: 4 top (ore,nuggets, dup clean-ingot, rubble) + 4 bottom (ingot,bar,sheet,pipes).
    # the 3rd top slot is a duplicate ingot — skip it; the rubble pile is Rubble(2).
    "copper": {
        "file": "Merge_Copper fix.png",
        "ids": [
            "item_copper_0", "item_copper_1", None, "item_copper_2",
            "item_copper_3", "item_copper_4", "item_copper_5", "item_copper_6",
        ],
    },
    # fish: 4 top (fish,pair, stray rock-pile, hanging Catch) + 3 bottom (pail,rack,crate).
    # skip the rocks; sheet has no Basket(4), so rack->5 and crate->6.
    "fish": {
        "file": "Merge_FIsh fix.png",
        "ids": [
            "item_fish_0", "item_fish_1", None, "item_fish_2",
            "item_fish_3", "item_fish_5", "item_fish_6",
        ],
    },
    # honey: 4 top (blossom,comb,honeycomb,slab) + 4 bottom (bowl,jar,barrel, stray fish-crate).
    # skip the fish crate.
    "honey": {
        "file": "Merge_Honey fix.png",
        "ids": [
            "item_honey_0", "item_honey_1", "item_honey_2", "item_honey_3",
            "item_honey_4", "item_honey_5", "item_honey_6", None,
        ],
    },
    # herbs: clean 7 in order (4 top + 3 bottom): leaf,sprig,bunch,pot / bush,drying-rack,mortar.
    "herbs": {
        "file": "Merge_Herbs fix.png",
        "ids": [f"item_herbs_{i}" for i in range(7)],
    },
    # wool: clean 7 in order (4 top + 3 bottom): tuft,fleece,bundle,yarn / skeins,bolt,bale.
    "wool": {
        "file": "Merge_Wool fix.png",
        "ids": [f"item_wool_{i}" for i in range(7)],
    },
    # books: clean 7 in order (4 top + 3 bottom): note,papers,book,tome / volumes,bookcase,library.
    "books": {
        "file": "Merge_books fix.png",
        "ids": [f"item_books_{i}" for i in range(7)],
    },
    # music: 4 top (note,notes,score, stray book) + 4 bottom (lute,fiddle,piano,gramophone).
    # skip the book in the top-right slot.
    "music": {
        "file": "Merge_music fix.png",
        "ids": [
            "item_music_0", "item_music_1", "item_music_2", None,
            "item_music_3", "item_music_4", "item_music_5", "item_music_6",
        ],
    },
    # hearthfire: 4 in a single row (dark bg — auto-keyed): candle,lantern,heart-flame,brazier.
    "hearthfire": {
        "file": "Merge_Hearthfire.png",
        "ids": [f"item_hearthfire_{i}" for i in range(4)],
    },
    # homestead: 5 in a single row (black bg — auto-keyed): driftwood,cut-stone,kiln,frame,cottage.
    "homestead": {
        "file": "Merge_Homestead fix.png",
        "ids": [f"item_homestead_{i}" for i in range(5)],
        "split": True,  # frame+cottage sit close; even-split the single row
    },
    # greenhouse: 6 in a single row (grey-gradient bg — auto-keyed):
    # windfall,rubble,potted-sprout,planter,flower-cart,greenhouse.
    "greenhouse": {
        "file": "Merge_Greenhouse fix.png",
        "ids": [f"item_greenhouse_{i}" for i in range(6)],
        "split": True,  # items share faint ground ellipses that bridge after keying
    },
    # smithy: 5 in a single row (grey-gradient bg — auto-keyed): spring,pail,flower-pot,
    # flower-box,forge. no Well(4) on the sheet, so the final forge maps to level 5.
    "smithy": {
        "file": "Merge_Smithy fix.png",
        "ids": [
            "item_smithy_0", "item_smithy_1", "item_smithy_2",
            "item_smithy_3", "item_smithy_5",
        ],
    },
    # apothecary: clean 7 in a single row: ore,copper,mortar,harvest,barrel,tincture,apothecary.
    "apothecary": {
        "file": "Merge_APOTHECARY fix.png",
        "ids": [f"item_apothecary_{i}" for i in range(7)],
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


def even_cells(al: np.ndarray, n: int) -> list[tuple[int, int, int, int]]:
    """Single-row fallback: some sheets sit their items on faint ground ellipses that
    bridge after keying, so gap-detection under-splits. Take the row's content bbox,
    divide its width into n equal columns, and tighten each column back to its own
    alpha. Robust for evenly-spaced single-row chain sheets (homestead, greenhouse)."""
    ys = np.where((al > ATH).any(axis=1))[0]
    xs = np.where((al > ATH).any(axis=0))[0]
    y0, y1, x0, x1 = ys[0], ys[-1] + 1, xs[0], xs[-1] + 1
    cells: list[tuple[int, int, int, int]] = []
    for k in range(n):
        cx0 = x0 + (x1 - x0) * k // n
        cx1 = x0 + (x1 - x0) * (k + 1) // n
        sub = al[y0:y1, cx0:cx1]
        cy = np.where(sub.max(axis=1) > ATH)[0]
        cx = np.where(sub.max(axis=0) > ATH)[0]
        if len(cy) == 0 or len(cx) == 0:
            continue
        cells.append((cx0 + cx[0], y0 + cy[0], cx0 + cx[-1] + 1, y0 + cy[-1] + 1))
    return cells


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
    # Dense perimeter seeds: several of these sheets have a smooth grey/brown/black
    # gradient background (not a flat colour), so each seed floods only its locally
    # similar patch — spacing them ~55px apart keeps consecutive floods overlapping
    # right across the gradient while the saturated items stay untouched.
    seeds: list[tuple[int, int]] = []
    for x in range(2, w, 55):
        seeds += [(x, 2), (x, h - 3)]
    for y in range(2, h, 55):
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
        ids = cfg["ids"]
        cells = even_cells(al, len(ids)) if cfg.get("split") else detect_cells(al)
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
