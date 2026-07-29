"""
Turn a generated building render into a game-ready transparent sprite.

SDXL cannot output alpha, so every render arrives on a painted backdrop with a
cast shadow. This is the stage that makes it a usable asset:

  rembg (u2net)  ->  saliency alpha; the cast shadow is correctly left behind
  halo kill      ->  drop the semi-transparent, low-saturation grey fringe the
                     backdrop bleeds into edge pixels (warm lit windows are
                     saturated, so they survive untouched)
  colour bleed   ->  push solid colour outward into what fringe remains, so the
                     sprite reads correctly on ANY background instead of
                     ringing with the grey it was cut from
  despeckle      ->  drop keyed islands far smaller than the sprite body
  autocrop       ->  tight alpha bounding box + a small even pad
  downscale      ->  game scale (320 px long edge by default)
  verify         ->  assert the four corners are fully transparent

MUST run on the ComfyUI venv interpreter — rembg and the cached u2net model
live there, not in system Python:

  F:/sandbox/sulphur-2/ComfyUI/venv/Scripts/python.exe tools/comfy_cutout.py <png>...

  --out DIR     where to write (default alongside, as <name>.cut.png)
  --size N      long edge in px (default 320; 0 keeps full resolution)
  --pad N       transparent margin in px after cropping (default 6)
  --contact     also write a magenta-backed proof sheet for eyeballing edges

The halo/despeckle logic mirrors tools/clean_building_edges.py, which solves
the same problem for the importer's near-white keying.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ALPHA_FLOOR = 30  # below this the feather tail is noise, not art


def _rembg_rgba(src: Path) -> Image.Image:
    try:
        from rembg import new_session, remove
    except ModuleNotFoundError:
        sys.exit(
            "rembg not importable. Run this with the ComfyUI venv interpreter:\n"
            "  F:/sandbox/sulphur-2/ComfyUI/venv/Scripts/python.exe tools/comfy_cutout.py ..."
        )
    global _SESSION
    try:
        _SESSION
    except NameError:
        _SESSION = new_session("u2net")
    return remove(Image.open(src).convert("RGBA"), session=_SESSION).convert("RGBA")


def _kill_halo(a: np.ndarray) -> np.ndarray:
    """Drop the light grey matte fringe; leave saturated art (warm windows) alone."""
    al = a[:, :, 3].astype(np.int16)
    rgb = a[:, :, :3].astype(np.int16)
    mx = rgb.max(2)
    mn = rgb.min(2)
    halo = (al > 8) & (al < 235) & (mx > 120) & (mx - mn < 46)
    a[halo, 3] = 0
    a[a[:, :, 3] < ALPHA_FLOOR, 3] = 0
    return a


def _fix_colour_bleed(a: np.ndarray, rounds: int = 3) -> np.ndarray:
    """Replace edge-pixel RGB with the alpha-weighted colour of solid neighbours.

    Partial-alpha pixels still carry the backdrop blended into their RGB. Left
    alone they ring grey over dark UI. Pushing interior colour outward is the
    standard premultiplied-alpha fix and is what lets one sprite sit on the
    day plate and the night plate without a visible seam.
    """
    al = a[:, :, 3].astype(np.float32) / 255.0
    rgb = a[:, :, :3].astype(np.float32)
    edge = (al > 0) & (al < 0.98)
    if not edge.any():
        return a
    for _ in range(rounds):
        w = ndimage.uniform_filter(al, size=3)
        num = np.stack([ndimage.uniform_filter(rgb[:, :, c] * al, size=3) for c in range(3)], axis=2)
        safe = w > 1e-4
        blended = np.zeros_like(rgb)
        for c in range(3):
            blended[:, :, c] = np.where(safe, num[:, :, c] / np.maximum(w, 1e-4), rgb[:, :, c])
        rgb[edge] = blended[edge]
    a[:, :, :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return a


# NOTE — a "_drop_backdrop_slabs" pass was written here and REMOVED. The idea
# was to detect the wall-and-floor slabs rembg keeps when a render has a
# structured background, by finding border-touching regions of near-uniform
# colour. It found nothing: those backdrops are PAINTED, so their local
# variance is nowhere near flat enough to threshold against, and the recut
# output was pixel-identical. A render containing a painted wall cannot be
# reliably rescued in post — the fix is the BACKDROP clause in the prompt,
# which asks for a flat featureless field so there is no wall to keep.

def _drop_floating_islands(a: np.ndarray, gap: int = 14) -> np.ndarray:
    """Delete painted objects floating detached from the building.

    The dock render contains a slab of rock hanging in the sky above the
    jetty — the MODEL painted it; it is not background, so no amount of
    background removal touches it. It survived _despeckle because that only
    drops islands under 0.4% of the sprite and this one is 10%.

    The right rule is proximity, not size: a building sprite is one connected
    mass sitting on its plinth, so anything separated from the main body by a
    clear gap is an artefact. Dilating by `gap` first means genuinely attached
    detail (a hanging sign, a lantern on a bracket) merges with the body and
    is kept.

    Three earlier attempts failed before this one — a flatness test, a
    border-colour flood, and the size-based despeckle — all because they
    assumed the debris was BACKGROUND. It is foreground in the wrong place.
    """
    solid = a[:, :, 3] > 128
    if solid.sum() < 100:
        return a
    joined = ndimage.binary_dilation(solid, iterations=gap)
    lbl, n = ndimage.label(joined)
    if n <= 1:
        return a
    sizes = ndimage.sum(solid, lbl, range(1, n + 1))
    main = int(np.argmax(sizes)) + 1
    a[solid & (lbl != main), 3] = 0
    return a


def _despeckle(a: np.ndarray) -> np.ndarray:
    mask = a[:, :, 3] > 20
    lbl, n = ndimage.label(mask)
    if n > 1:
        sizes = ndimage.sum(mask, lbl, range(1, n + 1))
        keep = np.isin(lbl, list(np.where(sizes >= sizes.max() * 0.004)[0] + 1))
        a[~keep, 3] = 0
    return a


def _autocrop(im: Image.Image, pad: int) -> Image.Image:
    a = np.asarray(im)
    ys, xs = np.where(a[:, :, 3] > 16)
    if len(xs) == 0:
        return im
    x0, x1 = int(xs.min()), int(xs.max()) + 1
    y0, y1 = int(ys.min()), int(ys.max()) + 1
    im = im.crop((x0, y0, x1, y1))
    if pad > 0:
        out = Image.new("RGBA", (im.width + pad * 2, im.height + pad * 2), (0, 0, 0, 0))
        out.paste(im, (pad, pad))
        im = out
    return im


def cutout(src: Path, size: int, pad: int) -> tuple[Image.Image, dict]:
    im = _rembg_rgba(src)
    a = np.asarray(im).copy()
    a = _kill_halo(a)
    a = _fix_colour_bleed(a)
    a = _drop_floating_islands(a)
    a = _despeckle(a)
    im = _autocrop(Image.fromarray(a), pad)
    if size > 0 and max(im.size) != size:
        scale = size / max(im.size)
        im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    arr = np.asarray(im)
    al = arr[:, :, 3]
    stats = {
        "size": f"{im.width}x{im.height}",
        "opaque_frac": round(float((al > 200).mean()), 3),
        "fringe_frac": round(float(((al > 10) & (al < 245)).mean()), 4),
        "corners": [int(al[0, 0]), int(al[0, -1]), int(al[-1, 0]), int(al[-1, -1])],
    }
    return im, stats


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("paths", nargs="+")
    ap.add_argument("--out", default=None, help="output directory (default: alongside the source)")
    ap.add_argument("--size", type=int, default=320, help="long edge in px; 0 = keep full res")
    ap.add_argument("--pad", type=int, default=6)
    ap.add_argument("--contact", action="store_true", help="also write a magenta-backed proof sheet")
    args = ap.parse_args()

    outdir = Path(args.out) if args.out else None
    if outdir:
        outdir.mkdir(parents=True, exist_ok=True)

    done: list[tuple[str, Image.Image]] = []
    for p in args.paths:
        src = Path(p)
        if not src.exists():
            print(f"missing: {src}")
            continue
        im, stats = cutout(src, args.size, args.pad)
        dest = (outdir / f"{src.stem}.png") if outdir else src.with_suffix(".cut.png")
        im.save(dest)
        ok = max(stats["corners"]) == 0
        print(f"{src.name} -> {dest.name}  {stats['size']}  opaque {stats['opaque_frac']}  "
              f"fringe {stats['fringe_frac']}  corners {'clear' if ok else stats['corners']}")
        if not ok:
            print("  WARNING: a corner is not transparent — check the source backdrop")
        done.append((src.stem, im))

    if args.contact and done:
        cols = min(4, len(done))
        rows = (len(done) + cols - 1) // cols
        cell = max(max(im.size) for _, im in done) + 16
        sheet = Image.new("RGBA", (cols * cell, rows * cell), (255, 0, 255, 255))
        for i, (_, im) in enumerate(done):
            x = (i % cols) * cell + (cell - im.width) // 2
            y = (i // cols) * cell + (cell - im.height) // 2
            sheet.alpha_composite(im, (x, y))
        dest = (outdir or Path(args.paths[0]).parent) / "cutout_proof.png"
        sheet.convert("RGB").save(dest)
        print(f"proof sheet: {dest}")


if __name__ == "__main__":
    main()
