"""
Restyle the SHIPPED map plate into the hand-painted building style.

This replaces the approach in tools/comfy_island.py, which generated a plate
from the layout anchors. That was solving a problem that does not exist.

Overlay the anchors on `public/art/map_island_plate.png` (this tool's --anchors)
and the plate turns out to have been designed around them all along: a network
of cart tracks divides the island into plots, and every building anchor sits
inside one. quarry, tailor and lighthouse sit on rocky shore on purpose; dock
and fisherhut sit out on the water. Nothing about the layout needs inventing —
the roads already connect the plots, and the anchor coordinates are normalised
against THIS image, so they carry its three-quarter perspective with them. Draw
a top-down island instead and the anchors land nowhere in particular, which is
exactly what happened.

What the plate genuinely needs is a new SKIN. It is a glossy near-photoreal
render — tropical blue sea, saturated turf, grey granite — and the rebuilt
buildings are hand-painted storybook: teal slate, warm fieldstone, visible
brush strokes. The two do not belong in the same picture.

So: hold the structure and repaint the surface.

  Canny from the plate, strong and held late  ->  coastline, every cart track,
                                                  the tree masses, the rocks
  img2img from the plate at moderate denoise  ->  composition and perspective
  IPAdapter on the building style board       ->  palette and brushwork
  prompt in the buildings' own material words ->  teal, fieldstone, timber

Usage (ComfyUI venv interpreter):
  ...python.exe tools/comfy_restyle_map.py --anchors      # layout over the plate
  ...python.exe tools/comfy_restyle_map.py --sweep        # 4 candidates + sheet
  ...python.exe tools/comfy_restyle_map.py --denoise 0.55 --ipa 0.6
  ...python.exe tools/comfy_restyle_map.py --verify tools/comfy_out/map/<f>.png
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from comfy_dialin import (  # noqa: E402
    CHECKPOINTS,
    LOCKED_CHECKPOINT,
    LOCKED_IPA_TYPE,
    REPO,
    build_graph,
    contact_sheet,
    queue_and_wait,
    upload_image,
)
from comfy_island import ANCHORS, OVER_WATER, SPRITES  # noqa: E402

PLATE = REPO / "public" / "art" / "map_island_plate.png"
BOARD = REPO / "tools" / "comfy_out" / "_guide_board_prog.png"
OUT = REPO / "tools" / "comfy_out" / "map"
# The plate is 1369x1149. Rendering on the nearest /8 size keeps the anchors
# pixel-aligned with the layout; resampling to a smaller latent and back would
# soften every cart track, which is the one thing worth preserving exactly.
W, H = 1376, 1152

# Material words lifted from the building recipe (tools/comfy_progression.py
# MATERIALS) so the ground is described in the same vocabulary as the things
# standing on it.
#
# The word "village" is deliberately absent. It was in the first prompt and the
# model duly painted a village — clusters of teal-roofed cottages across the
# plate — which is exactly what must NOT be here, since every building arrives
# as a sprite composited on top.
PROMPT = (
    "hand painted cosy storybook game map, an EMPTY uninhabited island in calm "
    "sea seen from a high three-quarter angle, "
    "(bare open ground, meadows and woods and cleared flat plots, absolutely no "
    "buildings and no houses anywhere:1.55), "
    "(soft visible brush strokes, painterly texture, warm highlights and cool "
    "shadows, gentle ambient occlusion, subtle colour variation, imperfections "
    "bring charm:1.35), "
    "warm light from the top right, clear soft hazy sky, "
    "sage green meadows and pine woods, winding pale dirt cart tracks, warm "
    "grey-brown fieldstone #897153 #b1926b boulders along the shore, pale warm "
    "sand beach #d6c69e, calm muted teal sea #4e6d6c, "
    "a fenced grazing pasture, a terraced stone quarry pit, "
    "muted earthy storybook palette, cohesive with hand-painted teal-roofed "
    "cottages, "
    "(flat 2D hand-painted game map asset, illustration, not a photo, not a 3D "
    "render, no text, no labels:1.4)"
)

# The plate's own look is the thing being removed, so it is named here rather
# than left to chance: glossy, photoreal, tropical, high-saturation.
NEGATIVE = (
    "photograph, photorealistic, 3d render, octane, unreal engine, glossy, "
    "high saturation, tropical turquoise water, neon green grass, hdr, "
    "lens flare, depth of field, tilt-shift, "
    "(buildings, houses, cottages, huts, roofs, chimneys, towers, walls, ruins, "
    "village, town, settlement, structures:1.4), people, boats, "
    "storm clouds, overcast, dark clouds, thunderstorm, "
    "text, labels, map markers, grid lines, compass, watermark, signature, "
    "frame, border, blurry, low quality"
)


def anchors_overlay(dest: Path) -> Path:
    """Draw the layout over the plate. The diagnostic that reframed this job."""
    im = Image.open(PLATE).convert("RGB")
    w, h = im.size
    d = ImageDraw.Draw(im)
    for name, (x, y, bw) in ANCHORS.items():
        cx, cy, rx = x * w, y * h, bw * w / 2
        colour = (90, 190, 255) if name in OVER_WATER else (255, 70, 70)
        d.ellipse([cx - rx, cy - rx * 0.5, cx + rx, cy + rx * 0.5], outline=colour, width=4)
        d.text((cx - rx, cy - rx * 0.5 - 16), name.replace("town_", "").replace("prop_", ""),
               fill=(255, 255, 140))
    im.save(dest)
    print(f"anchors: {dest}")
    return dest


# The buildings' own materials, sampled from the Building Style Guide swatches
# (tools/comfy_style_guide.py -> style_guide.json). Every ground region is
# mapped onto one of these, so the plate ends up made of the same palette the
# cottages are made of.
TARGET = {
    "sky":   (172, 186, 190),
    "sun":   (246, 236, 208),
    "sea":   (78, 109, 108),
    "surf":  (150, 170, 166),
    "sand":  (214, 198, 158),
    "rock":  (137, 113, 83),
    "grass": (138, 154, 99),
    "tree":  (74, 107, 82),
}


# The plate was painted with fifteen road-bounded plots for fifteen buildings.
# The quarry and the animal shelter are new, and neither has ground: overlay the
# anchors and the quarry lands on the shore boulders of the west coast while the
# shelter lands inside the north-west pine forest. Both need a plot cut for them,
# and a lane joining that plot to the existing network.
#
# Each entry: (kind, the anchor to run the connecting lane towards).
NEW_PLOTS = {
    "town_animalshelter": ("pasture", "town_townhall"),
    "town_quarry": ("quarry", "town_cottage"),
}

# The island as shipped cannot hold either of them, and that is measurable
# rather than a matter of taste: 43% of it is pine forest and the rest is
# threaded with cart tracks, so the largest patch of open ground anywhere has
# 26px of clearance when a plot needs about 106. At the shelter's latitude the
# treeline runs from x=0.168 to x=0.843 — its anchor is not near the forest, it
# is deep inside it.
#
# So the landmass grows, westward, where the frame has sea to spare. The
# existing fifteen plots are east of the band and are untouched.
#
# The growth is an OFFSET OF THE COASTLINE, not a shape pasted over it. Drawing
# three overlapping ellipses gave a scalloped blob that read as pasted at the
# wrong angle: the island is a foreshortened dome, so land at a given longitude
# sits in a particular y-range, and a flat screen-space ellipse does not. Shifting
# the island's own mask west and unioning it grows every west-facing coast by a
# fixed distance, so the new coast is a translation of the real one — same
# scalloped boulder character, same perspective, by construction.
WEST_BAND = (0.235, 0.575)      # latitudes that grow, tapering to nothing at both ends
WEST_GROWTH = 0.095             # peak growth, as a fraction of plate width
WEST_MARGIN = 0.035             # sea left between the new coast and the frame edge


def _grow_west(island, np):
    """Extend every west-facing coast, tapering to zero at the band's ends.

    Per-row growth is capped by how much open sea that row actually has, so the
    headland can never run off the left edge of the frame — at the island's
    widest latitude there are only 127px of sea to work with.
    """
    h, w = island.shape
    lo, hi = WEST_BAND
    yy = np.arange(h) / h
    win = np.where((yy > lo) & (yy < hi),
                   np.sin(np.pi * np.clip((yy - lo) / (hi - lo), 0, 1)) ** 0.7, 0.0)

    want = win * WEST_GROWTH * w
    coast = np.full(h, w, float)
    rows = np.nonzero(island.any(axis=1))[0]
    coast[rows] = np.argmax(island[rows], axis=1)
    dx = np.minimum(want, np.maximum(0.0, coast - WEST_MARGIN * w)).astype(int)

    grown = island.copy()
    for d in range(1, int(dx.max()) + 1):
        shifted = np.zeros_like(island)
        shifted[:, : w - d] = island[:, d:]
        grown |= shifted & (dx >= d)[:, None]
    return grown
# New land alone is a strip too narrow for a 212px plot, so each new plot also
# gets a clearing felled around it. Clearing pine to open a quarry and fence a
# pasture is what a village would actually do, and it is the other half of
# "not in the water or the forest".
# Sized by measurement, not by eye. A plot needs ~106px of clearance from the
# nearest tree or waterline; growth alone got the widest open patch from 26px to
# 81px, still short. At rx 0.150 both new plots clear 117px and 116px.
CLEARINGS = [
    (0.230, 0.318, 0.150, 0.085),
    (0.215, 0.470, 0.150, 0.082),
]


def _ellipse_mask(spec, w, h, np):
    im = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(im)
    for cx, cy, rx, ry in spec:
        d.ellipse([(cx - rx) * w, (cy - ry) * h, (cx + rx) * w, (cy + ry) * h], fill=255)
    return np.array(im) > 127


def expand_island(out, island, tree, shore, np, ndimage):
    """Push the west coast seaward, and fell the two clearings.

    Returns (painted array, grown island mask, open-ground mask).

    The new land is not invented from nothing: its grass is tiled from a block of
    the plate's OWN interior, already pre-graded, so it arrives in the same
    palette and at the same texture scale as the ground it joins. A rock-and-sand
    fringe is derived from the grown coastline the same way the original beach
    was, and the west edge is shaded down because the plate is lit from the top
    right. What the sampler then has to do is blend a seam, not imagine a
    headland.
    """
    h, w = island.shape
    # NO closing on the union. Closing it fills every small concavity along a
    # coastline that is deliberately speckled with boulders, so `fresh` came
    # back with a thin fringe right round the island and the rock edging below
    # drew a jagged brown staircase over the whole thing.
    grown = _grow_west(island, np)
    fresh = grown & ~island
    zone = ndimage.binary_dilation(fresh, iterations=18)   # the only region touched

    # --- new ground. An earlier version tiled a block of the plate's interior to
    # borrow its texture, and tiled its cart tracks and pine trees along with it —
    # repeating path fragments across the headland. The sampler adds real texture
    # at denoise 0.55, so a clean graded fill is both safer and enough.
    xx = np.arange(w)[None, :] / w
    rng = np.random.default_rng(20260730)
    grain = rng.normal(0.0, 0.028, (h, w))[..., None]
    shade = np.clip(0.82 + 0.26 * xx, 0.0, 1.06)[..., None]   # lit from the top right
    ground = np.array(TARGET["grass"], np.float32) * (shade + grain)
    out = np.where(fresh[..., None], np.clip(ground, 0, 255), out)

    # --- the new coast gets the same rock-then-sand edge as the old one, and
    # ONLY the new coast: both bands are masked to the lobe zone.
    rim = ndimage.binary_dilation(grown, iterations=2) & ~ndimage.binary_erosion(grown, iterations=5)
    beach = ndimage.binary_erosion(grown, iterations=6) & ~ndimage.binary_erosion(grown, iterations=17)
    out = np.where((beach & zone & fresh)[..., None], np.array(TARGET["sand"], np.float32) * 0.97, out)
    out = np.where((rim & zone)[..., None], np.array(TARGET["rock"], np.float32) * 0.92, out)

    # --- the old west shore is now inland, so its boulders and beach have to go
    inland = zone & island & ~ndimage.binary_dilation(~grown, iterations=20)
    out = np.where((inland & shore)[..., None], np.clip(ground, 0, 255), out)

    # --- fell the clearings: pine becomes meadow
    felled = _ellipse_mask(CLEARINGS, w, h, np) & grown & tree
    out = np.where(felled[..., None], np.array(TARGET["grass"], np.float32) * 0.97, out)

    # --- dress the new land. Left as a smooth graded fill it rendered as a flat
    # pale plateau even at denoise 0.65: the rest of the island gives Canny
    # hundreds of edges from trees, tracks and boulders, and the headland gave it
    # none, so the sampler had nothing to elaborate and simply smoothed it. The
    # same failure as the first generated island, for the same reason.
    out = _dress(out, fresh, ndimage, np)

    open_ground = grown & ~(tree & ~felled)
    return out, grown, open_ground


def _dress(out, fresh, ndimage, np):
    """Scatter pine, scrub and boulders across the new headland."""
    import random

    h, w = fresh.shape
    rng = random.Random(20260731)
    im = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im, "RGBA")
    inner = ndimage.binary_erosion(fresh, iterations=16)
    coastal = fresh & ~ndimage.binary_erosion(fresh, iterations=11)
    yy = np.arange(h)[:, None] / h

    for zone, n, rad, colour in (
        (inner & (yy < 0.40), 26, 13, (*TARGET["tree"], 255)),      # pine, blending north
        (inner, 55, 9, (118, 136, 84, 210)),                        # scrub clumps
        (inner, 70, 5, (150, 164, 108, 170)),                       # tussocks
        (coastal, 40, 7, (*TARGET["rock"], 235)),                   # shore boulders
    ):
        ys, xs = np.nonzero(zone)
        if not len(xs):
            continue
        for i in rng.sample(range(len(xs)), min(n, len(xs))):
            x, y = int(xs[i]), int(ys[i])
            r = rad * (1 + 0.4 * (rng.random() * 2 - 1))
            d.ellipse([x - r, y - r * 0.7, x + r, y + r * 0.7], fill=colour)
    return np.array(im).astype(np.float32)[..., :3]


def carve_new_plots(out, open_ground, lum, np, ndimage):
    """Cut a pasture and a quarry into the plate, each joined to the roads.

    Drawn on the PRE-GRADED array, in the palette the rest of the plate now
    wears, so the sampler only has to make them painterly — it is not being
    asked to invent them from a prompt, which is what put a lake on a building
    plot the first time round.

    The plot is SNAPPED inland before anything is drawn. Both new anchors were
    chosen against a top-down sketch, and on the real plate the quarry's landed
    on the west shore boulders and the shelter's inside the pine forest — the
    first attempt drew both as ellipses hanging half over open water. A distance
    transform gives the nearest position where the whole plot fits on land, and
    the moved coordinates are reported so town-layout.ts can be updated to match.
    """
    from PIL import ImageFilter

    h, w = lum.shape
    edge = ndimage.distance_transform_edt(open_ground)
    im = Image.fromarray(np.clip(out, 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(im, "RGBA")
    edit = Image.new("L", (w, h), 0)
    ed = ImageDraw.Draw(edit)
    moved: dict[str, tuple[float, float]] = {}

    for name, (kind, toward) in sorted(NEW_PLOTS.items()):
        x, y, bw = ANCHORS[name]
        # Plots on this plate run about 2:1 — the ground plane is foreshortened,
        # so a circular clearing reads as an ellipse.
        rx, ry = bw * w * 0.62, bw * w * 0.31

        fits = edge > rx * 0.92
        ys, xs = np.nonzero(fits)
        if len(xs):
            j = int(np.argmin((xs - x * w) ** 2 + ((ys - y * h) * 1.6) ** 2))
            cx, cy = float(xs[j]), float(ys[j])
        else:
            cx, cy = x * w, y * h
        moved[name] = (cx / w, cy / h)

        # --- the lane first, so the plot's apron covers where it lands
        tx, ty, _ = ANCHORS[toward]
        d.line([(cx, cy + ry * 0.7), (tx * w, ty * h)], fill=(*TARGET["sand"], 90),
               width=max(9, int(bw * w * 0.22)))
        d.line([(cx, cy + ry * 0.7), (tx * w, ty * h)], fill=(*TARGET["sand"], 215),
               width=max(5, int(bw * w * 0.13)))

        if kind == "pasture":
            # A cleared, grazed field: grass a shade lighter than the woods it
            # replaces, ringed by a pale post-and-rail fence.
            d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=(150, 166, 108, 255))
            for k in range(-3, 4):                      # grazing strips
                oy = cy + k * ry * 0.24
                span = rx * max(0.0, 1 - (k / 4.0) ** 2) ** 0.5
                d.line([(cx - span, oy), (cx + span, oy)], fill=(163, 177, 118, 110), width=5)
            d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry],
                      outline=(208, 194, 158, 235), width=4)
        else:
            # A worked stone cut: terraces stepping down to a flat working floor,
            # each ring paler, since freshly exposed rock is lighter than
            # weathered. The dark rim reads as the lip of the pit.
            for fx, tint in ((1.0, 112), (0.72, 140), (0.46, 170)):
                d.ellipse([cx - rx * fx, cy - ry * fx, cx + rx * fx, cy + ry * fx],
                          fill=(tint, int(tint * 0.87), int(tint * 0.67), 255))
                d.ellipse([cx - rx * fx, cy - ry * fx, cx + rx * fx, cy + ry * fx],
                          outline=(84, 70, 54, 190), width=3)
            d.ellipse([cx - rx * 0.34, cy + ry * 0.18, cx + rx * 0.34, cy + ry * 0.55],
                      fill=(192, 178, 150, 190))       # rubble and spoil

        ed.ellipse([cx - rx * 1.06, cy - ry * 1.12, cx + rx * 1.06, cy + ry * 1.12], fill=255)

    # Feather ONLY the new work back into its surroundings. The first version
    # blurred a mask barely larger than the fill, so the plots kept a hard rim
    # and read as stickers laid on the ground rather than cut into it.
    m = (np.array(edit.filter(ImageFilter.GaussianBlur(22))).astype(np.float32) / 255)[..., None]
    return np.array(im).astype(np.float32)[..., :3] * m + out * (1 - m), moved


def pregrade(dest: Path) -> Path:
    """Repaint the plate into the buildings' palette BEFORE sampling.

    The sweep held structure beautifully and moved the colour almost not at all:
    at denoise 0.45-0.55 the base image decides the palette, so neither the
    prompt nor the style board can outvote a full-frame photoreal render. Push
    the denoise up instead and the model starts inventing (0.70 turned every
    pine rust-orange).

    So the palette goes in the BASE. Each region is segmented by its own colour,
    then re-tinted to a building material while keeping its luminance detail —
    every rock, wave and cart track survives, wearing a different colour. What
    the sampler then has to do is make it painterly, which is a job it can do at
    a denoise low enough to keep the perspective.
    """
    import numpy as np
    from scipy import ndimage

    a = np.array(Image.open(PLATE).convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = 0.299 * r + 0.587 * g + 0.114 * b
    h, w = lum.shape
    yy = np.arange(h)[:, None] / h

    blue = b - np.maximum(r, g)
    green = g - np.maximum(r, b)
    sat = a.max(2) - a.min(2)

    # Sky is decided by POSITION, not brightness. Keying it on luminance left the
    # dark top of the gradient behind as a band that read like a distant
    # mountain ridge, and dropped the sun — the brightest, least blue pixels in
    # the frame — into the rock bucket, which tinted it brown. The only thing
    # that legitimately breaks the sky band is the treeline, which is dark.
    horizon = 0.215                                   # measured off the plate
    sky = (yy < horizon) & ~((green > 10) & (lum < 145))
    sun = sky & (lum > 195)

    # Foam is keyed on brightness alone, ahead of every land class. Left to the
    # green test it went to `grass`, which ringed the whole island in a lime
    # fringe — and did the same to the sun's glow.
    surf = ~sky & (lum > 192) & (sat < 62) & (r < b + 22)
    sea = (blue > 12) & ~sky & ~surf

    # An explicit island mask, so land classes cannot claim water pixels. Closing
    # then opening removes the foam speckle that otherwise punches holes in it.
    island = ndimage.binary_opening(
        ndimage.binary_closing(~(sky | sea | surf), iterations=4), iterations=3)

    sand = island & (r > b + 25) & (lum > 120) & (green < 30)
    tree = island & (green > 6) & (lum < 95)
    grass = island & (green > 2) & ~tree & ~sand
    rock = island & ~(sand | tree | grass)

    # Per-region highlight range. Water was the reason this had to be per-region:
    # a shared 1.75 ceiling let the sun-glitter multiply the muted teal into
    # bright cyan, which is the exact tropical blue being removed.
    SPREAD = {"sea": (0.72, 1.18), "surf": (0.85, 1.15), "sky": (0.80, 1.20),
              "sun": (0.95, 1.35), "tree": (0.55, 1.55)}
    KEEP = {"sea": 0.05, "surf": 0.05, "sky": 0.05, "sun": 0.0}

    out = a.copy()
    for name, mask in (("sky", sky), ("sun", sun), ("sea", sea), ("surf", surf),
                       ("sand", sand), ("rock", rock), ("grass", grass), ("tree", tree)):
        if not mask.any():
            continue
        # Scale the target by each pixel's luminance relative to its region's
        # mean. Texture is carried entirely by that ratio, so nothing is lost.
        lo, hi = SPREAD.get(name, (0.45, 1.75))
        ratio = (lum[mask] / max(1.0, float(lum[mask].mean())))[:, None]
        ratio = np.clip(ratio, lo, hi) ** 0.85
        tinted = np.clip(np.array(TARGET[name], np.float32) * ratio, 0, 255)
        # A little of the original chroma back, so regions keep some variation
        # rather than reading as flat colour fills. Water keeps almost none —
        # its original chroma IS the tropical blue.
        keep = KEEP.get(name, 0.13)
        out[mask] = tinted * (1 - keep) + a[mask] * keep

    out, grown, open_ground = expand_island(out, island, tree, sand | rock, np, ndimage)
    out, moved = carve_new_plots(out, open_ground, lum, np, ndimage)
    Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)).save(dest)
    for name, (nx, ny) in sorted(moved.items()):
        ox, oy, _ = ANCHORS[name]
        print(f"  plot cut for {name}: anchor {ox:.3f},{oy:.3f} -> {nx:.3f},{ny:.3f}")
    (dest.parent / "_moved_anchors.json").write_text(
        __import__("json").dumps({k: [round(v[0], 4), round(v[1], 4)] for k, v in moved.items()},
                                 indent=2), encoding="utf-8")
    print(f"pregraded: {dest}")
    return dest


def restyle(denoise: float, ipa: float, strength: float, cn_end: float, tag: str,
            base: Path | None = None) -> Path:
    src = upload_image(base or PLATE, f"_map_plate_{(base or PLATE).stem}.png")
    board = upload_image(BOARD, "_map_board.png")
    graph = build_graph(
        CHECKPOINTS[LOCKED_CHECKPOINT], PROMPT,
        (ipa, LOCKED_IPA_TYPE) if ipa > 0 else None, src, board,
        (W, H), NEGATIVE, cn_end, (50, 130),
    )
    graph["7"]["inputs"]["strength"] = strength
    graph["21"] = {"class_type": "LoadImage", "inputs": {"image": src}}
    graph["23"] = {"class_type": "ImageScale", "inputs": {
        "image": ["21", 0], "upscale_method": "lanczos",
        "width": W, "height": H, "crop": "disabled"}}
    graph["22"] = {"class_type": "VAEEncode", "inputs": {"pixels": ["23", 0], "vae": ["1", 2]}}
    graph["3"]["inputs"]["image"] = ["23", 0]  # Canny reads the same scaled plate
    graph["9"]["inputs"]["latent_image"] = ["22", 0]
    graph["9"]["inputs"]["denoise"] = denoise

    dest = OUT / f"map_{tag}.png"
    dest.write_bytes(queue_and_wait(graph))
    print(f"  {dest.name}  denoise {denoise}  ipa {ipa}  cn {strength}/{cn_end}")
    return dest


def verify(plate: Path, dest: Path, state: str = "l3") -> Path:
    """Real sprites on the restyled plate, at the real anchors."""
    import json

    out = Image.open(plate).convert("RGBA")
    w, h = out.size
    moved_file = OUT / "_moved_anchors.json"
    moved = json.loads(moved_file.read_text(encoding="utf-8")) if moved_file.exists() else {}
    anchors = {k: (moved.get(k, [v[0], v[1]])[0], moved.get(k, [v[0], v[1]])[1], v[2])
               for k, v in ANCHORS.items()}
    missing = []
    for name, (x, y, bw) in sorted(anchors.items(), key=lambda kv: kv[1][1]):
        src = SPRITES / f"{name}{'' if state == 'l1' else f'_{state}'}.png"
        if not src.exists():
            src = SPRITES / f"{name}.png"
        if not src.exists():
            missing.append(name)
            continue
        sp = Image.open(src).convert("RGBA")
        tw = max(1, int(bw * w))
        sp = sp.resize((tw, max(1, round(sp.height * tw / sp.width))), Image.LANCZOS)
        out.alpha_composite(sp, (int(x * w - sp.width / 2), int(y * h - sp.height * 0.62)))
    out.convert("RGB").save(dest)
    print(f"verify: {dest}  ({len(ANCHORS) - len(missing)} placed"
          + (f", no sprite for {', '.join(missing)}" if missing else "") + ")")
    return dest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--anchors", action="store_true", help="overlay the layout on the plate")
    ap.add_argument("--pregrade", action="store_true", help="only write the palette-mapped base")
    ap.add_argument("--raw", action="store_true", help="sample the shipped plate, skipping the pregrade")
    ap.add_argument("--sweep", action="store_true", help="four candidates + a contact sheet")
    ap.add_argument("--verify", type=Path, default=None)
    ap.add_argument("--state", default="l3")
    ap.add_argument("--denoise", type=float, default=0.55)
    # Off by default. The only style board available is the BUILDING guide, and
    # at every weight tested it painted cottages onto the plate — more of them
    # the harder it pushed. The pregrade already carries the palette.
    ap.add_argument("--ipa", type=float, default=0.0)
    ap.add_argument("--strength", type=float, default=0.90, help="ControlNet strength")
    ap.add_argument("--end", type=float, default=0.85, help="ControlNet release")
    ap.add_argument("--tag", default="restyle")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    if args.anchors:
        anchors_overlay(OUT / "_anchors_on_plate.png")
        return
    graded = OUT / "_plate_pregraded.png"
    if args.pregrade:
        pregrade(graded)
        return
    base = None if args.raw else pregrade(graded)
    if args.verify:
        verify(args.verify, OUT / f"_placement_{args.verify.stem}.png", args.state)
        return

    if not args.sweep:
        restyle(args.denoise, args.ipa, args.strength, args.end, args.tag, base)
        return

    # Two axes only: how much freedom to repaint, and how hard the style board
    # pushes. Structure is not swept — it is held at 0.90/0.85 throughout,
    # because losing a cart track is worse than any styling gain.
    made = []
    for denoise, ipa in ((0.45, 0.0), (0.55, 0.0), (0.45, 0.30), (0.55, 0.30)):
        tag = f"g{denoise}_i{ipa}"
        try:
            made.append((f"denoise {denoise} · board {ipa}",
                         restyle(denoise, ipa, args.strength, args.end, tag, base)))
        except Exception as e:  # noqa: BLE001 — one bad draw must not kill the sweep
            print(f"  {tag} FAILED: {e}")
    if made:
        made.insert(0, ("PRE-GRADED base", graded))
        made.insert(0, ("ORIGINAL (shipped)", PLATE))
        sheet = OUT / "map_restyle_sweep.png"
        contact_sheet(made, sheet, cols=5)
        print(f"\nsheet: {sheet}")


if __name__ == "__main__":
    main()
