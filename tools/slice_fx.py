"""
slice_fx.py — cut the black-background flame animation atlas (Merge FX 2.png)
into transparent, uniform sprite STRIPS for CSS steps() animation.

Black background + additive glow means alpha = brightness reconstructs the soft
falloff perfectly: we set each pixel's alpha to its max channel, keep the colour,
and the flame floats cleanly over any board tint.

Each of the 9 flame rows (7 frames) becomes one horizontal strip PNG whose cells
are all the same size, so a `steps(N)` background-position animation plays it.
The 10th row (loose ember particles) is skipped — the merge juice only needs the
Heartfire pulse; the flame library is there for later town/beacon animation.

Run:  python tools/slice_fx.py   (prints each strip's frames + cell WxH for the CSS)
"""
from __future__ import annotations

from pathlib import Path
import re

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parent.parent
ART = REPO / "public" / "art"
MANIFEST = REPO / "src" / "art-manifest.ts"
SRC = Path(
    "C:/Users/illum/OneDrive/Desktop/Hearth/Graphics and UI"
    "/Core/Final Assets/Claude prompts/Animate/Merge FX 2.png"
)

# row order top→bottom; the 10th row (ember particles) is intentionally omitted
NAMES = [
    "fx_flame_tiny", "fx_flame_small", "fx_flame_medium", "fx_flame_large",
    "fx_flame_beacon", "fx_flame_lantern", "fx_flame_fireplace", "fx_flame_forge",
    "fx_heartfire",
]
FRAMES_PER_ROW = 7
LABEL_CUT = 232   # left margin holds the row labels — start frames after it
BRIGHT = 22       # max-channel above this = flame content (else black bg)
CELL_CAP = 176    # downscale a strip cell if a flame is larger than this
LANCZOS = Image.Resampling.LANCZOS


def bands(profile: np.ndarray, min_len: int, gap: int) -> list[tuple[int, int]]:
    out: list[list[int]] = []
    s = None
    for i, v in enumerate(profile):
        if v and s is None:
            s = i
        elif not v and s is not None:
            out.append([s, i])
            s = None
    if s is not None:
        out.append([s, len(profile)])
    merged: list[list[int]] = []
    for b in out:
        if merged and b[0] - merged[-1][1] <= gap:
            merged[-1][1] = b[1]
        else:
            merged.append(b)
    return [(a, b) for a, b in merged if b - a >= min_len]


def lum_alpha(rgb: Image.Image) -> Image.Image:
    """RGB kept, alpha = max channel (brightness) → glow floats on transparency."""
    a = np.array(rgb.convert("RGB"))
    alpha = a.max(axis=2).astype(np.uint8)
    return Image.fromarray(np.dstack([a, alpha]))


def update_manifest(new_ids: set[str]) -> None:
    text = MANIFEST.read_text(encoding="utf-8")
    m = re.search(r"new Set\(\[(.*?)\]\)", text, re.S)
    existing = set(re.findall(r"'([^']+)'", m.group(1)))
    all_ids = sorted(existing | new_ids)
    block = "new Set([\n" + "".join(f"  '{i}',\n" for i in all_ids) + "])"
    MANIFEST.write_text(text[: m.start()] + block + text[m.end():], encoding="utf-8", newline="")
    print(f"manifest: {len(existing)} -> {len(all_ids)} ids")


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"missing source: {SRC}")
    im = Image.open(SRC).convert("RGB")
    arr = np.array(im)
    h, w = arr.shape[:2]
    bright = arr.max(axis=2) > BRIGHT

    # The atlas is a regular 10-row grid but the inter-row gaps are too faint to
    # gap-detect, so split rows evenly (last row = loose particles, skipped).
    ROWS = 10
    print(f"{SRC.name}: even-splitting {ROWS} rows, using first {len(NAMES)}")
    written: set[str] = set()

    for ridx in range(len(NAMES)):
        name = NAMES[ridx]
        # trim a little off the bottom of each band so the next row's label/glow
        # doesn't bleed into the frame (the flame content sits within the band)
        y0, y1 = int(ridx * h / ROWS), int((ridx + 1) * h / ROWS) - 12
        # frame columns, to the right of the label margin
        strip_mask = bright[y0:y1, LABEL_CUT:]
        cols = bands(strip_mask.any(axis=0), min_len=int(w * 0.02), gap=int(w * 0.01))
        cols = [(a + LABEL_CUT, b + LABEL_CUT) for a, b in cols]
        if len(cols) != FRAMES_PER_ROW:
            span0, span1 = LABEL_CUT, w
            step = (span1 - span0) / FRAMES_PER_ROW
            cols = [(int(span0 + k * step), int(span0 + (k + 1) * step)) for k in range(FRAMES_PER_ROW)]

        frames: list[Image.Image] = []
        for (cx0, cx1) in cols:
            sub = bright[y0:y1, cx0:cx1]
            ys = np.where(sub.any(axis=1))[0]
            xs = np.where(sub.any(axis=0))[0]
            if len(xs) == 0 or len(ys) == 0:
                continue
            box = (cx0 + xs[0], y0 + ys[0], cx0 + xs[-1] + 1, y0 + ys[-1] + 1)
            frames.append(lum_alpha(im.crop(box)))

        if not frames:
            print(f"  {name}: no frames?!")
            continue

        cw = max(f.width for f in frames)
        ch = max(f.height for f in frames)
        scale = min(1.0, CELL_CAP / max(cw, ch))
        cw, ch = round(cw * scale), round(ch * scale)
        strip = Image.new("RGBA", (cw * len(frames), ch), (0, 0, 0, 0))
        for k, f in enumerate(frames):
            if scale < 1.0:
                f = f.resize((max(1, round(f.width * scale)), max(1, round(f.height * scale))), LANCZOS)
            x = k * cw + (cw - f.width) // 2
            y = (ch - f.height) // 2
            strip.alpha_composite(f, (x, y))
        strip.save(ART / f"{name}.png")
        written.add(name)
        print(f"  {name:20} frames={len(frames)} cell={cw}x{ch} strip={strip.width}x{strip.height}")

    if written:
        update_manifest(written)
    print(f"done: {len(written)} strips")


if __name__ == "__main__":
    main()
