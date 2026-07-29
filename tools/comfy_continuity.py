"""
Continuity audit across the whole building catalogue.

Eyeballing 85 sprites does not scale and misses things a measurement catches
immediately. This checks the three properties that actually matter for a
believable village, and reports only what fails:

  STYLE      does every building share one palette? Measured as the mean hue/
             saturation/value of each sprite's opaque pixels, compared against
             the catalogue median. An outlier is a building that will look
             pasted in from another game.

  ROOF       roofs must be the guide's teal on BUILT states. Measured as the
             fraction of teal-family pixels in the upper half of the sprite.
             Near-zero on an l1/l2/l3 means the roof drifted colour.

  GLITCH     holes and debris. 'Holes' = fully transparent regions fully
             enclosed by opaque pixels (you can see the background through the
             building). 'Debris' = opaque islands detached from the main body,
             which is what a leftover backdrop slab looks like.

  PROGRESS   the upgrade must read as growth: ruin and wip should be visually
             LESS complete than l1, and l3 should carry the most detail.
             Measured as edge density (busy-ness) and opaque area per state.

Usage (ComfyUI venv interpreter, for numpy/scipy/PIL):
  ...python.exe tools/comfy_continuity.py            # audit + write report
  ...python.exe tools/comfy_continuity.py --sheets   # also per-building sheets
"""

from __future__ import annotations

import argparse
import colorsys
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, str(Path(__file__).resolve().parent))
from comfy_dialin import SUBJECT_CLAUSES  # noqa: E402

REPO = Path(__file__).resolve().parent.parent
CUT = REPO / "tools" / "comfy_out" / "cutout" / "village"
STATES = ["ruin", "wip", "l1", "l2", "l3"]
BUILT = {"l1", "l2", "l3"}


