"""Clean the white/grey matte crumbs the water-build key leaves on the fisher
hut sprites (worst on the night variants — a halo of light speckles). Two gentle
passes that never fragment the art:
  1) clear semi-transparent light, low-saturation (white/grey/tan) halo pixels
     — the matte fringe; warm window glow (saturated) is left alone,
  2) despeckle: drop keyed islands far smaller than the sprite (the loose crumbs).
No erosion / feather clamp (that shattered the dim night art). Idempotent.
Writes <name>.clean.png for review; pass --apply to overwrite in place."""
import sys, glob
import numpy as np
from PIL import Image
from scipy import ndimage

def clean(path, apply=False):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im).copy()
    al = a[:, :, 3].astype(np.int16)
    rgb = a[:, :, :3].astype(np.int16)
    mx = rgb.max(2); mn = rgb.min(2)
    # 1) matte halo: semi-transparent AND light AND low-saturation (not warm glow)
    halo = (al > 8) & (al < 235) & (mx > 145) & (mx - mn < 48)
    a[halo, 3] = 0
    # 2) despeckle — keep only islands >= 0.5% of the largest (loose crumbs go)
    mask = a[:, :, 3] > 24
    lbl, n = ndimage.label(mask)
    if n > 1:
        sizes = ndimage.sum(mask, lbl, range(1, n + 1))
        keep = np.isin(lbl, list(np.where(sizes >= sizes.max() * 0.005)[0] + 1))
        a[~keep, 3] = 0
    out = path if apply else path + ".clean.png"
    Image.fromarray(a).save(out)
    return out

if __name__ == "__main__":
    apply = "--apply" in sys.argv
    files = [x for x in sys.argv[1:] if not x.startswith("--")] or sorted(glob.glob("public/art/town_fisherhut*.png"))
    for f in files:
        clean(f, apply)
    print(f"{'applied' if apply else 'previewed'} {len(files)} sprites")
