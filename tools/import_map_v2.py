"""Map V2 importer — brings the new painted world into the game.

Two jobs, both reading from the in-repo `art-src/` sources (the user's finals,
committed so this can run in the sandbox):

1. PLATES: the four time-of-day island paintings in one 2x2 sheet
     art-src/Map times of dayFinal.png  (dawn | midday / dusk | night)
   -> public/art/ map_island_plate.png (midday base) + _dawn/_dusk/_night.
   The baked-in DAWN/MIDDAY/... corner labels are patched out with clean sky.

2. BUILDINGS: each art-src/buildings/*.png is a MATRIX, not a single sprite:
     columns = RUINS | UNDER CONSTRUCTION | LEVEL 1 | LEVEL 2 | LEVEL 3
     rows    = DAWN / MIDDAY / DUSK / NIGHT  (Library is split A=dawn,midday
                                              B=dusk,night across two files)
   The sheet is auto-gridded (projection of a near-white-background mask), each
   cell is border-flood keyed to transparency (interior whites — flags, lit
   windows — are preserved), and all phase variants of one state are cropped to
   a shared canvas so the engine's crossfade stays pixel-registered. Ids land as
     town_<name>_ruin -> _wip -> (base = L1) -> _l2 -> _l3
   with optional _dawn/_dusk/_night per state (midday = the bare id).

Usage:
  python tools/import_map_v2.py --dry-run     # report what WOULD happen
  python tools/import_map_v2.py               # import + rewrite the manifest
  python tools/import_map_v2.py --check       # also write a verification sheet
  python tools/import_map_v2.py --manifest-only   # just resync the manifest

The manifest (src/art-manifest.ts) is regenerated from the public/art directory
listing — ground truth on disk — so this and slice_assets.py can run in any order.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

REPO = Path(__file__).resolve().parent.parent
ART = REPO / "public" / "art"
TS_MANIFEST = REPO / "src" / "art-manifest.ts"

# ---- source locations (in-repo, committed) ----------------------------------
SRC = REPO / "art-src"
PLATE_SHEET = SRC / "Map times of dayFinal.png"  # 2x2 quadrant sheet
BUILDINGS_DIR = SRC / "buildings"
PLATE_MAX_W = 2048

# quadrant order of the sheet (row-major): dawn | midday / dusk | night
SHEET_ORDER = ["dawn", "midday", "dusk", "night"]
PLATE_ID = {
    "midday": "map_island_plate",
    "dawn": "map_island_plate_dawn",
    "dusk": "map_island_plate_dusk",
    "night": "map_island_plate_night",
}

# ---- naming: canonical building -> game id prefix ---------------------------
CANON: dict[str, str] = {
    "cottage": "town_cottage", "bakery": "town_bakery", "market": "town_market",
    "garden": "town_garden", "townhall": "town_townhall", "workshop": "town_workshop",
    "farm": "town_farm", "fisherhut": "town_fisherhut", "sawmill": "town_sawmill",
    "blacksmith": "town_blacksmith", "dock": "town_dock", "library": "town_library",
    "well": "prop_well", "sign": "prop_sign", "lighthouse": "prop_lighthouse",
}
ALIASES: dict[str, str] = {
    "church": "townhall", "chapel": "townhall", "hall": "townhall",
    "windmill": "sawmill", "mill": "sawmill",
    "greenhouse": "garden", "glasshouse": "garden", "gardens": "garden",
    "pier": "dock", "jetty": "dock", "docks": "dock", "harbor": "dock", "harbour": "dock",
    "hut": "fisherhut", "fisher": "fisherhut", "fishershut": "fisherhut", "fishinghut": "fisherhut",
    "forge": "blacksmith", "smith": "blacksmith", "smithy": "blacksmith",
    "house": "cottage", "home": "cottage",
    "shop": "workshop", "noticeboard": "sign", "notice": "sign", "board": "sign",
    "wishingwell": "well", "meadowfarm": "farm", "meadow": "farm",
}

STATE_ORDER = ["ruin", "wip", "l1", "l2", "l3"]
STATE_SUFFIX = {"ruin": "_ruin", "wip": "_wip", "l1": "", "l2": "_l2", "l3": "_l3"}
DEFAULT_PHASES = ["dawn", "midday", "dusk", "night"]
PHASE_SUFFIX = {"midday": "", "dawn": "_dawn", "dusk": "_dusk", "night": "_night"}

# Per-file overrides: the Library shipped as two half-sheets, and the well
# shipped in two variants — well.png is the canonical one (well 2.png ignored).
ROW_PHASES: dict[str, list[str]] = {
    "librarya": ["dawn", "midday"],
    "libraryb": ["dusk", "night"],
    "lighthousea": ["dawn", "midday"],
    "lighthouseb": ["dusk", "night"],
}
SKIP_STEMS = {"well 2", "well2"}


def norm(stem: str) -> list[str]:
    return [t for t in re.split(r"[^a-z0-9]+", stem.lower()) if t]


def match_building(stem: str) -> str | None:
    joined = "".join(norm(stem))
    for name in sorted(list(CANON) + list(ALIASES), key=len, reverse=True):
        if name in joined:
            return ALIASES.get(name, name)
    return None


# ---- masks -------------------------------------------------------------------
def bg_mask(a: np.ndarray) -> np.ndarray:
    """Near-white / light-checker background of the source sheets."""
    mx = a.max(2); mn = a.min(2); sat = mx - mn
    return ((mx > 205) & (sat < 28)) | ((mn > 168) & (sat < 15))


def bands(proj: np.ndarray, frac: float, minlen: int) -> list[tuple[int, int]]:
    thr = proj.max() * frac
    on = proj > thr
    out: list[tuple[int, int]] = []
    start = None
    for i, v in enumerate(on):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start >= minlen:
                out.append((start, i))
            start = None
    if start is not None and len(on) - start >= minlen:
        out.append((start, len(on)))
    return out


# Fixed grid template for the standard 1536x1024 four-row sheets — cell
# boundaries (fraction of w/h) agreed on by every cleanly-detected sheet to
# within ~10px. Used when a sheet's own content bridges the gutters (the water
# builds — Dock, FishingHut — whose teal bases touch across columns).
STD_W, STD_H = 1536, 1024
COLS_FRAC = [0.062, 0.233, 0.418, 0.599, 0.786, 0.977]  # 6 edges -> 5 columns
ROWS4_FRAC = [0.096, 0.318, 0.523, 0.734, 0.962]        # 5 edges -> 4 rows


def template_grid(w: int, h: int) -> tuple[list[tuple[int, int]], list[tuple[int, int]]]:
    cols = [(round(COLS_FRAC[i] * w), round(COLS_FRAC[i + 1] * w)) for i in range(5)]
    rows = [(round(ROWS4_FRAC[j] * h), round(ROWS4_FRAC[j + 1] * h)) for j in range(4)]
    return rows, cols


def sprite_grid(im: Image.Image, want_rows: int) -> tuple[list[tuple[int, int]], list[tuple[int, int]]]:
    """Locate the sprite rows (phases) and columns (states) of a matrix sheet.
    The title banner + column-label header (short row-bands) and the phase-icon
    gutter (narrow first col-band) are dropped — sprite cells are the big bands.
    Falls back to the fixed template when a standard sheet's content bridges
    gutters and detection can't find 5 clean columns."""
    a = np.asarray(im.convert("RGB")).astype(np.int16)
    fg = ~bg_mask(a)
    h, w = fg.shape
    rowb = bands(fg.sum(1), 0.05, max(8, h // 60))
    colb = bands(fg.sum(0), 0.04, max(8, w // 60))
    rows = [(y0, y1) for y0, y1 in rowb if (y1 - y0) > h * 0.11]
    cols = [(x0, x1) for x0, x1 in colb if (x1 - x0) > w * 0.075]
    if len(cols) == 5 and len(rows) == want_rows:
        return rows, cols
    if abs(w - STD_W) < 48 and abs(h - STD_H) < 48 and want_rows == 4:
        return template_grid(w, h)
    return rows, cols


# ---- keying + crop -----------------------------------------------------------
def key_bg(im: Image.Image) -> Image.Image:
    """Flood the near-white background inward from the cell borders, so interior
    whites (flags, lit windows) survive. Soft-feather the resulting alpha edge."""
    rgb = np.asarray(im.convert("RGB")).astype(np.int16)
    white = bg_mask(rgb)
    lbl, _ = ndimage.label(white)
    border = set(lbl[0, :]) | set(lbl[-1, :]) | set(lbl[:, 0]) | set(lbl[:, -1])
    border.discard(0)
    bg = np.isin(lbl, list(border)) if border else np.zeros_like(white)
    rgba = np.asarray(im.convert("RGBA")).copy()
    rgba[bg, 3] = 0
    out = Image.fromarray(rgba, "RGBA")
    # feather: blur alpha a touch, keep colour — softens the flood's hard rim
    alpha = out.getchannel("A").filter(ImageFilter.GaussianBlur(0.7))
    out.putalpha(alpha)
    return out


def content_bbox(im: Image.Image, thr: int = 10) -> tuple[int, int, int, int] | None:
    a = np.asarray(im)[:, :, 3]
    ys, xs = np.where(a > thr)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def despeckle(im: Image.Image, min_area_frac: float = 0.002) -> Image.Image:
    """Drop stray keyed islands (dust, label crumbs) far smaller than the sprite."""
    a = np.asarray(im)[:, :, 3] > 24
    lbl, n = ndimage.label(a)
    if n <= 1:
        return im
    sizes = ndimage.sum(a, lbl, range(1, n + 1))
    keep = set(np.where(sizes >= sizes.max() * min_area_frac)[0] + 1)
    mask = np.isin(lbl, list(keep))
    rgba = np.asarray(im).copy()
    rgba[~mask, 3] = 0
    return Image.fromarray(rgba, "RGBA")


# ---- import ------------------------------------------------------------------
def patch_plate_label(q: Image.Image) -> Image.Image:
    """Cover the baked-in DAWN/MIDDAY/DUSK/NIGHT corner label with clean sky
    copied from just to its right (same gradient band, always island-free here)."""
    w, h = q.size
    lx0, ly0, lx1, ly1 = 0, 0, int(w * 0.24), int(h * 0.075)
    src_x = int(w * 0.30)
    patch = q.crop((src_x, ly0, src_x + (lx1 - lx0), ly1))
    q = q.copy()
    q.paste(patch, (lx0, ly0))
    return q


def import_plates(dry: bool, report: list[str]) -> None:
    if not PLATE_SHEET.exists():
        report.append(f"plates: not found at {PLATE_SHEET} — skipped")
        return
    sheet = Image.open(PLATE_SHEET).convert("RGB")
    w, h = sheet.width // 2, sheet.height // 2
    boxes = [(0, 0, w, h), (w, 0, sheet.width, h), (0, h, w, sheet.height), (w, h, sheet.width, sheet.height)]
    for phase, box in zip(SHEET_ORDER, boxes):
        q = patch_plate_label(sheet.crop(box))
        if q.width > PLATE_MAX_W:
            q = q.resize((PLATE_MAX_W, round(q.height * PLATE_MAX_W / q.width)), Image.LANCZOS)
        ident = PLATE_ID[phase]
        report.append(f"plate  {phase:7s} -> {ident}.png  ({q.width}x{q.height})")
        if not dry:
            q.save(ART / f"{ident}.png")


def import_buildings(dry: bool, report: list[str], coverage: dict[str, set[str]]) -> None:
    files = sorted(BUILDINGS_DIR.glob("*.png"))
    if not files:
        report.append(f"buildings: no PNGs under {BUILDINGS_DIR}")
        return
    for path in files:
        stem = path.stem
        if stem.lower() in SKIP_STEMS:
            report.append(f"  -- skip {path.name} (variant; using well.png)")
            continue
        building = match_building(stem)
        if building is None or building not in CANON:
            report.append(f"  ?? UNMATCHED {path.name} (tokens: {' '.join(norm(stem))})")
            continue
        im = Image.open(path).convert("RGB")
        want = ROW_PHASES.get(stem.lower().replace(" ", ""), DEFAULT_PHASES)
        rows, cols = sprite_grid(im, len(want))
        phases = want[: len(rows)]
        states = STATE_ORDER[: len(cols)]
        report.append(f"  {path.name:20s} {building:10s} grid {len(cols)}col x {len(rows)}row -> phases {phases}")
        if len(cols) != 5 or len(rows) != len(phases):
            report.append(f"     !! expected 5 states x {len(phases)} phases, got {len(cols)}x{len(rows)} — check the sheet")

        # per state column: key every phase row, then share one canvas so
        # the midday base and its _dawn/_dusk/_night overlays register exactly
        for ci, (x0, x1) in enumerate(cols):
            if ci >= len(states):
                break
            state = states[ci]
            keyed: list[tuple[str, Image.Image]] = []
            for ri, (y0, y1) in enumerate(rows):
                if ri >= len(phases):
                    break
                cell = im.crop((x0, y0, x1, y1))
                k = despeckle(key_bg(cell))
                bb = content_bbox(k)
                if bb is None:
                    continue
                keyed.append((phases[ri], k.crop(bb)))
            if not keyed:
                continue
            cw = max(k.width for _, k in keyed)
            ch = max(k.height for _, k in keyed)
            pad = int(max(cw, ch) * 0.04)
            CW, CH = cw + 2 * pad, ch + 2 * pad
            for ph, k in keyed:
                canvas = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
                canvas.paste(k, ((CW - k.width) // 2, (CH - k.height) // 2), k)
                ident = CANON[building] + STATE_SUFFIX[state] + PHASE_SUFFIX[ph]
                coverage.setdefault(building, set()).add(f"{state}/{ph}")
                if not dry:
                    canvas.save(ART / f"{ident}.png")


def rewrite_manifest() -> None:
    ids = sorted(p.stem for p in ART.glob("*.png"))
    body = (
        "// AUTO-GENERATED from public/art (tools/import_map_v2.py — do not edit by hand;\n"
        "// slice_assets.py crops into public/art, then this regenerates the listing).\n"
        "export const ART_IDS: ReadonlySet<string> = new Set([\n"
        + "".join(f"  '{i}',\n" for i in ids)
        + "]);\n\n"
        "export function artUrl(id: string): string | null {\n"
        "  return ART_IDS.has(id) ? `/art/${id}.png` : null;\n"
        "}\n"
    )
    TS_MANIFEST.write_text(body, encoding="utf-8")
    print(f"manifest: {len(ids)} ids -> {TS_MANIFEST.relative_to(REPO)}")


def write_check_sheet() -> None:
    """Contact sheet of every imported building state at midday — eyeball the keying."""
    order = ["ruin", "wip", "", "_l2", "_l3"]
    names = sorted({p.stem for p in ART.glob("town_*.png")} | {p.stem for p in ART.glob("prop_well*.png")})
    bases = sorted({re.sub(r"_(ruin|wip|l2|l3)$", "", re.sub(r"_(dawn|dusk|night)$", "", n)) for n in names})
    cell = 200
    sheet = Image.new("RGBA", (5 * cell + 40, len(bases) * cell + 40), (24, 26, 34, 255))
    from PIL import ImageDraw
    d = ImageDraw.Draw(sheet)
    for r, base in enumerate(bases):
        d.text((6, 20 + r * cell), base, fill=(255, 225, 150))
        for c, suf in enumerate(order):
            ident = base + ("_ruin" if suf == "ruin" else "_wip" if suf == "wip" else suf)
            fp = ART / f"{ident}.png"
            if not fp.exists():
                continue
            s = Image.open(fp).convert("RGBA")
            s.thumbnail((cell - 16, cell - 16))
            sheet.alpha_composite(s, (20 + c * cell + (cell - s.width) // 2, 20 + r * cell + (cell - s.height) // 2))
    out = REPO / "docs" / "map_v2_import_check.png"
    sheet.convert("RGB").save(out)
    print(f"check sheet -> {out.relative_to(REPO)}")


def main() -> None:
    dry = "--dry-run" in sys.argv
    if "--manifest-only" in sys.argv:
        rewrite_manifest()
        return
    report: list[str] = []
    coverage: dict[str, set[str]] = {}
    import_plates(dry, report)
    import_buildings(dry, report, coverage)
    print("\n".join(report))
    if coverage:
        print("\nstate x phase coverage:")
        for b in sorted(coverage):
            print(f"  {b:12s} {', '.join(sorted(coverage[b]))}")
    if dry:
        print("\n--dry-run: nothing written. Re-run without it to import.")
        return
    rewrite_manifest()
    if "--check" in sys.argv:
        write_check_sheet()
    print("\nDone. Review public/art + src/art-manifest.ts, then commit and push.")


if __name__ == "__main__":
    main()
