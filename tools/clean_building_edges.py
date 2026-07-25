"""Universal edge cleanup for the map building sprites. The importer keys against
a near-white background and feathers the alpha, which leaves (a) a light/grey
matte halo the near-white defringe misses, and (b) a faint feather tail + stray
keyed crumbs — worst on the dark NIGHT variants. Two colour-safe passes that
never erode solid art:
  1) drop semi-transparent, low-saturation light/grey halo pixels (not warm glow),
  2) drop the faint feather tail (alpha below a floor) on ANY colour,
then despeckle disconnected crumbs. Applied identically to a building's base and
all phase variants, so relative registration is preserved.
Writes <name>.clean.png for review; pass --apply to overwrite in place."""
import sys, glob, os
import numpy as np
from PIL import Image
from scipy import ndimage

ALPHA_FLOOR = 30

def clean(path, apply=False):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).copy()
    al = a[:, :, 3].astype(np.int16)
    rgb = a[:, :, :3].astype(np.int16)
    mx = rgb.max(2); mn = rgb.min(2)
    # 1) light/grey matte halo — semi-transparent, light-ish, low saturation
    #    (warm lit windows are saturated → mx-mn large → left alone)
    halo = (al > 8) & (al < 235) & (mx > 120) & (mx - mn < 46)
    a[halo, 3] = 0
    # 2) the feather's faint tail, any colour
    a[a[:, :, 3] < ALPHA_FLOOR, 3] = 0
    # 3) despeckle — drop keyed islands far smaller than the sprite body
    mask = a[:, :, 3] > 20
    lbl, n = ndimage.label(mask)
    if n > 1:
        sizes = ndimage.sum(mask, lbl, range(1, n + 1))
        keep = np.isin(lbl, list(np.where(sizes >= sizes.max() * 0.004)[0] + 1))
        a[~keep, 3] = 0
    out = path if apply else path + ".clean.png"
    Image.fromarray(a).save(out)

if __name__ == "__main__":
    apply = "--apply" in sys.argv
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    files = args or sorted(glob.glob("public/art/town_*.png")) + sorted(glob.glob("public/art/prop_lighthouse*.png")) + sorted(glob.glob("public/art/prop_well*.png"))
    for f in files:
        clean(f, apply)
    print(f"{'applied' if apply else 'previewed'} {len(files)} sprites")
