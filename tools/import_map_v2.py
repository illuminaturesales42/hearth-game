"""Map V2 importer — brings the new painted world into the game.

Run ON THE ART MACHINE (like slice_assets.py). Two jobs:

1. PLATES: the four time-of-day island paintings -> public/art/
     map_island_plate.png (midday base) + map_island_plate_dawn/_dusk/_night.png
   Accepts either one 2x2 quadrant sheet (dawn | midday / dusk | night, the
   "Map times of dayFinal" layout) or four separate files.

2. BUILDINGS: everything in "Full Building Final" -> game ids with the state
   ladder the engine already speaks:
     town_<name>_ruin  ->  town_<name>_wip  ->  town_<name>  (L1)
     -> town_<name>_l2 -> town_<name>_l3, optional _dawn/_dusk/_night per state.
   File naming contract lives in docs/map-v2-naming.md; a forgiving alias table
   below maps church->townhall, windmill->sawmill, greenhouse->garden, etc.
   Single-subject images import directly; row/grid sheets are content-detected
   and cut in state order (ruin, wip, l1, l2, l3 — override with --states).

Usage:
  python tools/import_map_v2.py --dry-run     # report what WOULD happen
  python tools/import_map_v2.py               # import + rewrite the manifest
  python tools/import_map_v2.py --manifest-only   # just resync the manifest
                                                  # (run after slice_assets.py)

The manifest (src/art-manifest.ts) is regenerated from the public/art directory
listing — ground truth on disk — so this tool and slice_assets can run in any
order (slice_assets only knows its own crops; this tool re-adds everything).
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parent.parent
ART = REPO / "public" / "art"
TS_MANIFEST = REPO / "src" / "art-manifest.ts"

# ---- source locations on the art machine (edit if they move) ----------------
SRC = Path(r"C:/Users/illum/OneDrive/Desktop/Hearth/Graphics and UI/Core/Map")
PLATE_SHEET = SRC / "Map times of dayFinal.png"  # 2x2 quadrant sheet, OR:
PLATE_FILES = {  # separate label-free exports (preferred if present)
    "dawn": SRC / "map_dawn.png",
    "midday": SRC / "map_midday.png",
    "dusk": SRC / "map_dusk.png",
    "night": SRC / "map_night.png",
}
BUILDINGS_DIR = SRC / "Full Building Final"
PLATE_MAX_W = 2048  # plates are downscaled to at most this width

# quadrant order of the sheet (row-major), per the reference layout
SHEET_ORDER = ["dawn", "midday", "dusk", "night"]
PLATE_ID = {
    "midday": "map_island_plate",
    "dawn": "map_island_plate_dawn",
    "dusk": "map_island_plate_dusk",
    "night": "map_island_plate_night",
}

# ---- naming: building aliases -> canonical game names ------------------------
# canonical name -> game id prefix ('town' composites get town_, props prop_)
CANON: dict[str, str] = {
    "cottage": "town_cottage",
    "bakery": "town_bakery",
    "market": "town_market",
    "garden": "town_garden",
    "townhall": "town_townhall",
    "workshop": "town_workshop",
    "farm": "town_farm",
    "fisherhut": "town_fisherhut",
    "sawmill": "town_sawmill",
    "blacksmith": "town_blacksmith",
    "dock": "town_dock",
    "library": "town_library",
    "well": "prop_well",
    "sign": "prop_sign",
    "lighthouse": "prop_lighthouse",
}
ALIASES: dict[str, str] = {
    "church": "townhall", "chapel": "townhall", "hall": "townhall",
    "windmill": "sawmill", "mill": "sawmill",
    "greenhouse": "garden", "glasshouse": "garden",
    "pier": "dock", "jetty": "dock", "docks": "dock", "harbor": "dock", "harbour": "dock",
    "hut": "fisherhut", "fisher": "fisherhut", "fishershut": "fisherhut", "fishinghut": "fisherhut",
    "forge": "blacksmith", "smith": "blacksmith", "smithy": "blacksmith",
    "house": "cottage", "home": "cottage",
    "shop": "workshop", "noticeboard": "sign", "notice": "sign", "board": "sign",
    "wishingwell": "well",
}
STATE_ALIASES: dict[str, str] = {
    "ruin": "ruin", "ruins": "ruin", "rubble": "ruin", "damaged": "ruin", "destroyed": "ruin", "broken": "ruin",
    "wip": "wip", "construction": "wip", "underconstruction": "wip", "building": "wip",
    "scaffold": "wip", "scaffolding": "wip", "repair": "wip",
    "l1": "l1", "level1": "l1", "lvl1": "l1", "base": "l1", "built": "l1", "1": "l1",
    "l2": "l2", "level2": "l2", "lvl2": "l2", "2": "l2",
    "l3": "l3", "level3": "l3", "lvl3": "l3", "3": "l3",
}
PHASES = {"dawn": "dawn", "sunrise": "dawn", "dusk": "dusk", "sunset": "dusk", "night": "night", "midday": "", "day": ""}
STATE_ORDER = ["ruin", "wip", "l1", "l2", "l3"]

# state -> id suffix ('' for L1: the base id IS level 1 in the engine)
STATE_SUFFIX = {"ruin": "_ruin", "wip": "_wip", "l1": "", "l2": "_l2", "l3": "_l3"}


def norm(stem: str) -> list[str]:
    """'Town Hall - Under Construction (night)' -> ['town','hall','under','construction','night']"""
    return [t for t in re.split(r"[^a-z0-9]+", stem.lower()) if t]


def parse_name(stem: str) -> tuple[str | None, str | None, str, list[str]]:
    """-> (canonical building, state|None, phase(''=day), leftover tokens)."""
    toks = norm(stem)
    # try to find the building: longest joined run first (e.g. 'town'+'hall')
    building = None
    used: set[int] = set()
    joined = "".join(toks)
    for name in sorted(list(CANON) + list(ALIASES), key=len, reverse=True):
        if name in joined:
            building = ALIASES.get(name, name)
            break
    state = None
    phase = ""
    leftover = []
    for i, t in enumerate(toks):
        if i in used:
            continue
        if t in STATE_ALIASES and state is None:
            state = STATE_ALIASES[t]
        elif t in PHASES and PHASES[t] != "" and phase == "":
            phase = PHASES[t]
        else:
            leftover.append(t)
    # two-word states ('under construction')
    if state is None and "under" in toks and "construction" in joined:
        state = "wip"
    return building, state, phase, leftover


def alpha_autocrop(im: Image.Image, pad_frac: float = 0.05) -> Image.Image:
    a = np.asarray(im.convert("RGBA"))[:, :, 3]
    ys, xs = np.where(a > 8)
    if len(xs) == 0:
        return im
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    pad = int(max(x1 - x0, y1 - y0) * pad_frac)
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(im.width, x1 + pad), min(im.height, y1 + pad)
    return im.crop((x0, y0, x1, y1))


def bands(proj: np.ndarray, thr: int, minlen: int) -> list[tuple[int, int]]:
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


def detect_cells(im: Image.Image) -> list[tuple[int, int, int, int]]:
    """Content islands of a transparent sheet, row-major. 1 cell = single sprite."""
    a = np.asarray(im.convert("RGBA"))[:, :, 3]
    minlen = max(24, im.width // 40)
    rows = bands(a.sum(axis=1), 0, max(24, im.height // 40))
    cells: list[tuple[int, int, int, int]] = []
    for y0, y1 in rows:
        cols = bands(a[y0:y1].sum(axis=0), 0, minlen)
        for x0, x1 in cols:
            cells.append((x0, y0, x1, y1))
    return cells


def import_plates(dry: bool, report: list[str]) -> None:
    separate = all(p.exists() for p in PLATE_FILES.values())
    if separate:
        for phase, path in PLATE_FILES.items():
            im = Image.open(path).convert("RGB")
            write_plate(phase, im, dry, report)
    elif PLATE_SHEET.exists():
        sheet = Image.open(PLATE_SHEET).convert("RGB")
        w, h = sheet.width // 2, sheet.height // 2
        boxes = [(0, 0, w, h), (w, 0, sheet.width, h), (0, h, w, sheet.height), (w, h, sheet.width, sheet.height)]
        report.append(
            "NOTE: slicing plates from the quadrant sheet — if it has DAWN/MIDDAY/"
            "DUSK/NIGHT labels baked in, export label-free finals instead "
            "(map_dawn.png … next to it) and re-run."
        )
        for phase, box in zip(SHEET_ORDER, boxes):
            write_plate(phase, sheet.crop(box), dry, report)
    else:
        report.append(f"plates: nothing found at {PLATE_SHEET} or map_<phase>.png files — skipped")


def write_plate(phase: str, im: Image.Image, dry: bool, report: list[str]) -> None:
    if im.width > PLATE_MAX_W:
        im = im.resize((PLATE_MAX_W, round(im.height * PLATE_MAX_W / im.width)), Image.LANCZOS)
    ident = PLATE_ID[phase]
    report.append(f"plate  {phase:7s} -> {ident}.png  ({im.width}x{im.height})")
    if not dry:
        im.save(ART / f"{ident}.png")


def import_buildings(dry: bool, states_flag: str | None, report: list[str]) -> dict[str, set[str]]:
    coverage: dict[str, set[str]] = {}
    if not BUILDINGS_DIR.exists():
        report.append(f"buildings: folder not found: {BUILDINGS_DIR} — skipped")
        return coverage
    files = sorted(p for p in BUILDINGS_DIR.rglob("*.png"))
    if not files:
        report.append(f"buildings: no PNGs under {BUILDINGS_DIR}")
        return coverage
    for path in files:
        # folder names count as name context too ("Cottage/ruin.png")
        context = " ".join([p.stem for p in path.parents if p != BUILDINGS_DIR and BUILDINGS_DIR in p.parents] + [path.stem])
        building, state, phase, leftover = parse_name(context)
        if building is None or building not in CANON:
            report.append(f"  ?? UNMATCHED {path.relative_to(BUILDINGS_DIR)}  (tokens: {' '.join(norm(context))})")
            continue
        im = Image.open(path).convert("RGBA")
        cells = detect_cells(im)
        if len(cells) > 1 and state is None:
            # a state sheet: cut in ladder order
            order = (states_flag.split(",") if states_flag else STATE_ORDER)[: len(cells)]
            for st, box in zip(order, cells):
                save_building(building, st, phase, im.crop(box), dry, report, coverage, f"{path.name}[{st}]")
        else:
            st = state or "l1"
            save_building(building, st, phase, im, dry, report, coverage, path.name)
    return coverage


def save_building(
    building: str, state: str, phase: str, im: Image.Image, dry: bool,
    report: list[str], coverage: dict[str, set[str]], src: str,
) -> None:
    ident = CANON[building] + STATE_SUFFIX[state] + (f"_{phase}" if phase else "")
    im = alpha_autocrop(im)
    report.append(f"  {src:44s} -> {ident}.png ({im.width}x{im.height})")
    coverage.setdefault(building, set()).add(state + (f"/{phase}" if phase else ""))
    if not dry:
        im.save(ART / f"{ident}.png")


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


def main() -> None:
    dry = "--dry-run" in sys.argv
    states_flag = None
    if "--states" in sys.argv:
        states_flag = sys.argv[sys.argv.index("--states") + 1]
    if "--manifest-only" in sys.argv:
        rewrite_manifest()
        return
    report: list[str] = []
    import_plates(dry, report)
    coverage = import_buildings(dry, states_flag, report)
    print("\n".join(report))
    if coverage:
        print("\nstate coverage (engine falls back gracefully for missing ones):")
        for b in sorted(coverage):
            marks = " ".join(f"{s}{'✓' if s in coverage[b] else '–'}" for s in STATE_ORDER)
            have = ", ".join(sorted(coverage[b]))
            print(f"  {b:12s} {have}")
    if dry:
        print("\n--dry-run: nothing written. Re-run without it to import.")
    else:
        rewrite_manifest()
        print("\nDone. Review, then commit public/art + src/art-manifest.ts and push.")


if __name__ == "__main__":
    main()
