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

--verify lays the real sprites over the plate using the real layout. That is
the only honest test that the ground fits; everything above it is a hypothesis.
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

# Sampled from the prompt's own palette, then DEEPENED. The first pass used the
# literal hexes (grass #96a074) and every render came back as a sand desert: a
# large flat region of pale olive is close enough to sand that the model just
# reads it that way. The plan has to overstate the green for the render to land
# on it.
SEA = (86, 122, 132)
LAND = (126, 146, 90)
BEACH = (214, 198, 158)
ROCK = (118, 112, 104)
PASTURE = (148, 166, 102)
PATH = (182, 168, 130)  # muted: bold paths rendered as brown rivers
PLOT = (131, 150, 94)  # only a shade off LAND: bolder plots rendered as separate rock islets
WOOD = (66, 96, 52)
SCRUB = (104, 128, 76)
TILL = (150, 132, 100)


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


# A building sprite's foot sits this far below its anchor, as a fraction of the
# plate height. Measured off the rendered sprites, not guessed.
FOOT_DROP = 0.042


def resolved_anchors() -> dict[str, tuple[float, float, float]]:
    """ANCHORS with the water buildings snapped onto THIS plate's coastline.

    dock and fisherhut were hand-tuned against the original painted plate. This
    plate has its own coast, and at the dock's latitude that coast is 0.04
    further west — a pier hut whose shore is four percent of the map away reads
    as a building adrift in the sea, which is exactly how it rendered.

    Two rounds were spent hand-tuning the harbour ellipse to move the coast onto
    the anchors, and both moved it the wrong way (the second flattened the bay
    out of existence). The coast is derived data and the anchor is a free
    parameter, so the dependency runs the other way: measure where the shore
    actually falls at the sprite's foot, and stand the building on it, with the
    shore passing under its western third.
    """
    import numpy as np

    land = _land_mask()
    out = dict(ANCHORS)
    for name in OVER_WATER:
        x, y, w = ANCHORS[name]
        xs = np.nonzero(land[min(H - 1, int((y + FOOT_DROP) * H))])[0]
        if len(xs):
            out[name] = (float(xs.max()) / W + w * 0.30, y, w)
    return out


def _keep_clear(np):
    """Where a building sprite will stand — nothing may be scattered here.

    Without this the model treats every empty patch as an invitation and puts a
    rock spire on the sawmill. Reserving the anchors in the PLAN is the only way
    to keep them clear in the render, since the prompt cannot say "leave a gap
    at 47% across".
    """
    im = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(im)
    for name, (x, y, w) in ANCHORS.items():
        if name in OVER_WATER:
            continue
        d.ellipse(
            [x * W - w * W * 0.95, y * H - 0.085 * H, x * W + w * W * 0.95, y * H + 0.055 * H], fill=255
        )
    return np.array(im) > 127


def _scatter(draw, rng, allow, n, radius, colour, np, squash=0.72, jitter=0.35):
    """Drop n soft blobs on random pixels of `allow`, a boolean mask.

    Sampling the mask directly (rather than rejection-sampling a bounding box)
    means a zone of any shape fills evenly and no blob can land in the sea.
    """
    ys, xs = np.nonzero(allow)
    if not len(xs):
        return
    for i in rng.sample(range(len(xs)), min(n, len(xs))):
        x, y = int(xs[i]), int(ys[i])
        r = radius * (1 + jitter * (rng.random() * 2 - 1))
        draw.ellipse([x - r, y - r * squash, x + r, y + r * squash], fill=colour)


