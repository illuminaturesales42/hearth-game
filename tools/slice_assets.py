"""
Hearth asset slicer: crops game assets out of the concept/production sheets
in the OneDrive Hearth folder into public/art/<id>.png and writes
src/art-manifest.ts so the app knows which ids have real art.

Usage:
  python tools/slice_assets.py            # slice everything in MANIFEST
  python tools/slice_assets.py --probe X  # write grid-probe for sheet key X
  python tools/slice_assets.py --contact  # write contact sheet of all slices

Naming (Book 06): category_subject_state_variant, flat ids like
item_wood_3, stage_2, char_bran_bust, nav_home, ui_coin.
"""
from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance

SRC = Path(r"C:/Users/illum/OneDrive/Desktop/Hearth/Graphics and UI")
REPO = Path(__file__).resolve().parents[1]
OUT = REPO / "public" / "art"
TS_MANIFEST = REPO / "src" / "art-manifest.ts"

# The user curated the canonical sheets into Core/ (2026-07-07) with friendly
# names; working sheets remain in the folder root.
SHEETS = {
    "batch1": "Core/Hearth_Assets.png",                              # stages, style ref (= progress.png)
    "batch2": "Core/Map.png",                                        # map, vignettes
    "batch34": "Core/Merge assest.png",                              # merge items + UI kit
    "batch567": "7f864af6-7e0a-4195-b28c-6683574085c1.png",          # portraits, buildings, fx
    "batch89": "fc428ff1-536b-4168-a842-a67644ad32e2.png",           # events, polish, splash
    "corepack1": "ChatGPT Image Jul 7, 2026, 04_42_47 AM.png",       # ui elements, props, trees
    "corepack2": "ChatGPT Image Jul 7, 2026, 04_42_55 AM.png",       # hud, chest, popups
    "corepack3": "Core/Terain and buildings.png",                    # buildings catalogue
    "corepack4": "ChatGPT Image Jul 7, 2026, 04_43_05 AM.png",       # core mvp pack (avatars, buildings)
    "corepack5": "Core/MVP.png",                                     # CORE board + palette reference
    # FINAL production assets (2026-07-08) — the authoritative art library
    "final_style": "Core/Final Assets/Batch 1 — Foundation & Style Lock.png",
    "final_world": "Core/Final Assets/Batch 2 - 4 World & Map Merch Products chain.png",
    "final_build": "Core/Final Assets/Batch 5 - Buildings.png",
    "final_ui": "Core/Final Assets/Batch 6 -7 Terrain and Ui.png",
    "final_char": "Core/Final Assets/Batch 8 - Charachters.png",
    "final_wellness": "Core/Final Assets/Batch 9-10 - Story and real world wellness.png",
    "final_env": "Core/Final Assets/Batch 11 - 12 Enviromental effects and Seasonal content.png",
    "final_panels": "Core/Final Assets/Batch 13 - UI panels and information.png",
    "final_interact": "Core/Final Assets/Batch 14 - UI interactive.png",
    # Batch 15 (2026-07-09): the painted island terrain plate — the whole
    # island+sea as one opaque painting; the game composites buildings/boats/
    # people/time-of-day on top. Skipped gracefully until this file is generated
    # (see PLOT_MASK_map_island_plate.png + tools/make_plot_mask.py for the guide).
    "batch15_plate": "Core/Final Assets/Batch 15/map_island_plate.png",
}

# id -> (sheet_key, (x0, y0, x1, y1)) in native sheet pixels (all sheets 1536x1024
# except concept boards). Populated iteratively via --probe verification.
MANIFEST: dict[str, tuple[str, tuple[int, int, int, int]]] = {}
# ids that get edge-flood background removal (sprites composed onto scenes)
KEYED: set[str] = set()
# per-id keying tolerance overrides (dark sprites on dark panels need a tighter key)
TOLERANCE: dict[str, int] = {}
# ids keyed against a FIXED colour instead of the border average (for light
# sheets where an icon can touch the crop edge and skew the average)
KEYCOLOR: dict[str, tuple] = {}
# ids multiplied by a brightness factor after cropping (e.g. dark checker tile)
DARKEN: dict[str, float] = {}
# ids whose key colour is swept EVERYWHERE (not just edge-connected): sprites
# with interior gaps — tree canopies, rock clusters — trap panel colour in
# holes the edge flood can't reach. Swept tightly so dark art pixels survive.
GLOBALKEY: dict[str, tuple] = {}
GLOBALKEY_TOL = 20


