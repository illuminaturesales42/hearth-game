"""
slice_generated.py — cut the ChatGPT-generated batch sheets into game assets.

These sheets differ from the Final Assets pack: they arrive as grids on a
near-white background (not real alpha), sometimes with baked-in labels. This
tool finds each item by gap detection (no hand-tuned pixel boxes), border-flood
keys the white away (preserving interior whites like clouds/snow/foam), and
writes public/art/<id>.png, then unions the new ids into src/art-manifest.ts.

Run after saving a batch:  python tools/slice_generated.py
Idempotent. Owns only the ids listed in JOBS; re-run after slice_assets.py so
its ids get re-added to the (regenerated) manifest.
"""
from __future__ import annotations

from pathlib import Path
import re

import numpy as np
from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parent.parent
ART = REPO / "public" / "art"
SRC = Path(
    "C:/Users/illum/OneDrive/Desktop/Hearth/Graphics and UI"
    "/Core/Final Assets/Claude prompts"
)
MANIFEST = REPO / "src" / "art-manifest.ts"
LANCZOS = Image.Resampling.LANCZOS

# id lists in reading order (row-major, left→right, top→bottom)
CHAPTERS = [f"chapter_{i}" for i in range(1, 7)]
LOCATIONS = ["loc_lighthouse", "loc_bakery", "loc_market", "loc_pier", "loc_docks", "loc_cove"]
AVATARS = [f"avatar_{i}" for i in range(1, 7)]
# Batch 15 (generic UI atlas): we take only painted map pins to replace the map's
# emoji markers. Character portraits are deferred (they're a different cast to the
# Emberhollow story, so they need a re-casting decision); energy flames duplicate the
# bespoke ember-heart; gems / sale / refill popups violate the no-monetisation pillar.
PINS = [
    "pin_harbor", "pin_forest", "pin_mystery", "pin_home", "pin_quest",
    "flag_boat", "flag_nature", "flag_build", "flag_event", "flag_shop",
    "stake_anchor", "stake_tree", "stake_star", "stake_exclaim",
]

JOBS = [
    {"file": "Batch 5.png", "mode": "grid", "ids": CHAPTERS, "grid": (2, 3)},
    {"file": "Batch 7.png", "mode": "grid", "ids": LOCATIONS, "grid": (2, 3)},
    {"file": "Batch 8.png", "mode": "grid", "ids": AVATARS, "grid": (2, 3)},
    {"file": "Batch 2.png", "mode": "whole", "ids": ["feature_graphic"], "maxw": 1600},
    # Batch 15 (generic UI atlas) — only the clean, on-pillar map-pin row:
    {"file": "Batch 15.png", "mode": "grid", "ids": PINS, "grid": (1, 14), "region": (0, 477, 1536, 590)},
    # NOTE: board_frame (Batch 2 -3, lower half) is deferred — it sits on a
    # *painted* checker (not real alpha), carries a faint label, and is landscape
    # while the board is portrait, so it needs checker-removal + 9-slice wiring.
]

WHITE = 236  # a pixel with every channel >= this counts as background


def content_mask(rgb: np.ndarray) -> np.ndarray:
    """True where the pixel is NOT near-white background."""
    return ~(rgb >= WHITE).all(axis=2)


def bands(profile: np.ndarray, min_len: int, gap: int) -> list[tuple[int, int]]:
    """Contiguous True runs in a 1-D bool profile, merging gaps <= `gap`,
    keeping runs >= `min_len` (drops thin label rows / noise)."""
    out: list[list[int]] = []
    start = None
    for i, v in enumerate(profile):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append([start, i])
            start = None
    if start is not None:
        out.append([start, len(profile)])
    merged: list[list[int]] = []
    for b in out:
        if merged and b[0] - merged[-1][1] <= gap:
            merged[-1][1] = b[1]
        else:
            merged.append(b)
    return [(a, b) for a, b in merged if b - a >= min_len]


def tight_bbox(mask: np.ndarray, x0: int, y0: int, x1: int, y1: int):
    """Tighten a cell rectangle to its actual content."""
    sub = mask[y0:y1, x0:x1]
    ys = np.where(sub.any(axis=1))[0]
    xs = np.where(sub.any(axis=0))[0]
    if len(xs) == 0 or len(ys) == 0:
        return None
    return (x0 + xs[0], y0 + ys[0], x0 + xs[-1] + 1, y0 + ys[-1] + 1)