def _land_mask():
    """The island's final landmass — outline, minus harbour, minus moat,
    plus islet, morphologically smoothed. Shared by the schematic and the
    finish composite so both agree on exactly where the coast is."""
    import numpy as np
    from scipy import ndimage

    # --- land mask
    land_im = Image.new("L", (W, H), 0)
    ImageDraw.Draw(land_im).polygon(island_outline(0.46 * W, 0.50 * H, 0.42 * W, 0.37 * H), fill=255)

    # --- carve the harbour out of the east coast as a rounded bite that takes
    # in both over-water anchors. The first geometry ran the ellipse from the
    # midpoint to +0.34W, i.e. past the right edge of the frame, so it removed
    # the entire east side and left the jetties in open sea.
    dx, dy, _ = ANCHORS["town_dock"]
    fx, fy, _ = ANCHORS["town_fisherhut"]
    bay = Image.new("L", (W, H), 0)
    # Reach matters more than size. At +0.05 the bay swallowed the coast west of
    # both anchors and the two water buildings came out as detached islands with
    # open sea behind them. A dock sits at the HEAD of a bay: water in front,
    # land at its back. Pushing the centre east leaves the shore just inland of
    # the anchors, which is the relationship the sprites are drawn for.
    bcx, bcy = (max(dx, fx) + 0.115) * W, (dy + fy) / 2 * H
    ImageDraw.Draw(bay).ellipse(
        [bcx - 0.155 * W, bcy - 0.145 * H, bcx + 0.155 * W, bcy + 0.145 * H], fill=255
    )
    land = np.array(land_im) > 127
    land &= ~(np.array(bay) > 127)

    # --- lighthouse islet: its own land, with clear water around it. At 26px
    # the moat was thinner than the beach ring that grows back over it, so the
    # islet welded itself to the mainland and rendered as a spur.
    lx, ly, lw = ANCHORS["prop_lighthouse"]
    islet_im = Image.new("L", (W, H), 0)
    ImageDraw.Draw(islet_im).ellipse(
        [lx * W - lw * W * 0.62, ly * H - 0.045 * H, lx * W + lw * W * 0.62, ly * H + 0.028 * H], fill=255
    )
    islet = np.array(islet_im) > 127
    moat = ndimage.binary_dilation(islet, iterations=46)
    land &= ~moat
    land |= islet

    # Where the moat met the bay it left a sharp angular spit. Coastlines do not
    # have spikes, and the model reads one as a rock spire, so close-then-open
    # the mask to round the joins off. (Opening can nibble the islet — restore it.)
    land = ndimage.binary_opening(ndimage.binary_closing(land, iterations=7), iterations=7)
    land |= islet
    return land


