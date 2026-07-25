"""Align each `<art>_<phase>` sprite to its base sprite so day/dusk/night frames
share pixel registration. The painted phase half-sheets exported with a few px
of drift (dusk frames systematically ~12px high, some night frames offset), so
the map-view crossfade drew the base ghosting through the overlay as a
'double/shadow'. We find the integer translation that best aligns each overlay's
solid silhouette to the base via FFT cross-correlation (robust to lit windows /
glow halos, unlike centre-of-mass), then re-paste the overlay at that offset
with transparent fill. Idempotent. Pass --apply to write; default is dry-run."""
import glob, os, sys
import numpy as np
from PIL import Image

ART = "public/art"
THRESH = 200      # alpha >= => 'solid body'
MAX_SHIFT = 26    # clamp / reject wild correlations
MIN_SHIFT = 2     # skip sub-2px noise
APPLY = "--apply" in sys.argv

def mask(path):
    a = np.asarray(Image.open(path).convert("RGBA"))[:, :, 3]
    return (a >= THRESH).astype(np.float64), a.shape

def best_shift(mb, mo):
    # circular cross-correlation via FFT; peak = (dy,dx) aligning overlay to base
    F = np.fft.rfft2(mb) * np.conj(np.fft.rfft2(mo))
    c = np.fft.irfft2(F, s=mb.shape)
    dy, dx = np.unravel_index(np.argmax(c), c.shape)
    h, w = mb.shape
    if dy > h // 2: dy -= h
    if dx > w // 2: dx -= w
    return int(dx), int(dy)

bases = set()
for f in glob.glob(f"{ART}/*.png"):
    n = os.path.basename(f)[:-4]
    for s in ("_dawn", "_dusk", "_night"):
        if n.endswith(s): bases.add(n[:-len(s)])

changed = rejected = 0
for b in sorted(bases):
    bp = f"{ART}/{b}.png"
    if not os.path.exists(bp): continue
    mb, sb = mask(bp)
    if mb.sum() == 0: continue
    for s in ("_dawn", "_dusk", "_night"):
        p = f"{ART}/{b}{s}.png"
        if not os.path.exists(p): continue
        mo, so = mask(p)
        if mo.sum() == 0 or so != sb: continue
        dx, dy = best_shift(mb, mo)
        if abs(dx) > MAX_SHIFT or abs(dy) > MAX_SHIFT:
            print(f"  REJECT {b}{s} dx={dx} dy={dy} (>MAX)"); rejected += 1; continue
        if abs(dx) < MIN_SHIFT and abs(dy) < MIN_SHIFT: continue
        print(f"{b}{s:8} dx={dx:+d} dy={dy:+d}")
        changed += 1
        if APPLY:
            im = Image.open(p).convert("RGBA")
            out = Image.new("RGBA", im.size, (0, 0, 0, 0))
            out.paste(im, (dx, dy)); out.save(p)
print(f"\n{changed} to re-register, {rejected} rejected  ({'APPLIED' if APPLY else 'dry-run'})")