def cells_by_gaps(mask: np.ndarray, rows: int, cols: int):
    """Hierarchical row→column gap detection for a known `rows`×`cols` grid.
    Falls back to even division on either axis when gap detection doesn't yield
    the expected count (e.g. rectangular cards whose deckled edges bridge gaps).
    """
    h, w = mask.shape
    row_bands = bands(mask.any(axis=1), min_len=int(h * 0.08), gap=int(h * 0.02))
    if len(row_bands) != rows:
        row_bands = [(int(r * h / rows), int((r + 1) * h / rows)) for r in range(rows)]
    found = []
    for (ry0, ry1) in row_bands:
        strip = mask[ry0:ry1]
        col_bands = bands(strip.any(axis=0), min_len=int(w * 0.05), gap=int(w * 0.02))
        if len(col_bands) != cols:
            col_bands = [(int(c * w / cols), int((c + 1) * w / cols)) for c in range(cols)]
        for (cx0, cx1) in col_bands:
            box = tight_bbox(mask, cx0, ry0, cx1, ry1)
            if box:
                found.append(box)
    return found


def flood_cutout(rgb: Image.Image, seeds, thresh: int = 42) -> Image.Image:
    """Border/seed flood-fill the white away → RGBA, cropped to content.
    Interior whites not connected to a seed (clouds, snow, lighthouses) survive.
    """
    scratch = rgb.convert("RGB").copy()
    KEY = (255, 0, 255)
    for (sx, sy) in seeds:
        sx = min(max(sx, 0), scratch.width - 1)
        sy = min(max(sy, 0), scratch.height - 1)
        ImageDraw.floodfill(scratch, (sx, sy), KEY, thresh=thresh)
    src = np.array(rgb.convert("RGBA"))
    keyed = (np.array(scratch) == KEY).all(axis=2)
    src[keyed] = (0, 0, 0, 0)
    out = Image.fromarray(src)
    box = out.getbbox()
    return out.crop(box) if box else out


def update_manifest(new_ids: set[str]) -> None:
    text = MANIFEST.read_text(encoding="utf-8")
    m = re.search(r"new Set\(\[(.*?)\]\)", text, re.S)
    if not m:
        raise SystemExit("could not find ART_IDS Set in art-manifest.ts")
    existing = set(re.findall(r"'([^']+)'", m.group(1)))
    all_ids = sorted(existing | new_ids)
    block = "new Set([\n" + "".join(f"  '{i}',\n" for i in all_ids) + "])"
    MANIFEST.write_text(text[: m.start()] + block + text[m.end():], encoding="utf-8")
    print(f"manifest: {len(existing)} -> {len(all_ids)} ids (+{len(all_ids) - len(existing)})")


def main() -> None:
    ART.mkdir(parents=True, exist_ok=True)
    written: set[str] = set()

    for job in JOBS:
        path = SRC / job["file"]
        if not path.exists():
            print(f"SKIP (missing): {job['file']}")
            continue
        im = Image.open(path).convert("RGB")
        w, h = im.size

        if job["mode"] == "whole":
            out = im.copy()
            if w > job["maxw"]:
                out = out.resize((job["maxw"], round(h * job["maxw"] / w)), LANCZOS)
            ident = job["ids"][0]
            out.save(ART / f"{ident}.png")
            written.add(ident)
            print(f"{job['file']:14} -> {ident} {out.size}")
            continue

        if job["mode"] == "frame":
            y0 = int(h * job["top_frac"])
            region = im.crop((0, y0, w, h))
            # frame: white outside AND inside the timber → flood from corners + centre
            rw, rh = region.size
            seeds = [(2, 2), (rw - 3, 2), (2, rh - 3), (rw - 3, rh - 3), (rw // 2, rh // 2)]
            cut = flood_cutout(region, seeds)
            ident = job["ids"][0]
            cut.save(ART / f"{ident}.png")
            written.add(ident)
            print(f"{job['file']:14} -> {ident} {cut.size}")
            continue

        # grid mode (optionally within a sub-region of the sheet)
        work = im.crop(job["region"]) if job.get("region") else im
        arr = np.array(work)
        mask = content_mask(arr)
        rows, cols = job["grid"]
        boxes = cells_by_gaps(mask, rows, cols)
        ids = job["ids"]
        note = "OK" if len(boxes) == len(ids) else f"!! found {len(boxes)} expected {len(ids)}"
        print(f"{job['file']:14} grid {rows}x{cols}: {len(boxes)} cells [{note}]")
        for i, box in enumerate(boxes):
            if i >= len(ids):
                break
            cell = work.crop(box)
            cw, ch = cell.size
            seeds = [(2, 2), (cw - 3, 2), (2, ch - 3), (cw - 3, ch - 3)]
            cut = flood_cutout(cell, seeds)
            cut.save(ART / f"{ids[i]}.png")
            written.add(ids[i])
            print(f"    {ids[i]:16} <- cell {box} -> {cut.size}")

    if written:
        update_manifest(written)
    print(f"done: {len(written)} assets")


if __name__ == "__main__":
    main()
