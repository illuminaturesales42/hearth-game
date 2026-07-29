"""
Generate the island terrain plate FROM the building layout.

The map is composited, not painted whole: `town-layout.ts` places each building
sprite at a normalised anchor and the plate underneath is terrain only. So the
plate's job is to put the right ground under every anchor — a quarry needs a
rock face, a dock needs water, a farm needs pasture — and to run paths between
them.

Asking a model for "a village island" and hoping the terrain lands where the
anchors are does not work. Instead this builds a SCHEMATIC from the layout data
itself — landmass, water, zone patches, a path network through the well, and a
flat plot at every anchor — and drives the render with it through Canny. The
terrain then matches the anchors by construction.

  python tools/comfy_island.py --schematic     # just draw the control image
  ...venv/python.exe tools/comfy_island.py     # schematic + render the plate
  ...venv/python.exe tools/comfy_island.py --verify   # composite real sprites

Verify with tools/compose_map_mock.py, which lays the real sprites over the
plate using the real layout — the only honest test that the ground fits.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from comfy_dialin import (  # noqa: E402
    CHECKPOINTS,
    LOCKED_CHECKPOINT,
    LOCKED_IPA_TYPE,
    LOCKED_IPA_WEIGHT,
    REPO,
    build_graph,
    queue_and_wait,
    upload_image,
)

OUT = REPO / "tools" / "comfy_out" / "island"
# SDXL-native and closest /8 ratio to the shipped plate (1369x1149 = 1.19:1).
W, H = 1216, 1024

# ---------------------------------------------------------------- the layout
# V2 anchors from town-layout.ts (already hand-tuned against the painted plate)
# plus the animal shelter, which the layout does not carry yet. Kept here as
# data so the schematic and any future layout migration read the same numbers.
ANCHORS: dict[str, tuple[float, float, float]] = {
    "town_quarry": (0.185, 0.46, 0.12),
    "town_tailor": (0.235, 0.60, 0.11),
    "town_animalshelter": (0.265, 0.315, 0.125),  # NEW — pasture, north-west
    "town_cottage": (0.31, 0.511, 0.13),
    "town_townhall": (0.30, 0.407, 0.14),
    "town_library": (0.39, 0.66, 0.13),
    "town_postoffice": (0.405, 0.352, 0.115),
    "town_sawmill": (0.47, 0.291, 0.13),
    "town_blacksmith": (0.47, 0.525, 0.125),
    "town_workshop": (0.53, 0.655, 0.125),
    "town_garden": (0.55, 0.42, 0.135),
    "prop_well": (0.615, 0.508, 0.08),
    "town_farm": (0.65, 0.305, 0.135),
    "town_bakery": (0.68, 0.43, 0.125),
    "town_market": (0.70, 0.615, 0.115),
    "prop_lighthouse": (0.82, 0.335, 0.13),
    "town_fisherhut": (0.85, 0.56, 0.125),
    "town_dock": (0.85, 0.71, 0.152),
}
# Buildings whose ground is WATER — the plate must put bay under them.
OVER_WATER = {"town_dock", "town_fisherhut"}
# Terrain each building needs beneath it.
ZONES = {
    "rock": ["town_quarry"],
    "pasture": ["town_farm", "town_animalshelter"],
    "harbour": ["town_dock", "town_fisherhut"],
    "islet": ["prop_lighthouse"],
}
CROSSROADS = "prop_well"

SEA = (86, 122, 132)
LAND = (past := (150, 158, 116))
BEACH = (214, 198, 158)
ROCK = (142, 138, 130)
PASTURE = (162, 172, 118)
PATH = (176, 172, 138)  # muted: bold paths rendered as brown rivers
PLOT = (158, 164, 122)  # only a shade off LAND: bolder plots rendered as separate rock islets


def island_outline(cx: float, cy: float, rx: float, ry: float, n: int = 96) -> list[tuple[float, float]]:
    """A soft irregular coastline — lobed rather than a clean ellipse."""
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        # three low-frequency lobes keep bays and headlands without noise
        r = 1.0 + 0.085 * math.sin(3 * t + 0.6) + 0.05 * math.sin(5 * t + 2.1) - 0.04 * math.cos(2 * t)
        pts.append((cx + rx * r * math.cos(t), cy + ry * r * math.sin(t)))
    return pts


def _nearest_network(anchors: dict[str, tuple[float, float, float]], skip: set[str]) -> list[tuple]:
    """Organic path network instead of a radial star.

    Connecting every plot straight to the well drew 15 spokes, which reads as a
    diagram rather than a village. This grows the network Prim-style: start at
    the crossroads, and repeatedly join the nearest unconnected plot to its
    nearest CONNECTED neighbour. Lanes then branch the way tracks actually do.
    """
    pts = {k: (v[0], v[1]) for k, v in anchors.items() if k not in skip}
    if CROSSROADS not in pts:
        return []
    joined = {CROSSROADS}
    edges = []
    while len(joined) < len(pts):
        best = None
        for a in joined:
            for b in pts:
                if b in joined:
                    continue
                d = math.dist(pts[a], pts[b])
                if best is None or d < best[0]:
                    best = (d, a, b)
        if best is None:
            break
        edges.append((pts[best[1]], pts[best[2]]))
        joined.add(best[2])
    return edges


def draw_schematic() -> Image.Image:
    """Compose the plate's ground plan as MASKS, not stacked drawings.

    Drawing the bay as a filled ellipse over finished land left a circle
    floating in open water and a beach ring that crossed the island. A coast is
    a boundary, so it has to be derived: build the land mask, subtract the bay,
    then take the beach as the ring around whatever land actually remains.
    """
    import numpy as np
    from scipy import ndimage

    # --- land mask
    land_im = Image.new("L", (W, H), 0)
    ImageDraw.Draw(land_im).polygon(island_outline(0.46 * W, 0.50 * H, 0.42 * W, 0.37 * H), fill=255)

    # --- carve the harbour out of the east coast, centred between the two
    # over-water anchors so the bay actually reaches them
    dx, dy, _ = ANCHORS["town_dock"]
    fx, fy, _ = ANCHORS["town_fisherhut"]
    bay = Image.new("L", (W, H), 0)
    bcx, bcy = (dx + fx) / 2 * W, (dy + fy) / 2 * H
    ImageDraw.Draw(bay).ellipse(
        [bcx - 0.20 * W, bcy - 0.17 * H, bcx + 0.34 * W, bcy + 0.19 * H], fill=255
    )
    land = np.array(land_im) > 127
    land &= ~(np.array(bay) > 127)

    # --- lighthouse islet: its own land, with clear water around it
    lx, ly, lw = ANCHORS["prop_lighthouse"]
    islet_im = Image.new("L", (W, H), 0)
    ImageDraw.Draw(islet_im).ellipse(
        [lx * W - lw * W * 0.72, ly * H - 0.052 * H, lx * W + lw * W * 0.72, ly * H + 0.030 * H], fill=255
    )
    islet = np.array(islet_im) > 127
    moat = ndimage.binary_dilation(islet, iterations=26)
    land &= ~moat
    land |= islet

    # --- beach: the ring around the FINAL coastline, bay included
    beach = ndimage.binary_dilation(land, iterations=11) & ~ndimage.binary_erosion(land, iterations=6)

    px = np.zeros((H, W, 3), np.uint8)
    px[:] = SEA
    px[beach] = BEACH
    px[land] = LAND

    im = Image.fromarray(px)
    d = ImageDraw.Draw(im)

    # --- zone patches
    for name in ZONES["rock"]:
        x, y, w = ANCHORS[name]
        d.ellipse([x * W - w * W * 0.9, y * H - 0.075 * H, x * W + w * W * 0.9, y * H + 0.04 * H], fill=ROCK)
    for name in ZONES["pasture"]:
        x, y, w = ANCHORS[name]
        d.ellipse([x * W - w * W, y * H - 0.06 * H, x * W + w * W, y * H + 0.05 * H], fill=PASTURE)

    # --- organic lanes + a coast road along the south
    for (ax, ay), (bx, by) in _nearest_network(ANCHORS, OVER_WATER | {"prop_lighthouse"}):
        d.line([(ax * W, ay * H), (bx * W, by * H)], fill=PATH, width=14)
    d.line([(0.24 * W, 0.70 * H), (0.42 * W, 0.775 * H), (0.60 * W, 0.77 * H), (0.72 * W, 0.70 * H)],
           fill=PATH, width=16, joint="curve")

    # --- a flat plot under every land anchor
    for name, (x, y, w) in ANCHORS.items():
        if name in OVER_WATER:
            continue
        rx = max(18, w * W * 0.52)
        d.ellipse([x * W - rx, y * H - rx * 0.40, x * W + rx, y * H + rx * 0.40], fill=PLOT)

    # --- jetties from the shore out across the bay to each water anchor
    for name in OVER_WATER:
        x, y, w = ANCHORS[name]
        # from the bay shore out to the anchor only — long bars crossed the
        # island and ran off the frame
        d.line([(x * W - w * W * 0.85, y * H), (x * W + w * W * 0.15, y * H)], fill=PATH, width=11)

    return im.filter(ImageFilter.GaussianBlur(1.6))


PROMPT = (
    "hand painted cosy storybook game map, a small coastal village island seen "
    "from a high three-quarter angle, soft visible brush strokes, warm light "
    "from the top right, "
    "(EMPTY GROUND ONLY, terrain and landscape with NO buildings and NO houses "
    "on it:1.5), "
    "grassy meadows and flat cleared building plots, winding pale dirt paths, "
    "a rocky grey quarry cut on the west, open fenced pasture on the north, a "
    "calm teal harbour bay on the east with a sandy shore, a small rocky islet "
    "off the north-east, pine woods along the north edge, pale sand beach along "
    "the south, scattered rocks and low shrubs, "
    "muted earthy palette, grass #96a074, sand #d6c69e, sea #567a84, stone "
    "#897153, "
    "(whole island centred with calm open sea all around it, nothing touching "
    "the edge of the frame:1.3), "
    "(flat 2D hand-painted game map asset, not a photo, not a 3D render, no "
    "text, no labels:1.4)"
)

NEGATIVE = (
    "buildings, houses, cottages, roofs, village, town, structures, walls, "
    "people, characters, boats, text, labels, map markers, grid lines, icons, "
    "compass, photograph, 3d render, aerial photo, satellite image, blurry, "
    "low quality, watermark, signature, frame, border, tilt-shift, miniature"
)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--schematic", action="store_true", help="only draw the control image")
    ap.add_argument("--strength", type=float, default=0.62, help="ControlNet strength")
    ap.add_argument("--end", type=float, default=0.55, help="ControlNet release")
    ap.add_argument("--seed-offset", type=int, default=0)
    ap.add_argument("--denoise", type=float, default=0.72, help="img2img strength; lower keeps more of the plan")
    ap.add_argument("--tag", default="")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    schem = draw_schematic()
    sp = OUT / "_island_schematic.png"
    schem.save(sp)
    print(f"schematic: {sp}  ({W}x{H}, {len(ANCHORS)} anchors)")
    if args.schematic:
        return

    ref = upload_image(sp, "_island_schematic.png")
    board = upload_image(REPO / "tools" / "comfy_out" / "_guide_board_prog.png", "_island_board.png")
    # IMG2IMG, not txt2img. The first attempt drove this through Canny alone and
    # the render came back INVERTED — the island rendered as a lake ringed by
    # land. Canny carries edges only, so the schematic's land/water/zone colours
    # were thrown away and the model guessed which side of the outline was sea.
    # Encoding the schematic as the starting latent keeps its colour plan; Canny
    # still holds the coastline and paths.
    graph = build_graph(
        CHECKPOINTS[LOCKED_CHECKPOINT], PROMPT, (LOCKED_IPA_WEIGHT, LOCKED_IPA_TYPE),
        ref, board, (W, H), NEGATIVE, args.end, (60, 150), args.seed_offset,
    )
    graph["7"]["inputs"]["strength"] = args.strength
    graph["21"] = {"class_type": "LoadImage", "inputs": {"image": ref}}
    graph["22"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["21", 0], "vae": ["1", 2]}}
    graph["9"]["inputs"]["latent_image"] = ["22", 0]
    graph["9"]["inputs"]["denoise"] = args.denoise

    dest = OUT / f"island_plate{('_' + args.tag) if args.tag else ''}.png"
    dest.write_bytes(queue_and_wait(graph))
    print(f"plate: {dest}")


if __name__ == "__main__":
    main()