def remove_bg(im: Image.Image, tolerance: int = 52, key: tuple | None = None) -> Image.Image:
    """Make the panel background transparent: BFS from all border pixels,
    clearing anything within `tolerance` colour distance of the reference
    colour. `key` fixes that colour (robust when an icon touches the crop
    edge and skews the border average); otherwise the border average is used.
    Interior pixels stay (only edge-connected bg is removed)."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    border = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for x in (0, w - 1) for y in range(h)]
    n = len(border)
    avg = key if key is not None else tuple(sum(px[x, y][c] for x, y in border) // n for c in range(3))

    def close(p):
        return (p[0] - avg[0]) ** 2 + (p[1] - avg[1]) ** 2 + (p[2] - avg[2]) ** 2 <= tolerance * tolerance

    seen = bytearray(w * h)
    stack = [p for p in border if close(px[p[0], p[1]])]
    for x, y in stack:
        seen[y * w + x] = 1
    while stack:
        x, y = stack.pop()
        px[x, y] = (0, 0, 0, 0)
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and close(px[nx, ny]):
                seen[ny * w + nx] = 1
                stack.append((nx, ny))
    return im


def global_key(im: Image.Image, key: tuple, tol: int = GLOBALKEY_TOL) -> Image.Image:
    """Clear EVERY pixel within `tol` of `key`, connectivity be damned — for
    interior panel remnants hiding in canopy gaps and rock crevices."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if p[3] and (p[0] - key[0]) ** 2 + (p[1] - key[1]) ** 2 + (p[2] - key[2]) ** 2 <= tol * tol:
                px[x, y] = (0, 0, 0, 0)
    return im