def draw_schematic() -> tuple[Image.Image, Image.Image]:
    """Compose the plate's ground plan as MASKS, not stacked drawings.

    Drawing the bay as a filled ellipse over finished land left a circle
    floating in open water and a beach ring that crossed the island. A coast is
    a boundary, so it has to be derived: build the land mask, subtract the bay,
    then take the beach as the ring around whatever land actually remains.

    Returns TWO plates, because they feed different inputs and want opposite
    things:

      colour     seeds the img2img latent. Carries everything, including the
                 fine scatter that stops the interior rendering as a flat field.
      structure  feeds Canny. Carries only what must be OBEYED — coastline,
                 bay, lanes, zone and treeline boundaries. Deliberately omits
                 the building plots: a plot drawn as a closed ellipse is a
                 closed contour, and v3 rendered two of them as lakes.
    """
    import random

    import numpy as np
    from scipy import ndimage

    rng = random.Random(20260730)

    land = _land_mask()

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
        d.ellipse([x * W - w * W * 1.25, y * H - 0.10 * H, x * W + w * W * 1.25, y * H + 0.055 * H], fill=ROCK)
    for name in ZONES["pasture"]:
        x, y, w = ANCHORS[name]
        d.ellipse([x * W - w * W * 0.78, y * H - 0.05 * H, x * W + w * W * 0.78, y * H + 0.045 * H], fill=PASTURE)

    # --- lanes: organic network through the well + a coast road along the south
    lanes = [
        [(ax * W, ay * H), (bx * W, by * H)]
        for (ax, ay), (bx, by) in _nearest_network(ANCHORS, OVER_WATER | {"prop_lighthouse"})
    ]
    coast_road = [(0.24 * W, 0.70 * H), (0.42 * W, 0.775 * H), (0.60 * W, 0.77 * H), (0.72 * W, 0.70 * H)]
    for lane in lanes:
        d.line(lane, fill=PATH, width=14)
    d.line(coast_road, fill=PATH, width=16, joint="curve")

    # --- interior detail. v3's whole middle rendered as one flat green field
    # because the plan said nothing was there, so the model had nothing to
    # elaborate. Everything below is placed in the GAPS: `open` excludes the
    # anchors, the lanes and the shoreline.
    clear = _keep_clear(np)
    lane_im = Image.new("L", (W, H), 0)
    ld = ImageDraw.Draw(lane_im)
    for lane in lanes:
        ld.line(lane, fill=255, width=30)
    ld.line(coast_road, fill=255, width=34, joint="curve")
    inland = ndimage.binary_erosion(land, iterations=14)
    open_ = inland & ~clear & ~(np.array(lane_im) > 127)

    yy, xx = np.mgrid[0:H, 0:W]
    fy_, fx_ = yy / H, xx / W

    wood_im = Image.new("L", (W, H), 0)
    wd = ImageDraw.Draw(wood_im)
    for zone, n, r in (
        (open_ & (fy_ < 0.27), 90, 9),            # pine band along the north edge
        (open_ & (fx_ < 0.25) & (fy_ > 0.30), 45, 8),  # west slope woods
        (open_ & (fy_ > 0.70) & (fx_ < 0.52), 70, 9),  # southern forest
    ):
        _scatter(wd, rng, zone, n, r, 255, np)
    wood = np.array(wood_im.filter(ImageFilter.GaussianBlur(5))) > 70
    px2 = np.array(im)
    px2[wood & land] = WOOD
    im = Image.fromarray(px2)
    d = ImageDraw.Draw(im)

    # tilled strips beside the farm and the shelter — pasture that reads as worked
    for name in ZONES["pasture"]:
        x, y, w = ANCHORS[name]
        for k in range(4):
            oy = (y + 0.075 + k * 0.016) * H
            d.line([(x * W - w * W * 0.8, oy), (x * W + w * W * 0.8, oy)], fill=TILL, width=4)

    # low scrub over the remaining open ground, and an orchard in the south-east
    _scatter(d, rng, open_ & ~wood, 150, 7, SCRUB, np)
    for row in range(5):
        for col in range(7):
            ox, oy = (0.56 + col * 0.028) * W, (0.72 + row * 0.026) * H
            if land[int(oy), int(ox)] and not clear[int(oy), int(ox)]:
                d.ellipse([ox - 5, oy - 4, ox + 5, oy + 4], fill=WOOD)

    # loose rock around the quarry and along the exposed south-west shore
    qx, qy, qw = ANCHORS["town_quarry"]
    near_quarry = open_ & (((fx_ - qx) ** 2 + ((fy_ - qy) * 0.8) ** 2) < (qw * 1.9) ** 2)
    _scatter(d, rng, near_quarry, 40, 6, ROCK, np)
    _scatter(d, rng, open_ & (fy_ > 0.74) & (fx_ > 0.30) & (fx_ < 0.62), 30, 6, ROCK, np)

    # --- a flat plot under every land anchor. Colour plate ONLY: this is the
    # contour that v3 turned into lakes, so it never reaches Canny.
    for name, (x, y, w) in ANCHORS.items():
        if name in OVER_WATER:
            continue
        rx = max(18, w * W * 0.42)
        d.ellipse([x * W - rx, y * H - rx * 0.40, x * W + rx, y * H + rx * 0.40], fill=PLOT)

    # --- jetties from the shore out across the bay to each water anchor
    snapped = resolved_anchors()
    for name in OVER_WATER:
        x, y, w = snapped[name]
        # from the bay shore out to the anchor only — long bars crossed the
        # island and ran off the frame
        d.line([(x * W - w * W * 1.6, y * H), (x * W + w * W * 0.2, y * H)], fill=PATH, width=11)

    # --- structure plate: the same regions as flat greys, no plots, no scatter.
    # Canny wants a handful of boundaries it can trace, not 300 tiny circles.
    st = np.full((H, W), 40, np.uint8)      # sea
    st[beach] = 205
    st[land] = 140
    st[wood & land] = 75
    zone_im = Image.new("L", (W, H), 0)
    zd = ImageDraw.Draw(zone_im)
    for name in ZONES["rock"]:
        x, y, w = ANCHORS[name]
        zd.ellipse([x * W - w * W * 1.25, y * H - 0.10 * H, x * W + w * W * 1.25, y * H + 0.055 * H], fill=95)
    for name in ZONES["pasture"]:
        x, y, w = ANCHORS[name]
        zd.ellipse([x * W - w * W * 0.78, y * H - 0.05 * H, x * W + w * W * 0.78, y * H + 0.045 * H], fill=170)
    zones = np.array(zone_im)
    st[(zones > 0) & land] = zones[(zones > 0) & land]
    stim = Image.fromarray(st).convert("RGB")
    sd = ImageDraw.Draw(stim)
    for lane in lanes:
        sd.line(lane, fill=(180, 180, 180), width=14)
    sd.line(coast_road, fill=(180, 180, 180), width=16, joint="curve")
    for name in OVER_WATER:
        x, y, w = snapped[name]
        sd.line([(x * W - w * W * 1.6, y * H), (x * W + w * W * 0.2, y * H)], fill=(180, 180, 180), width=11)

    return im.filter(ImageFilter.GaussianBlur(1.6)), stim.filter(ImageFilter.GaussianBlur(1.2))


