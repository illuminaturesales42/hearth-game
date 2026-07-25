"""Turn any square-ish painting of water into a seamlessly tiling sea texture.

The engine tiles this across the sea and scrolls it, so the ONLY thing that must
be true is that opposite edges continue into each other. This tool guarantees
that, so the generated art doesn't have to.

It also copes with the way the art tends to arrive: a big sheet with labels or
margins around the actual painting. Give it a crop box, or let it auto-find the
largest watery region.

  python tools/make_sea_tile.py in.png public/art/fx_sea_tile.png
  python tools/make_sea_tile.py in.png out.png --size 512
  python tools/make_sea_tile.py in.png out.png --crop 100,200,900,1000   # l,t,r,b
  python tools/make_sea_tile.py in.png out.png --blend 0.25

Method: offset-and-cross-blend. The right strip is cross-faded into the left
strip (and bottom into top), then the redundant strip is dropped — so the new
left edge is the original column immediately after the new right edge, i.e. the
texture continues across the wrap. Preferred over mirroring, which tiles
perfectly but reads as kaleidoscope wallpaper on organic textures.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


def auto_crop_water(im: Image.Image) -> Image.Image:
    """Crop to the largest CONTIGUOUS blue/teal block — i.e. the actual painting,
    ignoring any label text, frame numbers, margins or checkerboard around it.
    (A plain bounding box isn't enough: on a labelled sheet it spans the lot.)"""
    a = np.asarray(im.convert("RGB")).astype(int)
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    watery = (b > r + 15) & (g > r)
    if watery.mean() < 0.02:
        return im
    try:
        from scipy import ndimage
    except ImportError:
        return im
    # close small gaps (frame separators) so one painting reads as one blob
    solid = ndimage.binary_closing(watery, structure=np.ones((5, 5)))
    lbl, n = ndimage.label(solid)
    if n == 0:
        return im
    sizes = ndimage.sum(solid, lbl, range(1, n + 1))
    biggest = int(np.argmax(sizes)) + 1
    ys, xs = np.where(lbl == biggest)
    pad = 6  # inset so separator/edge artefacts aren't baked in
    return im.crop(
        (
            int(xs.min()) + pad,
            int(ys.min()) + pad,
            max(int(xs.min()) + pad + 8, int(xs.max()) + 1 - pad),
            max(int(ys.min()) + pad + 8, int(ys.max()) + 1 - pad),
        )
    )


def centre_square(im: Image.Image) -> Image.Image:
    w, h = im.size
    s = min(w, h)
    return im.crop(((w - s) // 2, (h - s) // 2, (w - s) // 2 + s, (h - s) // 2 + s))


def make_seamless(arr: np.ndarray, f: float = 0.3) -> np.ndarray:
    """Cross-blend the wrap on both axes so opposite edges continue."""
    a = arr.astype(float)
    h, w = a.shape[:2]
    fw = max(1, int(w * f))
    t = np.linspace(0, 1, fw).reshape(1, fw, 1)
    out = np.concatenate([a[:, w - fw :] * (1 - t) + a[:, :fw] * t, a[:, fw : w - fw]], axis=1)
    h2, w2 = out.shape[:2]
    fh = max(1, int(h2 * f))
    tv = np.linspace(0, 1, fh).reshape(fh, 1, 1)
    return np.concatenate([out[h2 - fh :] * (1 - tv) + out[:fh] * tv, out[fh : h2 - fh]], axis=0)


def seam_error(arr: np.ndarray) -> tuple[float, float]:
    """Mean edge discontinuity across the wrap (0 = perfect). Sanity metric."""
    a = arr.astype(float)
    lr = float(np.abs(a[:, 0] - a[:, -1]).mean())
    tb = float(np.abs(a[0, :] - a[-1, :]).mean())
    return lr, tb


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--size", type=int, default=512, help="output tile size (square)")
    ap.add_argument("--blend", type=float, default=0.3, help="wrap blend width, 0.15-0.4")
    ap.add_argument("--crop", help="explicit crop l,t,r,b instead of auto-detect")
    args = ap.parse_args()

    im = Image.open(args.src).convert("RGB")
    print(f"source {im.size}")
    if args.crop:
        l, t, r, b = (int(v) for v in args.crop.split(","))
        im = im.crop((l, t, r, b))
        print(f"  cropped to {im.size}")
    else:
        im = auto_crop_water(im)
        print(f"  auto-cropped to the watery region: {im.size}")

    im = centre_square(im)
    tile = make_seamless(np.asarray(im), args.blend)
    out = Image.fromarray(np.clip(tile, 0, 255).astype(np.uint8)).resize(
        (args.size, args.size), Image.LANCZOS
    )

    lr, tb = seam_error(np.asarray(out))
    print(f"  seam error after wrap: left/right {lr:.2f}, top/bottom {tb:.2f} (lower is better)")
    if lr > 12 or tb > 12:
        print("  NOTE: still a visible seam — try a larger --blend (e.g. 0.4)")

    Path(args.dst).parent.mkdir(parents=True, exist_ok=True)
    out.save(args.dst)
    print(f"  wrote {args.dst} ({args.size}x{args.size})")

    # a 3x2 proof sheet next to the output so the tiling can be eyeballed
    proof = Image.new("RGB", (args.size * 3, args.size * 2))
    for y in range(2):
        for x in range(3):
            proof.paste(out, (x * args.size, y * args.size))
    proof_path = Path(args.dst).with_name(Path(args.dst).stem + "_tiled_proof.png")
    proof.resize((args.size * 3 // 2, args.size)).save(proof_path)
    print(f"  wrote {proof_path} — open it and check for seams")


if __name__ == "__main__":
    main()