def defringe(im: Image.Image) -> Image.Image:
    """Kill the 1px halo that flood-keying leaves: boundary pixels (opaque but
    touching transparency) still carry the old panel colour blended into their
    RGB. Give each boundary pixel the average colour of its solid neighbours
    and soften its alpha, so sprites blend into ANY background instead of
    ringing with the sheet colour they were cut from."""
    im = im.convert("RGBA")
    px = im.load()
    w, h = im.size
    boundary: list[tuple[int, int]] = []
    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                    boundary.append((x, y))
                    break
    fixes: list[tuple[int, int, tuple[int, int, int, int]]] = []
    for x, y in boundary:
        rs = gs = bs = n = 0
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] >= 200 and (nx, ny) not in ((x, y),):
                    r, g, b, _ = px[nx, ny]
                    rs += r; gs += g; bs += b; n += 1
        if n:
            a = px[x, y][3]
            fixes.append((x, y, (rs // n, gs // n, bs // n, min(a, 210))))
    for x, y, c in fixes:
        px[x, y] = c
    return im


def add(sheet: str, entries: dict[str, tuple[int, int, int, int]]) -> None:
    for k, v in entries.items():
        MANIFEST[k] = (sheet, v)


def row(sheet: str, prefix: str, ids: list[str], x0: int, y0: int, x1: int, y1: int, inset: int = 0) -> None:
    """Evenly split [x0,x1] into len(ids) cells at rows y0..y1.
    `inset` shrinks each cell on every side — kills neighbour-sprite bleed."""
    n = len(ids)
    w = (x1 - x0) / n
    for i, ident in enumerate(ids):
        add(sheet, {f"{prefix}{ident}": (int(x0 + i * w) + inset, y0 + inset, int(x0 + (i + 1) * w) - inset, y1 - inset)})


def probe(key: str) -> None:
    im = Image.open(SRC / SHEETS[key]).convert("RGB")
    d = ImageDraw.Draw(im)
    for x in range(0, im.width, 64):
        d.line([(x, 0), (x, im.height)], fill=(255, 0, 0) if x % 256 == 0 else (255, 160, 0), width=1)
        d.text((x + 2, 2), str(x), fill=(255, 255, 0))
    for y in range(0, im.height, 64):
        d.line([(0, y), (im.width, y)], fill=(255, 0, 0) if y % 256 == 0 else (255, 160, 0), width=1)
        d.text((2, y + 2), str(y), fill=(255, 255, 0))
    out = REPO / "tools" / f"probe_{key}.png"
    im.save(out)
    print(f"probe -> {out}")


def clean_sprite(im: Image.Image, min_blob: int = 30, pad_frac: float = 0.05, rel: float = 0.12) -> Image.Image:
    """Post-key cleanup for game pieces: keep only substantial connected
    components (drops stray speckles, keyed arrows, and label text), then
    autocrop to content + padding so every icon centres in its tile. A blob
    survives if it is >= min_blob px AND >= `rel` of the largest blob."""
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    seen = bytearray(w * h)
    blobs = []
    for sy in range(h):
        for sx in range(w):
            i0 = sy * w + sx
            if seen[i0] or px[sx, sy][3] < 16:
                continue
            stack = [(sx, sy)]
            seen[i0] = 1
            blob = []
            while stack:
                x, y = stack.pop()
                blob.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and not seen[ny * w + nx] and px[nx, ny][3] >= 16:
                        seen[ny * w + nx] = 1
                        stack.append((nx, ny))
            blobs.append(blob)
    biggest = max((len(b) for b in blobs), default=0)
    thresh = max(min_blob, int(biggest * rel))
    keep = bytearray(w * h)
    for blob in blobs:
        if len(blob) >= thresh:
            for x, y in blob:
                keep[y * w + x] = 1
    for y in range(h):
        for x in range(w):
            if px[x, y][3] >= 16 and not keep[y * w + x]:
                px[x, y] = (0, 0, 0, 0)
    box = im.getbbox()
    if not box:
        return im
    pw = int((box[2] - box[0]) * pad_frac)
    ph = int((box[3] - box[1]) * pad_frac)
    box = (max(0, box[0] - pw), max(0, box[1] - ph), min(w, box[2] + pw), min(h, box[3] + ph))
    return im.crop(box)


def slice_all() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    opened: dict[str, Image.Image] = {}
    ids = []
    for ident, (key, box) in sorted(MANIFEST.items()):
        if key not in opened:
            sheet_path = SRC / SHEETS[key]
            if not sheet_path.exists():
                # Batch 15+ art may not be generated yet — skip its ids so the
                # slicer still runs; they integrate the moment the file lands.
                print(f"skip {ident}: sheet not delivered ({SHEETS[key]})")
                opened[key] = None  # type: ignore[assignment]
                continue
            opened[key] = Image.open(sheet_path).convert("RGBA")
        if opened[key] is None:
            continue
        if ident == "map_island_plate":
            # whole painted plate, whatever resolution it was generated at
            box = (0, 0, *opened[key].size)
        im = opened[key].crop(box)
        if ident in KEYED:
            im = remove_bg(im, TOLERANCE.get(ident, 52), KEYCOLOR.get(ident))
            if ident in GLOBALKEY:
                im = global_key(im, GLOBALKEY[ident])
            im = defringe(im)
        if ident.startswith(("item_", "res_", "action_", "energy_")):
            im = clean_sprite(im)
        elif ident.startswith("town_"):
            im = clean_sprite(im, rel=0.03)  # gentle: buildings are one big mass
        if ident in DARKEN:
            im = ImageEnhance.Brightness(im.convert("RGBA")).enhance(DARKEN[ident])
        im.save(OUT / f"{ident}.png")
        ids.append(ident)
    ts = (
        "// GENERATED by tools/slice_assets.py — do not edit by hand.\n"
        "export const ART_IDS: ReadonlySet<string> = new Set([\n"
        + "".join(f"  '{i}',\n" for i in ids)
        + "]);\n"
        "export function artUrl(id: string): string | null {\n"
        "  return ART_IDS.has(id) ? `/art/${id}.png` : null;\n"
        "}\n"
    )
    TS_MANIFEST.write_text(ts, encoding="utf-8")
    print(f"sliced {len(ids)} assets -> {OUT}")


def contact() -> None:
    files = sorted(OUT.glob("*.png"))
    if not files:
        print("no slices yet")
        return
    cols = 8
    cell = 148
    rows_n = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cell, rows_n * (cell + 16)), (18, 22, 38))
    d = ImageDraw.Draw(sheet)
    for i, f in enumerate(files):
        im = Image.open(f)
        im.thumbnail((cell - 8, cell - 8))
        x = (i % cols) * cell
        y = (i // cols) * (cell + 16)
        sheet.paste(im, (x + 4, y + 4))
        d.text((x + 4, y + cell - 2), f.stem[:22], fill=(240, 230, 200))
    out = REPO / "tools" / "contact_sheet.png"
    sheet.save(out)
    print(f"contact -> {out}")


# ============================================================================
# CROP DEFINITIONS (verified against --probe output)
# ============================================================================

def define() -> None:
    # ---- batch34: merge item icons (the board's face) ----
    # ---- FINAL merge chains (Batch 3, cream bg, individually boxed) ----
    merge = {
        # Timberline — row 1 then row 2
        "item_wood_0": (28, 442, 95, 545), "item_wood_1": (106, 452, 186, 542),
        "item_wood_2": (190, 458, 272, 535), "item_wood_3": (283, 442, 376, 545),
        "item_wood_4": (26, 552, 96, 652), "item_wood_5": (126, 552, 202, 652),
        "item_wood_6": (208, 548, 306, 652),
        # Harvest
        "item_harvest_0": (410, 442, 480, 548), "item_harvest_1": (498, 452, 590, 542),
        "item_harvest_2": (593, 452, 682, 542), "item_harvest_3": (683, 440, 767, 545),
        "item_harvest_4": (408, 550, 502, 654), "item_harvest_5": (522, 552, 628, 650),
        "item_harvest_6": (656, 548, 727, 650),
        # Hearthfire
        "item_hearthfire_0": (796, 442, 864, 545), "item_hearthfire_1": (870, 448, 946, 545),
        "item_hearthfire_2": (946, 448, 1040, 545), "item_hearthfire_3": (1040, 442, 1110, 545),
        # Keepsake (emoji placeholders before this)
        "item_keepsake_0": (1136, 452, 1220, 544), "item_keepsake_1": (1226, 452, 1314, 544),
        "item_keepsake_2": (1328, 442, 1424, 545), "item_keepsake_3": (1432, 454, 1520, 542),
        "item_keepsake_4": (1132, 550, 1230, 652), "item_keepsake_5": (1236, 548, 1346, 654),
        "item_keepsake_6": (1432, 556, 1528, 648),
    }
    add("final_world", merge)
    CREAM = (250, 238, 217)  # Batch 2-4 sheet background
    for k in merge:
        KEYED.add(k)
        KEYCOLOR[k] = CREAM
        TOLERANCE[k] = 52
    # ---- FINAL resources, currencies & containers (Batch 4, cream bg) ----
    res = {
        "res_coin": (26, 876, 106, 928), "res_energy": (135, 872, 220, 930),
        "res_star": (245, 874, 328, 928),
        "res_chest_closed": (556, 710, 646, 802), "res_chest_open": (652, 710, 750, 802),
        "res_gift": (750, 706, 820, 802),
        "res_wood": (26, 712, 100, 800), "res_stone": (116, 712, 196, 800),
        "res_clay": (210, 712, 290, 800), "res_water": (300, 712, 380, 800),
        "res_flowers": (386, 712, 470, 800), "res_honey": (476, 712, 558, 800),
        "res_herbs": (24, 806, 100, 878), "res_rope": (114, 806, 196, 878),
        "res_iron": (210, 806, 292, 878), "res_copper": (300, 806, 384, 878),
        "res_seeds": (386, 806, 470, 878), "res_fish": (476, 806, 560, 878),
        "res_key": (554, 806, 634, 878), "res_scroll": (646, 806, 722, 878),
        "res_book": (728, 806, 804, 878),
    }
    add("final_world", res)
    for k in res:
        KEYED.add(k)
        KEYCOLOR[k] = (250, 238, 217)
        TOLERANCE[k] = 52
    # bottom navigation medallions
    row("batch34", "nav_", ["shop", "map", "home", "villagers", "journal"], 1192, 348, 1510, 412)
    # core icon set, two rows of ten
    row("batch34", "icon_", ["back", "close", "settings", "mail", "quest",
                             "calendar", "camera", "bag", "friends", "trophy"], 720, 468, 1478, 522)
    row("batch34", "icon_", ["search", "filter", "sort", "info", "help",
                             "check", "lock", "unlock", "trash", "edit"], 720, 540, 1478, 592)
    # buttons + panels (reference-quality 9-slice sources)
    add("batch34", {
        "btn_primary": (736, 112, 893, 153),
        "btn_secondary": (736, 220, 893, 260),
        "btn_disabled": (736, 263, 893, 303),
        "panel_large": (922, 92, 1112, 208),
        # inset past the torn corner notches so text never lands on dark edges
        "panel_parchment": (930, 233, 1104, 297),
        "popup_window": (1238, 112, 1385, 262),
    })

    # ---- batch1: homestead stages (Home hero) + splash emblem ----
    row("batch1", "stage_", [str(i) for i in range(5)], 320, 40, 1258, 274)
    add("batch1", {"splash_emblem": (1272, 30, 1522, 268)})

    # ---- FINAL buildings (Batch 5, cream bg): L1 = town_<id>, plus L2/L3
    # for the upgrade system. Each panel holds Level1/Level2/Level3. ----
    b5 = {
        # row 1: Town Hall, Cottage, Workshop, Bakery, Market
        "town_townhall": (10, 140, 104, 280), "town_townhall_l2": (112, 132, 202, 280), "town_townhall_l3": (208, 128, 302, 280),
        # right edge 430: the L2 sprite overlaps its own panel and bleeds left
        # of 452, and the shared ground shadow keeps it blob-connected
        "town_cottage": (347, 140, 430, 280), "town_cottage_l2": (452, 136, 545, 280), "town_cottage_l3": (543, 130, 622, 280),
        "town_workshop": (648, 140, 752, 280), "town_workshop_l2": (750, 136, 840, 280), "town_workshop_l3": (838, 132, 922, 280),
        "town_bakery": (950, 138, 1055, 280), "town_bakery_l2": (1053, 132, 1148, 280), "town_bakery_l3": (1148, 132, 1220, 280),
        "town_market": (1238, 150, 1342, 280), "town_market_l2": (1342, 146, 1438, 280), "town_market_l3": (1440, 150, 1528, 280),
        # row 2: Farm, Dock, Blacksmith, Library, Garden
        "town_farm": (12, 305, 112, 408), "town_farm_l2": (112, 300, 210, 408), "town_farm_l3": (218, 300, 305, 408),
        "town_dock": (347, 320, 438, 408), "town_dock_l2": (440, 318, 538, 408), "town_dock_l3": (540, 315, 615, 408),
        "town_blacksmith": (648, 305, 752, 408), "town_blacksmith_l2": (750, 302, 840, 408), "town_blacksmith_l3": (838, 300, 922, 408),
        "town_library": (950, 305, 1042, 408), "town_library_l2": (1045, 296, 1150, 408), "town_library_l3": (1150, 300, 1222, 408),
        "town_garden": (1242, 315, 1330, 408), "town_garden_l2": (1332, 312, 1428, 408), "town_garden_l3": (1432, 315, 1522, 408),
        # row 3: Fishery -> fisherhut, Boat House -> sawmill (nautical stand-in)
        "town_fisherhut": (12, 475, 112, 570), "town_fisherhut_l2": (112, 470, 210, 570), "town_fisherhut_l3": (216, 468, 305, 570),
        "town_sawmill": (342, 478, 438, 570), "town_sawmill_l2": (440, 474, 538, 570), "town_sawmill_l3": (540, 470, 618, 570),
    }
    add("final_build", b5)
    for k in b5:
        KEYED.add(k)
        KEYCOLOR[k] = (247, 240, 224)  # Batch 5 sheet background
        TOLERANCE[k] = 50

    # ---- corepack3: props + nature sprites (edge-keyed for compositing) ----
    town = {
        "prop_bench": (8, 898, 88, 985),
        "prop_lamp": (104, 890, 176, 985),
        "prop_sign": (178, 890, 242, 985),
        "prop_well": (244, 895, 306, 985),
        "prop_crate": (316, 915, 362, 985),
        "prop_barrel": (364, 910, 412, 985),
        "tree_oak": (494, 900, 572, 982),
        "tree_pine": (576, 902, 638, 982),
        "tree_bush": (642, 916, 718, 985),
        "tree_flowerbush": (722, 908, 812, 980),
        "prop_rock": (814, 912, 878, 985),
    }
    add("corepack3", town)
    KEYED.update(town.keys())

    # ---- batch89: achievement badge art + reward stills (keyed off cream panel) ----
    badges = {
        "badge_master_builder": (352, 445, 428, 518),
        "badge_hearth_guardian": (438, 445, 512, 518),
        "badge_merge_master": (520, 445, 594, 518),
        "badge_habit_hero": (602, 445, 676, 518),
        "reward_chest": (702, 447, 778, 517),
    }
    add("batch89", badges)
    KEYED.update(badges.keys())
    KEYED.discard("reward_chest")  # dramatic dark still, keep as a card image
    for i in range(7):
        x0 = 1085 + i * (430 / 7)
        ident = f"badge_event_{i + 1}"
        add("batch89", {ident: (int(x0), 452, int(x0 + 430 / 7), 512)})
        KEYED.add(ident)

    # ---- FINAL full-body villagers (Batch 8 panel 1) -> map walkers ----
    npc = {
        "npc_bran": (22, 102, 112, 335),
        "npc_wren": (142, 105, 232, 335),
        "npc_sorin": (262, 102, 352, 335),
        "npc_marta": (382, 105, 472, 335),
        "npc_joss": (502, 102, 592, 335),
    }
    add("final_char", npc)
    for k in npc:
        KEYED.add(k)
        KEYCOLOR[k] = (250, 240, 222)
        TOLERANCE[k] = 50

    # ---- batch2: remaining map-scale villagers, animals, boats, fence ----
    b2 = {
        "npc_child": (368, 712, 430, 862),
        "npc_woman": (434, 706, 506, 862),
        "npc_man": (508, 714, 576, 862),  # top at 714: a black divider line runs at ~708
        "animal_gull": (612, 706, 698, 780),
        "animal_cat": (770, 708, 838, 786),
        "animal_dog": (842, 706, 908, 786),
        "boat_fishing_s": (10, 586, 120, 655),
        "boat_fishing_m": (128, 586, 246, 655),
        "boat_sail_s": (253, 578, 347, 655),
        "boat_row": (458, 595, 546, 650),
        "fence_wood": (1306, 592, 1402, 660),
    }
    # terrain + dock kit (batch2 panels 4/6) — the pieces the sheet says to
    # combine into the overworld: rocks, tree clusters, paths, docks
    terrain = {
        "terrain_trees_l": (1034, 505, 1120, 578),
        "terrain_trees_s": (1130, 515, 1222, 578),
        "terrain_bush": (1272, 532, 1344, 578),
        "terrain_rocks": (1372, 505, 1492, 580),
        "terrain_flowers1": (1028, 605, 1105, 652),
        "terrain_flowers2": (1115, 605, 1195, 652),
        "terrain_grass": (1205, 607, 1285, 652),
        "terrain_path": (1418, 600, 1520, 652),
        "dock_straight": (8, 493, 86, 542),
        "dock_corner": (98, 493, 176, 542),
        "dock_end": (192, 493, 257, 542),
        "dock_small": (268, 493, 332, 542),
    }
    b2.update(terrain)
    add("batch2", b2)
    KEYED.update(b2.keys())
    for dark in ("boat_fishing_s", "boat_fishing_m", "boat_sail_s", "boat_row", "animal_cat", "animal_dog"):
        TOLERANCE[dark] = 26
    # map-scale villagers sit on the dark navy panel: fix the key colour and
    # key GENTLY — border-average at tol 52 ate npc_child's own dark outlines.
    for k in ("npc_child", "npc_woman", "npc_man"):
        KEYCOLOR[k] = (16, 30, 34)
        TOLERANCE[k] = 26
    # the man's dark-olive trousers sit ~22 from the navy key — key tighter
    TOLERANCE["npc_man"] = 18
    for t in terrain:
        TOLERANCE[t] = 30  # dark foliage/rock on navy panels — key gently
    for t in ("terrain_trees_l", "terrain_trees_s", "terrain_bush"):
        TOLERANCE[t] = 38  # panels must go; canopy greens survive this
    for t in ("terrain_trees_l", "terrain_trees_s", "terrain_bush", "terrain_rocks"):
        # sweep navy remnants out of canopy gaps / rock crevices (tight tol,
        # everywhere — the edge flood can't reach interior holes)
        GLOBALKEY[t] = (16, 30, 34)

    # ---- corepack5 (Core/MVP.png): the canonical grid board (merge area) ----
    add("corepack5", {"board_grass": (773, 500, 1172, 760)})
    KEYED.add("board_grass")
    TOLERANCE["board_grass"] = 26  # keep the stone rim; a faint dark halo hides on navy

    # Batch 15 island plate: opaque, whole-image, no keying/cleanup. Box is the
    # specced plate size (2048×1536); skipped until the file is generated.
    add("batch15_plate", {"map_island_plate": (0, 0, 2048, 1536)})

    # ---- Batch 13/14 UI: the sanctioned FLAMING-HEART energy icon + painted
    # panel frames. (NO gems / premium-currency art — that violates no-IAP.) ----
    add("final_interact", {
        "energy_heart": (1430, 810, 1480, 882),          # flaming heart (from the loading spinner)
        "panel_wood": (738, 616, 892, 740),              # 9-slice wood frame
        "panel_parch": (930, 612, 1088, 742),            # parchment panel
    })
    for k in ("energy_heart", "panel_wood", "panel_parch"):
        KEYED.add(k)
        KEYCOLOR[k] = (244, 240, 229)  # Batch 13/14 sheet cream
        TOLERANCE[k] = 34
    # two real turf squares from the reference board — used as the cell
    # textures so the aligned checker carries the painted mossy look
    # board turf: green INTERIOR of Batch 6 grass tile (01_grass). The tile
    # sits inside cream panel borders (cream gap at x~120 and above y~100), so
    # crop tight to the green or the cells wash out pale.
    add("final_ui", {"turf_light": (46, 103, 116, 162), "turf_dark": (46, 103, 116, 162)})
    DARKEN["turf_dark"] = 0.85

    # ---- fx stills (still from batch567) ----
    add("batch567", {
        "fx_merge_sparkle": (1056, 72, 1152, 152),
        "fx_energy_orb": (1056, 198, 1152, 270),
    })

    # ---- FINAL villager portraits (Batch 8 panel 2, inside the wooden frames)
    # -> char_<name>_bust, shown on order cards + the Villagers screen ----
    portraits = {
        "char_bran_bust": (786, 108, 876, 198),
        "char_wren_bust": (906, 108, 996, 198),
        "char_sorin_bust": (1028, 108, 1118, 198),
        "char_marta_bust": (1150, 108, 1240, 198),
        "char_joss_bust": (1272, 108, 1362, 198),
        "char_mayor_bust": (1394, 108, 1484, 198),
    }
    add("final_char", portraits)  # painted vignette bg — do NOT key

    # ---- FINAL painted HEARTH wordmark (Batch 1 top-left: gilded serif +
    # ember flame + vine flourishes) -> topbar brandmark + splash ----
    add("final_style", {"wordmark_hearth": (18, 22, 322, 116)})
    KEYED.add("wordmark_hearth")
    KEYCOLOR["wordmark_hearth"] = (1, 10, 14)  # near-black navy bg
    TOLERANCE["wordmark_hearth"] = 34  # gentle — keep the dark-green vines

    # ---- FINAL wellness action medallions (Batch 10 panel 1, round, cream bg)
    # -> action_<subject>, replace the emoji on each energy action ----
    W10 = (252, 240, 220)
    row("final_wellness", "action_", ["walk", "water", "stretch", "breathe", "meditate"], 28, 632, 476, 704, inset=4)
    row("final_wellness", "action_", ["photo", "nature", "sunrise", "sunset", "journal"], 28, 708, 476, 780, inset=4)
    row("final_wellness", "action_", ["sauna", "cold_plunge", "kindness", "reading", "sleep"], 28, 784, 476, 856, inset=4)
    add("final_wellness", {"action_exercise": (30, 862, 104, 934), "action_streak_reward": (120, 862, 196, 934)})
    # energy states (panel 4) -> energy_<state> for the HUD pill
    row("final_wellness", "energy_", ["full", "med", "low", "empty"], 830, 862, 1155, 934, inset=4)
    for k in [f"action_{s}" for s in ("walk", "water", "stretch", "breathe", "meditate", "photo", "nature",
              "sunrise", "sunset", "journal", "sauna", "cold_plunge", "kindness", "reading", "sleep",
              "exercise", "streak_reward")] + [f"energy_{s}" for s in ("full", "med", "low", "empty")]:
        KEYED.add(k)
        KEYCOLOR[k] = W10
        TOLERANCE[k] = 52


define()

# never ship the skipped premium-currency crop
MANIFEST.pop("res_gem_SKIP", None)

if __name__ == "__main__":
    if "--probe" in sys.argv:
        probe(sys.argv[sys.argv.index("--probe") + 1])
    elif "--contact" in sys.argv:
        contact()
    else:
        slice_all()