PROMPT = (
    "hand painted cosy storybook game map, a small coastal village island seen "
    "from a high three-quarter angle, soft visible brush strokes, warm light "
    "from the top right, "
    "(EMPTY GROUND ONLY, terrain and landscape with NO buildings and NO houses "
    "on it:1.5), "
    "lush green grassy meadows and flat cleared building plots, (winding dry pale dirt cart tracks and gravel lanes:1.25), "
    "a rocky grey quarry cut on the west, open fenced pasture on the north, a "
    "calm teal harbour bay on the east with a sandy shore, a small rocky islet "
    "off the north-east, pine woods along the north edge, pale sand beach along "
    "the south, hedgerows, tilled strips, a small orchard, scattered rocks and "
    "low shrubs, "
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
    "low quality, watermark, signature, frame, border, tilt-shift, miniature, "
    # v3 turned two building plots into ponds and filled the gaps with alpine
    # spires; the plan no longer offers those contours, and this closes the door.
    "lake, pond, tarn, crater, inland water, river, waterfall, "
    "mountain, mountain peak, snowy summit, cliff spire, volcano"
)


# A second, low-denoise pass over an APPROVED plate. Getting the geometry right
# needed the plan held tight, and a tightly-held plan renders flat — the two
# cannot be won in one sampling. So they are not: this pass changes nothing
# structural (Canny comes from the plate itself) and spends its whole budget on
# paint, texture and depth.
REFINE_PROMPT = (
    "hand painted cosy storybook game map of a small coastal village island seen "
    "from a high three-quarter angle, "
    "(soft visible oil brush strokes, rich painterly texture, warm light from the "
    "top right with cool shadows, gentle ambient occlusion, subtle colour "
    "variation, layered foliage:1.4), "
    "lush green meadows, a rocky grey quarry cut with exposed stone faces, fenced "
    "pasture with tilled strips, pale dirt cart tracks, pine woods, hedgerows, "
    "scattered boulders and low shrubs, pale sand beach, calm teal sea, "
    "storybook illustration, muted earthy palette, depth and shading, "
    "(EMPTY GROUND ONLY, no buildings, no houses, no roofs:1.5)"
)


def refine(src: Path, denoise: float, strength: float, tag: str) -> Path:
    ref = upload_image(src, f"_island_refine_{src.stem}.png")
    graph = build_graph(
        CHECKPOINTS[LOCKED_CHECKPOINT], REFINE_PROMPT, None, ref, ref, (W, H),
        NEGATIVE, 0.65, (60, 150),
    )
    graph["7"]["inputs"]["strength"] = strength
    graph["21"] = {"class_type": "LoadImage", "inputs": {"image": ref}}
    graph["22"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["21", 0], "vae": ["1", 2]}}
    graph["9"]["inputs"]["latent_image"] = ["22", 0]
    graph["9"]["inputs"]["denoise"] = denoise
    dest = OUT / f"island_plate_{tag}.png"
    dest.write_bytes(queue_and_wait(graph))
    print(f"refined: {dest}")
    return dest


def finish(refined: Path, base: Path, dest: Path) -> Path:
    """Keep the refine's paint on LAND; keep the base's calm sea everywhere else.

    The paint pass improves the island and damages the water: it mottles the flat
    teal into impasto, and it elaborated a stray islet the model had invented
    into an islet with a shed on it — neither of which belongs on a plate whose
    sea the renderer grades and animates. Both live outside the land mask, and
    the land mask is something this tool already knows exactly, so the fix is a
    composite rather than another roll of the dice.
    """
    import numpy as np
    from scipy import ndimage

    land = _land_mask()
    keep = ndimage.binary_dilation(land, iterations=13)  # land + its beach ring

    # The sea is REBUILT, not copied. Copying it from the base plate carried over
    # a rock islet the model had invented off the south-east — not in the layout,
    # so not on the plate. Flooding with the base's own median sea colour erases
    # anything outside the coast and leaves the flat water the renderer expects
    # to grade and animate.
    base_px = np.array(Image.open(base).convert("RGB"))
    open_sea = ~ndimage.binary_dilation(land, iterations=30)
    sea = np.median(base_px[open_sea], axis=0).astype(np.uint8)

    out = np.empty_like(base_px)
    out[:] = sea
    mask = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))
    im = Image.fromarray(out)
    im.paste(Image.open(refined).convert("RGB"), (0, 0), mask)
    im.save(dest)
    print(f"finished: {dest}  (paint on land, sea flooded #{bytes(sea).hex()})")
    return dest