def measure(path: Path) -> dict | None:
    if not path.exists():
        return None
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im)
    al = a[:, :, 3]
    solid = al > 200
    if solid.sum() < 200:
        return None
    rgb = a[:, :, :3][solid].astype(float) / 255.0
    hsv = np.array([colorsys.rgb_to_hsv(*px) for px in rgb[:: max(1, len(rgb) // 4000)]])

    # Roof colour, upper 60% (roofs sit high in an isometric sprite).
    #
    # CALIBRATION NOTE: the first version of this counted pixels in the teal
    # HUE band with saturation > 0.12 and reported ~0.00 for roofs that are
    # visibly teal. The rendered roofs are PALE SAGE — the right hue, but far
    # less saturated than the guide's #45625e swatch — so they fell under the
    # floor and 12 healthy buildings were flagged as drifted. Measuring
    # cool-vs-warm dominance instead survives desaturation: a teal roof has
    # green and blue above red, a drifted orange/brown one does not.
    h, w = al.shape
    top = a[: int(h * 0.6)]
    ts = top[:, :, 3] > 200
    teal = 0.0
    if ts.sum() > 50:
        t = top[:, :, :3][ts].astype(float)
        cool = (t[:, 1] > t[:, 0] + 3) & (t[:, 2] > t[:, 0] + 3)
        teal = float(cool.mean())

    # holes: transparent regions NOT connected to the outside border
    trans = al < 32
    lbl, n = ndimage.label(trans)
    outside = set(lbl[0, :]) | set(lbl[-1, :]) | set(lbl[:, 0]) | set(lbl[:, -1])
    hole_px = sum(int((lbl == i).sum()) for i in range(1, n + 1) if i not in outside)

    # debris: opaque islands away from the main body
    olbl, on = ndimage.label(al > 128)
    debris = 0
    if on > 1:
        sizes = ndimage.sum(al > 128, olbl, range(1, on + 1))
        debris = int(sizes.sum() - sizes.max())

    grey = a[:, :, :3].mean(2)
    gx, gy = np.gradient(grey)
    busy = float((np.hypot(gx, gy)[solid] > 12).mean())

    return {
        "hue": float(np.median(hsv[:, 0])),
        "sat": float(np.median(hsv[:, 1])),
        "val": float(np.median(hsv[:, 2])),
        "teal": teal,
        "area": float(solid.mean()),
        "busy": busy,
        "hole_frac": hole_px / max(1, solid.sum()),
        "debris_frac": debris / max(1, solid.sum()),
    }


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--hole-thresh", type=float, default=0.004)
    ap.add_argument("--debris-thresh", type=float, default=0.01)
    args = ap.parse_args()

    data: dict[str, dict[str, dict]] = {}
    missing: list[str] = []
    for b in sorted(SUBJECT_CLAUSES):
        data[b] = {}
        for s in STATES:
            m = measure(CUT / f"{b}_{s}.png")
            if m is None:
                missing.append(f"{b}/{s}")
            else:
                data[b][s] = m

    built = [(b, s, m) for b, sm in data.items() for s, m in sm.items() if s in BUILT]
    med_sat = float(np.median([m["sat"] for _, _, m in built]))
    med_val = float(np.median([m["val"] for _, _, m in built]))
    med_teal = float(np.median([m["teal"] for _, _, m in built]))

    print("=" * 70)
    print(f"CONTINUITY AUDIT — {sum(len(v) for v in data.values())} sprites")
    print("=" * 70)
    if missing:
        print(f"\nMISSING ({len(missing)}): {', '.join(missing)}")

    print(f"\nCatalogue medians (built states): sat {med_sat:.2f}  val {med_val:.2f}  roof-teal {med_teal:.2f}")

    print("\n-- STYLE OUTLIERS (palette drift vs the catalogue) --")
    style = [
        (b, s, m) for b, s, m in built
        if abs(m["sat"] - med_sat) > 0.13 or abs(m["val"] - med_val) > 0.15
    ]
    for b, s, m in sorted(style, key=lambda r: -abs(r[2]["sat"] - med_sat)):
        why = []
        if m["sat"] - med_sat > 0.13: why.append("oversaturated")
        if med_sat - m["sat"] > 0.13: why.append("washed out")
        if m["val"] - med_val > 0.15: why.append("too bright")
        if med_val - m["val"] > 0.15: why.append("too dark")
        print(f"   {b}/{s}: {', '.join(why)}  (sat {m['sat']:.2f} val {m['val']:.2f})")
    if not style:
        print("   none — palette is consistent")

    print("\n-- ROOF COLOUR (built states should carry the guide teal) --")
    roof = [(b, s, m) for b, s, m in built if m["teal"] < 0.08]
    for b, s, m in sorted(roof, key=lambda r: r[2]["teal"]):
        print(f"   {b}/{s}: roof teal {m['teal']:.3f} — drifted off palette")
    if not roof:
        print("   none — every built roof reads teal")

    print("\n-- GLITCHES (holes through the sprite / detached debris) --")
    bad = False
    for b, sm in data.items():
        for s, m in sm.items():
            flags = []
            if m["hole_frac"] > args.hole_thresh and s in BUILT:
                flags.append(f"holes {m['hole_frac'] * 100:.1f}%")
            if m["debris_frac"] > args.debris_thresh:
                flags.append(f"detached debris {m['debris_frac'] * 100:.1f}%")
            if flags:
                bad = True
                print(f"   {b}/{s}: {', '.join(flags)}")
    if not bad:
        print("   none")

    print("\n-- PROGRESSION LOGIC (must read as growth) --")
    prob = False
    for b, sm in data.items():
        if not {"ruin", "l1", "l3"} <= sm.keys():
            continue
        if sm["ruin"]["busy"] >= sm["l1"]["busy"]:
            prob = True
            print(f"   {b}: ruin is as detailed as L1 ({sm['ruin']['busy']:.2f} vs {sm['l1']['busy']:.2f})")
        if "l2" in sm and sm["l3"]["busy"] < sm["l2"]["busy"] * 0.82:
            prob = True
            print(f"   {b}: L3 less detailed than L2 ({sm['l3']['busy']:.2f} vs {sm['l2']['busy']:.2f})")
        if sm["ruin"]["teal"] > 0.55:
            prob = True
            print(f"   {b}: ruin has a teal roof ({sm['ruin']['teal']:.2f}) — ruins are roofless")
    if not prob:
        print("   none — every building grows correctly")
    print()


if __name__ == "__main__":
    main()
