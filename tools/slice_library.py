"""
slice_library.py — extract every sprite from a labelled source sheet into
individual transparent PNGs, organised into a Sliced/ library.

Handles the Final Assets "Transparent" sheets: auto-keys an opaque white/painted
background to alpha (real-alpha sheets pass through), detects each item by
row-band -> column-cluster gap detection (dropping thin label rows), crops to
content, and writes <outdir>/r<row>_c<col>.png plus a manifest.txt of sizes.

Usage:
    python tools/slice_library.py "<source.png>" "<outdir>" [min_row_frac] [min_col_frac]

Position-named output is intentional — a human/catalogue assigns final asset
names afterwards (the sheets mix many categories per image).
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


def ensure_alpha(im: Image.Image) -> Image.Image:
    rgba = im.convert("RGBA")
    if (np.array(rgba)[:, :, 3] < 10).mean() > 0.05:
        return rgba
    rgb = im.convert("RGB")
    scratch = rgb.copy()
    KEY = (255, 0, 255)
    w, h = rgb.size
    seeds: list[tuple[int, int]] = []
    for x in range(2, w, 90):
        seeds += [(x, 2), (x, h - 3)]
    for y in range(2, h, 90):
        seeds += [(2, y), (w - 3, y)]
    for s in seeds:
        try:
            ImageDraw.floodfill(scratch, s, KEY, thresh=60)
        except Exception:
            pass
    keyed = (np.array(scratch) == KEY).all(axis=2)
    arr = np.dstack([np.array(rgb), np.where(keyed, 0, 255).astype(np.uint8)])
    print(f"  (auto-keyed opaque bg: {keyed.mean():.2f} removed)")
    return Image.fromarray(arr)


def bands(prof: np.ndarray, min_len: int, gap: int) -> list[tuple[int, int]]:
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
    return [(a, b) for a, b in m if b - a >= min_len]


def main() -> None:
    src = Path(sys.argv[1])
    outdir = Path(sys.argv[2])
    min_row = float(sys.argv[3]) if len(sys.argv) > 3 else 0.05
    min_col = float(sys.argv[4]) if len(sys.argv) > 4 else 0.02
    outdir.mkdir(parents=True, exist_ok=True)

    im = ensure_alpha(Image.open(src))
    al = np.array(im)[:, :, 3]
    h, w = al.shape
    ATH = 30
    rows = bands((al > ATH).any(axis=1), int(h * min_row), int(h * 0.02))
    print(f"{src.name}: {len(rows)} content rows")
    total = 0
    lines: list[str] = []
    for r, (y0, y1) in enumerate(rows):
        cols = bands((al[y0:y1] > ATH).any(axis=0), int(w * min_col), int(w * 0.008))
        print(f"  row {r} (y {y0}-{y1}): {len(cols)} items")
        for c, (x0, x1) in enumerate(cols):
            sub = al[y0:y1, x0:x1]
            ys = np.where(sub.max(axis=1) > ATH)[0]
            xs = np.where(sub.max(axis=0) > ATH)[0]
            box = (x0 + xs[0], y0 + ys[0], x0 + xs[-1] + 1, y0 + ys[-1] + 1)
            crop = im.crop(box)
            crop.save(outdir / f"r{r}_c{c}.png")
            lines.append(f"r{r}_c{c}\t{crop.size[0]}x{crop.size[1]}\tbox={box}")
            total += 1
    (outdir / "_manifest.txt").write_text("\n".join(lines), encoding="utf-8")
    print(f"done: {total} sprites -> {outdir}")


if __name__ == "__main__":
    main()