SPRITES = REPO / "tools" / "comfy_out" / "cutout" / "final"


def verify(plate: Path, dest: Path, state: str = "l3") -> Path:
    """Lay the REAL sprites on the plate at the REAL anchors.

    The only honest test of a terrain plate: a lovely island proves nothing if
    the dock ends up on grass. Everything else in this file is a hypothesis
    about where the ground goes; this is the check.
    """
    out = Image.open(plate).convert("RGBA")
    missing = []
    # Back to front, so a southern building overlaps the one behind it.
    for name, (x, y, w) in sorted(resolved_anchors().items(), key=lambda kv: kv[1][1]):
        suffix = "" if state == "l1" else f"_{state}"
        src = SPRITES / f"{name}{suffix}.png"
        if not src.exists():
            src = SPRITES / f"{name}.png"
        if not src.exists():
            missing.append(name)
            continue
        sp = Image.open(src).convert("RGBA")
        tw = max(1, int(w * W))
        sp = sp.resize((tw, max(1, round(sp.height * tw / sp.width))), Image.LANCZOS)
        out.alpha_composite(sp, (int(x * W - sp.width / 2), int(y * H - sp.height * 0.62)))
    out.convert("RGB").save(dest)
    print(f"verify: {dest}  ({len(ANCHORS) - len(missing)} placed"
          + (f", no sprite for {', '.join(missing)}" if missing else "") + ")")
    return dest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", type=Path, default=None, help="composite the real sprites on a plate")
    ap.add_argument("--state", default="l3", help="which upgrade state to place (default l3)")
    ap.add_argument("--refine", type=Path, default=None, help="paint pass over an existing plate")
    ap.add_argument("--finish", nargs=2, type=Path, default=None,
                    metavar=("REFINED", "BASE"), help="land from REFINED, sea from BASE")
    ap.add_argument("--schematic", action="store_true", help="only draw the control images")
    ap.add_argument("--strength", type=float, default=0.82, help="ControlNet strength")
    ap.add_argument("--end", type=float, default=0.70, help="ControlNet release")
    ap.add_argument("--seed-offset", type=int, default=0)
    ap.add_argument("--denoise", type=float, default=0.66, help="img2img strength; lower keeps more of the plan")
    # Default off. The board is a BUILDING style guide — teal roofs, cream
    # plaster, warm stone — and pointing it at a terrain plate washed every
    # render sandy. Buildings arrive as sprites; the plate only needs the prompt.
    ap.add_argument("--ipa", type=float, default=0.0, help="style-board weight, 0 = off")
    ap.add_argument("--tag", default="")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    if args.verify:
        verify(args.verify, OUT / f"_placement_{args.tag or args.state}.png", args.state)
        return
    if args.finish:
        finish(args.finish[0], args.finish[1], OUT / f"island_plate_{args.tag or 'final'}.png")
        return
    if args.refine:
        refine(args.refine, args.denoise, args.strength, args.tag or "refined")
        return

    colour, structure = draw_schematic()
    sp = OUT / "_island_schematic.png"
    stp = OUT / "_island_structure.png"
    colour.save(sp)
    structure.save(stp)
    print(f"schematic: {sp}\nstructure: {stp}  ({W}x{H}, {len(ANCHORS)} anchors)")
    if args.schematic:
        return

    ref = upload_image(sp, "_island_schematic.png")
    struct = upload_image(stp, "_island_structure.png")
    board = upload_image(REPO / "tools" / "comfy_out" / "_guide_board_prog.png", "_island_board.png")
    # IMG2IMG, not txt2img. The first attempt drove this through Canny alone and
    # the render came back INVERTED — the island rendered as a lake ringed by
    # land. Canny carries edges only, so the schematic's land/water/zone colours
    # were thrown away and the model guessed which side of the outline was sea.
    # Encoding the schematic as the starting latent keeps its colour plan; Canny
    # still holds the coastline and paths.
    #
    # The two inputs take DIFFERENT plates: Canny gets the structure plate (no
    # plot ellipses — those closed contours became v3's lakes), the latent gets
    # the full colour plate.
    graph = build_graph(
        CHECKPOINTS[LOCKED_CHECKPOINT], PROMPT,
        (args.ipa, LOCKED_IPA_TYPE) if args.ipa > 0 else None,
        struct, board, (W, H), NEGATIVE, args.end, (60, 150), args.seed_offset,
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
