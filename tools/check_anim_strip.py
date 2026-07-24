"""Validate an animation sprite strip against docs/animation-art-spec.md.

Checks the rules that actually get broken: a real alpha channel, a genuinely
transparent background (not black/white), exact expected dimensions, width evenly
divisible by the frame count, no blank frames, a plausible seamless loop, and no
embedded text/labels (the "picture OF the asset" failure).

Usage:
  python tools/check_anim_strip.py public/art/fx_wave_swell_a.png
  python tools/check_anim_strip.py public/art/*.png
  python tools/check_anim_strip.py some/file.png --frames 10   # override frame count

Exit code 0 = every file passed, 1 = something failed.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from PIL import Image

# id -> (frames, frame_w, frame_h) straight from the spec table
SPEC: dict[str, tuple[int, int, int]] = {
    "fx_wave_swell_a": (10, 256, 64),
    "fx_wave_swell_b": (10, 256, 48),
    "fx_wave_foam_wash": (10, 192, 56),
    "fx_wave_lap": (8, 128, 40),
    "fx_wave_cap": (6, 64, 32),
    "fx_flame_hearth": (7, 48, 64),
    "fx_lantern_string": (7, 96, 32),
    "fx_moon_shimmer": (8, 192, 48),
}

OK = "PASS"
NO = "FAIL"
WARN = "WARN"


def check(path: Path, frames_override: int | None = None) -> bool:
    print(f"\n=== {path.name} ===")
    try:
        im = Image.open(path)
    except Exception as e:  # unreadable
        print(f"  {NO}  cannot open: {e}")
        return False

    spec = SPEC.get(path.stem)
    frames = frames_override or (spec[0] if spec else None)
    ok = True

    # --- alpha channel present -------------------------------------------------
    if im.mode != "RGBA":
        print(f"  {NO}  no alpha channel (mode={im.mode}) — save as RGBA PNG")
        ok = False
    a = np.asarray(im.convert("RGBA"))
    al = a[:, :, 3]
    w, h = im.size

    # --- background actually transparent --------------------------------------
    transparent = int((al == 0).sum())
    if transparent == 0:
        print(f"  {NO}  background is fully opaque — it must be transparent, not black/white")
        ok = False
    else:
        print(f"  {OK}  has transparency ({transparent / al.size:.0%} of pixels are clear)")

    # --- dimensions ------------------------------------------------------------
    if spec:
        n, fw, fh = spec
        want = (n * fw, fh)
        if (w, h) == want:
            print(f"  {OK}  size {w}x{h} matches spec")
        else:
            print(f"  {NO}  size {w}x{h} — spec wants {want[0]}x{want[1]} ({n} frames of {fw}x{fh})")
            ok = False
    else:
        print(f"  {WARN} '{path.stem}' is not in the spec table; skipping exact-size check")

    # --- frame divisibility ----------------------------------------------------
    if frames:
        if w % frames:
            print(f"  {NO}  width {w} is not divisible by {frames} frames ({w / frames:.2f} px each)")
            ok = False
        else:
            fw_actual = w // frames
            print(f"  {OK}  {frames} frames of {fw_actual}x{h}")

            # --- blank frames + loop check ---------------------------------
            cells = [a[:, i * fw_actual : (i + 1) * fw_actual, :] for i in range(frames)]
            blanks = [i + 1 for i, c in enumerate(cells) if (c[:, :, 3] > 8).sum() < 0.005 * c[:, :, 3].size]
            if blanks:
                print(f"  {NO}  blank/near-empty frame(s): {blanks} — no padding frames allowed")
                ok = False
            else:
                print(f"  {OK}  no blank frames")

            def diff(x: np.ndarray, y: np.ndarray) -> float:
                fx = x[:, :, :3].astype(float) * (x[:, :, 3:4] / 255.0)
                fy = y[:, :, :3].astype(float) * (y[:, :, 3:4] / 255.0)
                return float(np.abs(fx - fy).mean())

            steps = [diff(cells[i], cells[i + 1]) for i in range(frames - 1)]
            wrap = diff(cells[-1], cells[0])
            avg = sum(steps) / max(1, len(steps))
            if avg > 0 and wrap > avg * 2.2:
                print(
                    f"  {WARN} likely LOOP JUMP: frame {frames}->1 differs {wrap:.1f} vs {avg:.1f} avg "
                    "between frames — the cycle probably doesn't close"
                )
            else:
                print(f"  {OK}  loop closes cleanly (wrap {wrap:.1f} vs {avg:.1f} avg step)")

            if avg < 0.5:
                print(f"  {WARN} frames barely differ (avg {avg:.2f}) — is it actually animating?")

    # --- embedded text / label furniture ---------------------------------------
    # Text is small, high-contrast, near-neutral and clustered in horizontal bands.
    rgb = a[:, :, :3].astype(int)
    mx, mn = rgb.max(2), rgb.min(2)
    bright_neutral = (al > 60) & (mn > 170) & ((mx - mn) < 40)
    band = bright_neutral.mean(1)  # fraction per row
    texty_rows = int(((band > 0.002) & (band < 0.12)).sum())
    if h >= 120 and texty_rows > h * 0.05:
        print(f"  {WARN} possible embedded text/labels ({texty_rows} suspicious rows) — the file must contain ONLY frames")

    # a strip should be wide and short; a tall image is usually a mockup sheet
    if h > 0 and w / h < 4:
        print(f"  {WARN} aspect {w}x{h} is not strip-like — is this a presentation sheet rather than the asset?")

    print(f"  --> {'PASSED' if ok else 'FAILED'}")
    return ok


def main() -> None:
    argv = sys.argv[1:]
    frames = None
    args: list[str] = []
    i = 0
    while i < len(argv):
        if argv[i] == "--frames" and i + 1 < len(argv):
            frames = int(argv[i + 1])
            i += 2
            continue
        if not argv[i].startswith("--"):
            args.append(argv[i])
        i += 1
    if not args:
        print(__doc__)
        sys.exit(0)
    results = [check(Path(p), frames) for p in args]
    print(f"\n{sum(results)}/{len(results)} passed")
    sys.exit(0 if all(results) else 1)


if __name__ == "__main__":
    main()
