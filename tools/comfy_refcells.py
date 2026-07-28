"""
Cut Canny reference cells for ANY building from the artist's matrix sheets.

The dial-in rig pins structure with a Canny edge map taken from the artist's
own reference cell — which is why the forge's five states genuinely grow.
Until now only the forge had cells, so every test was one building. This cuts
the same five cells for any sheet in `Full Building Final/`, which is what
lets the locked recipe be tested across the catalogue.

Reuses the production importer's grid detection and keying
(tools/import_map_v2.py: sprite_grid / key_bg / match_building) rather than
re-deriving them — those already handle the banner row, the phase-icon
gutter, and interior whites like lit windows.

Per the worksheet's cell recipe: take the MIDDAY row, key the background,
composite on white, pad ~35%, and resize so the long edge is 1024 on an /8
grid (SDXL latents are /8; an off-grid cell gets rescaled and the structure
lock loosens).

  python tools/comfy_refcells.py --list
  python tools/comfy_refcells.py Bakery Quarry AnimalShelter
  python tools/comfy_refcells.py --all
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "tools"))

from import_map_v2 import (  # noqa: E402 — repo tool, path set above
    DEFAULT_PHASES,
    ROW_PHASES,
    SKIP_STEMS,
    STATE_ORDER,
    key_bg,
    match_building,
    sprite_grid,
)

SHEETS = Path(r"C:\Users\illum\OneDrive\Desktop\Hearth\Graphics and UI\Core\Map\Full Building Final")
OUT = REPO / "tools" / "comfy_out" / "refcells_canny"
PAD_FRAC = 0.35
LONG_EDGE = 1024


def to8(v: int) -> int:
    return max(8, int(round(v / 8)) * 8)


def cell_to_ref(cell: Image.Image) -> Image.Image:
    """Keyed sprite -> white-matted, padded, /8-grid reference cell."""
    keyed = key_bg(cell)
    bbox = keyed.getchannel("A").getbbox()
    if bbox:
        keyed = keyed.crop(bbox)
    pad_x = int(keyed.width * PAD_FRAC / 2)
    pad_y = int(keyed.height * PAD_FRAC / 2)
    canvas = Image.new("RGBA", (keyed.width + pad_x * 2, keyed.height + pad_y * 2), (255, 255, 255, 255))
    canvas.alpha_composite(keyed, (pad_x, pad_y))
    flat = Image.new("RGB", canvas.size, (255, 255, 255))
    flat.paste(canvas, mask=canvas.getchannel("A"))
    scale = LONG_EDGE / max(flat.size)
    return flat.resize((to8(round(flat.width * scale)), to8(round(flat.height * scale))), Image.LANCZOS)


def extract(stem: str) -> dict[str, tuple[int, int]] | None:
    path = SHEETS / f"{stem}.png"
    if not path.exists():
        matches = [p for p in SHEETS.glob("*.png") if p.stem.lower().replace(" ", "") == stem.lower().replace(" ", "")]
        if not matches:
            print(f"  no sheet named {stem}")
            return None
        path = matches[0]
    if path.stem.lower() in SKIP_STEMS:
        print(f"  {path.stem}: on the importer's skip list")
        return None

    building = match_building(path.stem)
    if not building:
        print(f"  {path.stem}: importer can't map this to a building id")
        return None

    phases = ROW_PHASES.get(path.stem.lower().replace(" ", ""), DEFAULT_PHASES)
    im = Image.open(path).convert("RGBA")
    rows, cols = sprite_grid(im, len(phases))
    if len(cols) != 5 or len(rows) != len(phases):
        print(f"  {path.stem}: grid detection gave {len(rows)} rows x {len(cols)} cols (want {len(phases)}x5) — skipped")
        return None
    if "midday" not in phases:
        print(f"  {path.stem}: sheet has no midday row ({phases}) — skipped")
        return None

    y0, y1 = rows[phases.index("midday")]
    sizes: dict[str, tuple[int, int]] = {}
    OUT.mkdir(parents=True, exist_ok=True)
    for state, (x0, x1) in zip(STATE_ORDER, cols):
        ref = cell_to_ref(im.crop((x0, y0, x1, y1)))
        dest = OUT / f"{building}_ref_{state}.png"
        ref.save(dest)
        sizes[state] = ref.size
    print(f"  {path.stem} -> {building}: " + "  ".join(f"{s} {w}x{h}" for s, (w, h) in sizes.items()))
    return sizes


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("stems", nargs="*", help="sheet names, e.g. Bakery Quarry AnimalShelter")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    if args.list:
        for p in sorted(SHEETS.glob("*.png")):
            print(f"  {p.stem:20s} -> {match_building(p.stem)}")
        return

    stems = [p.stem for p in sorted(SHEETS.glob("*.png"))] if args.all else args.stems
    if not stems:
        raise SystemExit("Name sheets to extract, or pass --all / --list.")
    ok = 0
    for stem in stems:
        if extract(stem):
            ok += 1
    print(f"\n{ok}/{len(stems)} sheets extracted into {OUT}")


if __name__ == "__main__":
    main()
