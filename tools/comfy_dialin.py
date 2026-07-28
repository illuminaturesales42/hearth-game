"""
Hearth building-art STYLE DIAL-IN rig.

Renders one building (the Forge L1 artist cell) across a sweep of candidate
recipes and lays the results out on a labelled contact sheet, so the winning
recipe is picked by eye BEFORE any batch render time is committed.

Why this exists
---------------
The 2026-07-26 building attempts had two separate problems. Geometry was
largely solved by the Canny-locked workflow (docs/comfy-building-worksheet.md:
strength 0.95, end_percent 0.72, seed 777777, txt2img denoise 1.0) — that
spine is LOCKED here and not swept. What was never solved is STYLE: the
buildings were generated with a different checkpoint, a different prompt
dialect ("ink and pencil linework") and a different palette from the 288
avatar portraits, and the only installed IPAdapter was face-trained.

So this rig sweeps exactly the style axes:
  * checkpoint       RealVisXL_V5.0 (what the portraits used) vs Juggernaut-XL_v9
  * prompt dialect   portrait-derived painterly vs the worksheet's ink block
  * IPAdapter        off / style transfer / style transfer precise, 2 weights,
                     referencing a STYLE BOARD composited from the real
                     portrait catalogue — i.e. literally "match the avatars"

Server-directory safety
-----------------------
The live :8188 server may be Comfy Desktop, whose input/output dirs are NOT
F:\\sandbox\\sulphur-2\\ComfyUI\\{input,output} (every older Hearth script
hardcodes those and silently breaks). This driver never touches server paths:
references go up through POST /upload/image and results come back through
GET /view. It works against whichever ComfyUI is listening.

Usage
-----
  python tools/comfy_dialin.py                    # the full sweep + contact sheet
  python tools/comfy_dialin.py --sheet-only       # re-lay the sheet from existing PNGs

Production, now that a recipe has been picked (see WINNER below). Use the
ComfyUI venv interpreter so --cutout can reach rembg:

  F:/sandbox/sulphur-2/ComfyUI/venv/Scripts/python.exe tools/comfy_dialin.py \
      --subject bakery --winner --cutout

...which renders with the approved recipe and writes a transparent, cropped,
game-scale sprite to tools/comfy_out/cutout/ in the same pass.

Nothing runs until you invoke this script yourself.
"""

from __future__ import annotations

import argparse
import io
import json
import mimetypes
import time
import urllib.parse
import urllib.request
import uuid
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

COMFY_URL = "http://127.0.0.1:8188"
REPO = Path(__file__).resolve().parent.parent
OUT_DIR = REPO / "tools" / "comfy_out" / "dialin"
CATALOGUE = Path(r"F:\sandbox\sulphur-2\ComfyUI\output\catalogue")
# Canny reference cells, mirrored in the repo by the earlier canny run.
REFCELLS = REPO / "tools" / "comfy_out" / "refcells_canny"
REFCELLS_FALLBACK = Path(r"F:\sandbox\sulphur-2\ComfyUI\input")

# ---------------------------------------------------------------- locked spine
# From docs/comfy-building-worksheet.md §3. NOT swept — geometry is a solved
# problem and re-opening it would confound the style comparison.
SEED = 777777
STEPS = 40
CFG = 7.0
SAMPLER = "dpmpp_2m"
SCHEDULER = "karras"
CN_MODEL = "controlnet-canny-sdxl.safetensors"
CN_STRENGTH = 0.95
CN_END = 0.72
# Released later for ruins. At 0.72 the model had enough freedom to replace
# the artist's low broken wall stubs with a tall dramatic arch; 0.86 keeps the
# silhouette honest. Built states keep 0.72 — they need the slack to resolve
# door and window detail (worksheet §6).
CN_END_RUIN = 0.86
CANNY_LOW, CANNY_HIGH, CANNY_RES = 100, 200, 1024
# Lower thresholds for ruins. At 100/200 a broken wall's INTERIOR comes out
# blank — the edge map is an outline around an empty triangle, so the model
# reasonably paints a void and invents an arch to frame it. At 30/90 the stone
# coursing survives (3.2% -> 6.0% edge pixels) and the wall reads as solid
# masonry. Built states keep 100/200: they have real openings, and extra edges
# there just fight the door/window detail the release at 0.72 is meant to
# resolve.
CANNY_RUIN = (30, 90)

# ---------------------------------------------------------------- THE STYLE
# Constrained after the Building Style Guide pass. These three strings are the
# style contract every building shares — change them here and the whole
# catalogue moves together. Only SUBJECT_CLAUSES below vary per building.
#
# STONE_FORWARD exists because the first guide pass came out timber-forward
# (a framed workshop) while the guide leads with stonework and uses timber as
# trim. Leading with the walls and demoting the beams pulls it back.
STONE_FORWARD = (
    "(walls are predominantly stone masonry, timber used only as trim, braces "
    "and door frames:1.25)"
)
# The guide's ruins are restrained: grey stone, green moss. Ours grew yellow
# flowering scrub because "mossy / weeds growing through the rubble" reads as
# wildflowers. Named greens, and the flowers pushed to the negative.
MOSS_GREEN = "soft green moss and grey lichen on the stone, muted sage green"
FLOWER_NEG = (
    "yellow flowers, flowering scrub, wildflowers, blossom, golden foliage, "
    "autumn colours, orange shrubs, bright yellow"
)

# Per-building subject clause. The reference cell carries shape, so these say
# only what the building IS and what identifies it at a glance.
SUBJECT_CLAUSES = {
    # Identifying props called out individually and positively — a blacksmith
    # must read as a blacksmith at 320px. The hanging sign carries a HAMMER
    # SYMBOL rather than a name: SDXL cannot write, and asking for lettering
    # reliably produces the illegible scribble that spoiled the first bakery.
    "blacksmith": (
        "a village blacksmith's forge with a tall rounded stone chimney, a "
        "glowing orange furnace opening, (a heavy dark iron anvil on a timber "
        "block standing clear of the doorway:1.25), (a hanging wrought-iron "
        "bracket sign bearing one bold simple hammer symbol, a plain pictogram "
        "with no letters and no words:1.3), horseshoes and blacksmith tongs "
        "hung on the wall, a water quenching barrel"
    ),
    "bakery": "a village bakery with a domed stone oven and its own chimney, a flour sack and a bread paddle by the door",
    "cottage": "a small stone cottage with a warm lit window, (a low garden wall with flower boxes under the window:1.2), a plain plank door, a rounded stone chimney with curling smoke",
    "workshop": "a craftsman's workshop with a wide timber-braced work opening, (a sturdy workbench with hand tools and curled wood shavings:1.25), (a hanging bracket sign bearing one bold saw pictogram, no letters and no words:1.3)",
    "quarry": "a stone quarry works with a cut rock face, (a tall timber winch frame with rope and pulley over the cut:1.3), (stacked dressed stone blocks and a loaded hand cart:1.25), chisels and stone dust",
    "market": "an open market stall building with (a striped awning over trestle tables:1.3), (crates of produce, hanging baskets and a barrel:1.25), a brass balance scale on the counter",
    "library": "a village library with (tall arched windows with leaded panes:1.25), a stone entry porch, (a hanging bracket sign bearing one bold open-book pictogram, no letters and no words:1.3), ivy climbing the wall",
    "townhall": "a village town hall with (a small bell tower with a visible bronze bell:1.3), (a wide stone stair with an iron railing:1.2), a hanging banner with a plain crest shape, no letters and no words",
    "postoffice": "a village post office with (a hanging bracket sign bearing one bold post-horn pictogram, no letters and no words:1.3), (a brass letter slot and a small shuttered counter window:1.25), a canvas mail sack by the door",
    "farm": "a meadow farmhouse with (a low stone barn with wide timber doors:1.25), (stacked hay bales and a post-and-rail paddock fence:1.25), a wooden water trough",
    "fisherhut": "a fisher's hut on stone footings with (fishing nets and cork floats hung to dry:1.3), (a timber drying rack:1.2), crab pots and coiled rope",
    "dock": "a stone and timber dock building on plank boards with (heavy mooring posts and coiled rope:1.3), (stacked cargo crates and barrels:1.25), a hanging harbour lantern",
    "sawmill": "a sawmill with a timber cutting frame, a stacked log pile and sawn planks",
    "garden": "a walled garden building with (a glasshouse roof of leaded glass panes:1.3), (raised planting beds with vegetables and climbing greenery:1.25), terracotta pots and a watering can",
    "well": "a round stone well with (a timber winch roof on four posts:1.3), (a wooden bucket on a rope above the worn stone rim:1.3), a cobbled surround",
    "lighthouse": "a stone lighthouse tower with (a glowing glazed lamp room at the top:1.35), (a railed iron gallery below the lamp:1.2), a keeper's door at the base, rocks at the footing",
    # New building for the expanded map — not wired into the game yet (no
    # town-layout anchor, no story), but its reference cells are cut so the art
    # can be developed alongside the rest of the catalogue.
    "animalshelter": "a village animal shelter with (a low stone barn with a wide timber door:1.25), (a timber pen fence with hay bales and a water trough:1.3), a bell hung on a post",
}

# Materials per building, all drawn from the guide's sampled swatches. The roof
# and timber values are deliberately IDENTICAL across the catalogue — that
# shared palette is what makes fourteen separate renders read as one village.
GUIDE_ROOF = "teal slate roof tiles #45625e #355654"
GUIDE_TIMBER = "rich brown timber trim #7b4a23 #be8551, copper accents"
GUIDE_STONE = "warm grey-brown fieldstone walls #897153 #b1926b"
MATERIALS = {
    b: f"{GUIDE_ROOF}, {GUIDE_STONE}, {GUIDE_TIMBER}" for b in SUBJECT_CLAUSES
}
MATERIALS["bakery"] = f"{GUIDE_ROOF}, warm cream plaster over stone #c79867, {GUIDE_TIMBER}"
MATERIALS["lighthouse"] = f"{GUIDE_ROOF}, pale whitewashed stone tower #c8bda6, {GUIDE_TIMBER}"
MATERIALS["sawmill"] = f"{GUIDE_ROOF}, stone footings #897153 with plank cladding, {GUIDE_TIMBER}"


def subject_spec(building: str) -> dict:
    """Clause + reference cell + latent size for a building.

    The latent MUST match the reference cell's aspect or the edge map gets
    rescaled and the structure lock loosens — so the size is READ from the
    cell on disk rather than hardcoded (cells differ per building).
    """
    if building not in SUBJECT_CLAUSES:
        raise SystemExit(f"No subject clause for '{building}'. Known: {', '.join(sorted(SUBJECT_CLAUSES))}")
    cell = f"{building}_ref_l1.png"
    size = (1024, 848)
    try:
        with Image.open(find_refcell(cell)) as im:
            size = im.size
    except SystemExit:
        pass  # caller will fail on the missing cell with a clearer message
    return {"cell": cell, "size": size, "clause": SUBJECT_CLAUSES[building]}


# Back-compat for callers that index SUBJECTS directly.
SUBJECTS = {b: {"cell": f"{b}_ref_l1.png", "clause": c} for b, c in SUBJECT_CLAUSES.items()}
STATE_L1 = (
    "newly rebuilt, clean plain honest stonework, simple sound roof, one "
    "window warmly lit, modest and bare but cared for"
)

# ------------------------------------------------------------- prompt dialects
# Shared tail: the three clauses §1b added after the first pass found a
# floating sign and a garbled door. They fixed real defects — keep in BOTH
# dialects so the comparison isolates style, not glitch-proofing.
# Split into parts because two of the three are WRONG for a ruin. Applying all
# three to every state produced a bakery "ruin" with a pristine hinged door in
# a tall intact arch — the door clause (1.35) and the soundness clause (1.3)
# were doing exactly what they were told, on a state that needs the opposite.
FIX_DOORS = (
    "(clearly defined wooden doors and windows with visible planks, iron hinges "
    "and simple frames, set squarely inside their stone openings:1.35)"
)
FIX_SOUND = (
    "(structurally sound, every part properly joined and supported, signs and "
    "brackets firmly bolted, nothing floating or detached:1.3)"
)
# This one applies everywhere — and is the lever against renders drifting
# photoreal, which the ruin did badly.
FIX_2D = (
    "(hand-drawn illustrated 2D game asset, flat painted shapes, simplified "
    "stylised stonework, NOT a photograph, NOT a physical object, NOT a "
    "miniature, NOT sitting on a real surface, no photographic texture, no "
    "depth of field, no blur:1.45)"
)
# What a ruin needs instead: openings that are genuinely empty, and a structure
# that is genuinely broken and LOW rather than a dramatic standing arch.
FIX_RUINED = (
    "(doorways and windows are empty broken openings, no door leaf, no glass, "
    "no intact joinery:1.4), (low broken-off wall stubs at varying heights, "
    "collapsed and incomplete, rubble where walls have fallen:1.3)"
)
FIX_CLAUSES = f"{FIX_DOORS}, {FIX_SOUND}, {FIX_2D}"  # built states
FIX_CLAUSES_RUINED = f"{FIX_RUINED}, {FIX_2D}"  # ruin (and the shell of a wip)


def materials_for(building: str, state: str) -> str:
    """Materials for a state. A RUIN HAS NO ROOF — naming the teal roof tiles
    there gave the model a teal it had to put somewhere, and it put it on the
    stonework: the sawmill ruin came out uniformly teal-green. Ruins get bare
    weathered stone and the timber that would actually survive, no roof colour.
    """
    if state == "wip":
        return (
            "raw unfinished stonework, fresh pale new-cut timber scaffolding, "
            f"{GUIDE_STONE}, no roof yet"
        )
    if state != "ruin":
        return MATERIALS[building]
    return (
        f"bare weathered {GUIDE_STONE.replace('walls', 'masonry')}, grey stone "
        "with no roof remaining, weathered brown timber remnants"
    )


def canny_for(ref_path, state: str) -> tuple[int, int]:
    """Lowered thresholds for ruins, default everywhere else.

    Deliberately a flat rule. Two attempts at choosing per-reference — overall
    edge density, then largest blank interior region — failed to separate the
    bakery ruin (which needed the lower thresholds) from the sawmill ruin
    (which looked over-detailed with them), so the heuristic was earning
    nothing but complexity. The sawmill's real defect turned out to be the
    roof-colour bleed that materials_for() now fixes; revisit this only if a
    ruin still looks fussy after that.
    """
    return CANNY_RUIN if state == "ruin" else (CANNY_LOW, CANNY_HIGH)


def fix_for(state: str) -> str:
    """The right structural clauses for a state — ruins need the opposite."""
    return FIX_CLAUSES_RUINED if state == "ruin" else FIX_CLAUSES
FRAMING = (
    "45-degree isometric view, {subject}, standing on its own small cobblestone "
    "plinth with a thin edge of moss and grass, (a plain uncluttered neutral grey "
    "backdrop, no ground plane beyond the plinth, no other buildings, no street, "
    "no sky, no scenery:1.3), (single subject, small and centred with an even "
    "~10% empty margin on all four sides, not a close-up, not filling the frame, "
    "no part of the building touching the frame edge:1.35)"
)

# (A) NEW — the portrait catalogue's own vocabulary, adapted to architecture.
# Every style word here is lifted verbatim from the avatar prompt template so
# the buildings speak the same dialect as the 288 busts.
PROMPT_PAINT = (
    "cosy storybook building illustration, hand-painted digital illustration, "
    "warm painterly brushwork, visible brushstrokes, soft painted colour, "
    "gentle warm rim light from upper left, muted earthy old-seaside colour "
    "palette, driftwood brown cream sage muted teal rust, Emberhollow fishing "
    "village, children's book illustration style, " + FRAMING + ", " + FIX_CLAUSES
)

# (C) GUIDE — the Building Style Guide's own words (`New  Style.png`), with
# hex values SAMPLED from its actual swatches (tools/comfy_style_guide.py;
# parchment false-picks filtered out). This is the sheet speaking for itself.
# The style block, split so the ROOF language can be dropped. A ruin has no
# roof, but the model still has to put the teal somewhere — with roof colour
# named both here and in MATERIALS, the sawmill ruin came out as uniformly
# mint-teal stonework. Removing it from MATERIALS alone changed nothing,
# because this block was still shouting it.
_GUIDE_HEAD = (
    "hand painted cosy warm inviting storybook game asset, soft visible brush "
    "strokes, warm highlights and cool shadows, gentle ambient occlusion, subtle "
    "colour variation, imperfections bring charm, warm light from the top right, "
)
_GUIDE_ROOFY = (
    "emissive warm window glow, teal slate roof tiles, rounded stone chimneys, "
    "timber braces, copper accents, flower boxes and greenery, warm lanterns, "
    "roof palette #45625e #355654 #98472a, "
)
_GUIDE_RUINED = (
    "rounded stone chimneys, timber braces, bare weathered grey stone masonry, "
    "green moss and grey lichen, "
)
_GUIDE_WIP = (
    "rounded stone chimneys, fresh pale new-cut timber scaffolding and ladders, "
    "raw unfinished stonework, open roofless timber framing against open sky, "
)
_GUIDE_TAIL = (
    "wood palette #7b4a23 #885425 #be8551 "
    "#cf9e6b, stone palette #897153 #b1926b #c79867, accent palette #957a3e "
    "#db862f #718c84, lantern light #f9d09b #efae5b #e29330, "
)
PROMPT_GUIDE = _GUIDE_HEAD + _GUIDE_ROOFY + _GUIDE_TAIL + FRAMING + ", {fix}"
PROMPT_GUIDE_RUINED = _GUIDE_HEAD + _GUIDE_RUINED + _GUIDE_TAIL + FRAMING + ", {fix}"
PROMPT_GUIDE_WIP = _GUIDE_HEAD + _GUIDE_WIP + _GUIDE_TAIL + FRAMING + ", {fix}"
# Neither a ruin nor a half-built shell has a roof, so neither may be told
# about roof colour — the model has to put that teal somewhere, and with no
# roof it lands on stonework (ruin) or in the open bays (wip).
ROOFLESS = {"ruin", "wip"}


def guide_prompt(subject: str, state: str = "l1") -> str:
    """The locked guide prompt, with roof language and structural clauses
    appropriate to `state` — ruins drop both."""
    tpl = PROMPT_GUIDE_RUINED if state == "ruin" else PROMPT_GUIDE_WIP if state == "wip" else PROMPT_GUIDE
    return tpl.format(subject=subject, fix=fix_for(state))

# (B) CONTROL — the worksheet's current block, verbatim (§1).
PROMPT_INK = (
    "game asset, warm hand-drawn storybook illustration, confident visible ink "
    "and pencil linework over soft painted colour, clearly hand-illustrated NOT a "
    "digital render, NOT photoreal, NOT a 3D game asset render, NOT CGI, gentle "
    "rim light, palette #EAD7B5 #C79A6B #8FBF8F #6A8CA7 #8E7CC3 #D46B6B #F4F0E6, "
    + FRAMING + ", " + FIX_CLAUSES
)

NEGATIVE = (
    "flat vector, sterile, 3d render, cgi render, plastic, oversaturated, "
    "photograph, product photography, studio photography, diorama, physical model, "
    "miniature model, toy, real wood grain, real material, macro photography, "
    "unreal engine, octane render, modern architecture, photoreal, hyperrealistic, "
    "people, characters, extra structures, multiple buildings, village street, "
    "town square, cropped, low quality, sky, clouds, background scenery, landscape, "
    "checkerboard, gradient background, vignette, ground plane, grass field, "
    "meadow, terrain, drop shadow, close-up, zoomed in, cut off, touching edge of "
    "frame, filling the frame, off-centre, text, watermark, signature, flat "
    "cel-shaded anime, manga, lettering, written words, illegible text, scribbled writing, shop name, painted letters, floating objects, levitating, detached, disconnected, "
    "unsupported, hovering sign, broken geometry, warped, melted, impossible "
    "construction, misaligned door, duplicated door, malformed opening, smeared "
    "detail, mushy shapes, indistinct doorway, photo, wooden shelf, mantel, table "
    "surface, indoor scene, blurry background, depth of field, bokeh, miniature, "
    "diorama, model, figurine, ornament, tilt-shift"
)

CHECKPOINTS = {
    "realvis": "RealVisXL_V5.0.safetensors",  # what the 288 portraits used
    "jugg": "Juggernaut-XL_v9.safetensors",  # what the buildings used
}
PROMPTS = {"paint": PROMPT_PAINT, "ink": PROMPT_INK, "guide": PROMPT_GUIDE}
# label -> (weight, weight_type) or None for the no-adapter control.
# Weight types are exactly those the installed ComfyUI_IPAdapter_plus exposes
# (checked against /object_info — 'style transfer precise' is NOT in this build).
IPA_SETTINGS = {
    "noipa": None,
    "style055": (0.55, "style transfer"),
    "style085": (0.85, "style transfer"),
    "strong070": (0.70, "strong style transfer"),
}
IPA_MODEL = "ip-adapter-plus_sdxl_vit-h.safetensors"
CLIP_VISION = "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"
STYLE_BOARD = "_dialin_style_board.png"

# ---------------------------------------------------------------- THE WINNER
# Picked from the 2026-07-28 sweep contact sheet. RealVisXL (the checkpoint the
# 288 portraits were made on) + the portrait-derived painterly dialect + NO
# IPAdapter.
#
# The sweep's clear finding: aiming an IPAdapter at a board of portraits
# transfers their cream PARCHMENT BACKGROUND, not their brushwork. Every
# adapter cell inherited paper texture, stains and a vignette; at the higher
# weights it invented cloud blobs and sat the building on a wooden plank
# surface — the 'photographed miniature' failure the worksheet warned about.
# Only the no-adapter column renders on a plain backdrop that keys cleanly.
# SUPERSEDED by the Building Style Guide pass — kept for provenance.
WINNER_SWEEP1 = "realvis_paint_noipa"

# ============================ LOCKED PRODUCTION RECIPE ======================
# Approved 2026-07-28 against `Graphics and UI/New  Style.png`.
#   RealVisXL_V5.0 + PROMPT_GUIDE (the guide's own words + its sampled palette)
#   + the guide style board via IPAdapter at 0.45 "style transfer"
#   + the Canny spine (strength 0.95, released 0.72, seed 777777, denoise 1.0)
# Everything the catalogue renders goes through tools/comfy_village.py, which
# reads these. Change them here, nowhere else.
WINNER = "g2_realvis_guide_gb045"
LOCKED_CHECKPOINT = "realvis"
LOCKED_PROMPT = "guide"
LOCKED_IPA_WEIGHT = 0.45
LOCKED_IPA_TYPE = "style transfer"


# ------------------------------------------------------------------ comfy http
def _post_json(path: str, payload: dict, timeout: int = 30) -> dict:
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        f"{COMFY_URL}{path}", data=data, headers={"Content-Type": "application/json"}
    )
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read().decode())


def upload_image(path: Path, name: str) -> str:
    """POST /upload/image — server-dir agnostic reference staging."""
    boundary = f"----hearth{uuid.uuid4().hex}"
    ctype = mimetypes.guess_type(name)[0] or "image/png"
    body = io.BytesIO()
    body.write(f"--{boundary}\r\n".encode())
    body.write(
        f'Content-Disposition: form-data; name="image"; filename="{name}"\r\n'.encode()
    )
    body.write(f"Content-Type: {ctype}\r\n\r\n".encode())
    body.write(path.read_bytes())
    body.write(f"\r\n--{boundary}\r\n".encode())
    body.write(b'Content-Disposition: form-data; name="overwrite"\r\n\r\ntrue\r\n')
    body.write(f"--{boundary}--\r\n".encode())
    req = urllib.request.Request(
        f"{COMFY_URL}/upload/image",
        data=body.getvalue(),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    resp = json.loads(urllib.request.urlopen(req, timeout=60).read().decode())
    sub = resp.get("subfolder") or ""
    return f"{sub}/{resp['name']}" if sub else resp["name"]


def fetch_image(filename: str, subfolder: str, folder_type: str) -> bytes:
    """GET /view — pull the result over HTTP instead of reading server disk."""
    q = urllib.parse.urlencode(
        {"filename": filename, "subfolder": subfolder, "type": folder_type}
    )
    with urllib.request.urlopen(f"{COMFY_URL}/view?{q}", timeout=60) as r:
        return r.read()


def queue_and_wait(graph: dict, save_node: str = "20", timeout: int = 900) -> bytes:
    resp = _post_json("/prompt", {"prompt": graph})
    if resp.get("node_errors"):
        raise RuntimeError(f"node_errors: {resp['node_errors']}")
    prompt_id = resp["prompt_id"]
    start = time.time()
    while time.time() - start < timeout:
        with urllib.request.urlopen(f"{COMFY_URL}/history/{prompt_id}", timeout=15) as r:
            hist = json.loads(r.read().decode())
        if hist:
            entry = hist[prompt_id]
            status = entry.get("status", {})
            if status.get("status_str") == "error":
                raise RuntimeError(f"prompt {prompt_id} errored: {status}")
            outputs = entry.get("outputs", {})
            if save_node in outputs:
                img = outputs[save_node]["images"][0]
                return fetch_image(img["filename"], img.get("subfolder", ""), img.get("type", "output"))
            if status.get("completed"):
                raise RuntimeError(f"prompt {prompt_id} finished without node {save_node}")
        time.sleep(2)
    raise TimeoutError(f"render {prompt_id} did not finish within {timeout}s")


# -------------------------------------------------------------------- the graph
def build_graph(
    ckpt: str, positive: str, ipa, ref_name: str, board_name: str, size,
    negative: str | None = None, cn_end: float | None = None,
    canny: tuple[int, int] | None = None,
) -> dict:
    w, h = size
    negative = negative or NEGATIVE
    cn_end = CN_END if cn_end is None else cn_end
    c_lo, c_hi = canny or (CANNY_LOW, CANNY_HIGH)
    g: dict = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": ckpt}},
        "2": {"class_type": "LoadImage", "inputs": {"image": ref_name}},
        "3": {
            "class_type": "CannyEdgePreprocessor",
            "inputs": {
                "image": ["2", 0],
                "low_threshold": c_lo,
                "high_threshold": c_hi,
                "resolution": CANNY_RES,
            },
        },
        "4": {"class_type": "ControlNetLoader", "inputs": {"control_net_name": CN_MODEL}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": positive, "clip": ["1", 1]}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["1", 1]}},
        "7": {
            "class_type": "ControlNetApplyAdvanced",
            "inputs": {
                "positive": ["5", 0],
                "negative": ["6", 0],
                "control_net": ["4", 0],
                "image": ["3", 0],
                "strength": CN_STRENGTH,
                "start_percent": 0.0,
                "end_percent": cn_end,
            },
        },
        "8": {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "9": {
            "class_type": "KSampler",
            "inputs": {
                "seed": SEED,
                "steps": STEPS,
                "cfg": CFG,
                "sampler_name": SAMPLER,
                "scheduler": SCHEDULER,
                "denoise": 1.0,
                "model": ["1", 0],
                "positive": ["7", 0],
                "negative": ["7", 1],
                "latent_image": ["8", 0],
            },
        },
        "10": {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["1", 2]}},
        "20": {"class_type": "SaveImage", "inputs": {"images": ["10", 0], "filename_prefix": "dialin"}},
    }
    if ipa is not None:
        weight, wtype = ipa
        g["12"] = {"class_type": "IPAdapterModelLoader", "inputs": {"ipadapter_file": IPA_MODEL}}
        g["13"] = {"class_type": "CLIPVisionLoader", "inputs": {"clip_name": CLIP_VISION}}
        g["14"] = {"class_type": "LoadImage", "inputs": {"image": board_name}}
        g["15"] = {
            "class_type": "IPAdapterAdvanced",
            "inputs": {
                "weight": weight,
                "weight_type": wtype,
                "combine_embeds": "concat",
                "start_at": 0.0,
                "end_at": 1.0,
                "embeds_scaling": "V only",
                "model": ["1", 0],
                "ipadapter": ["12", 0],
                "image": ["14", 0],
                "clip_vision": ["13", 0],
            },
        }
        g["9"]["inputs"]["model"] = ["15", 0]
    return g


# --------------------------------------------------------------- style board
def make_style_board(dest: Path) -> Path:
    """A 2x2 grid of real portraits — the literal 'match the avatars' reference.

    Picked across skin tones so the board carries the full palette rather than
    one character's colouring.
    """
    picks = [
        "avatar_c03_skin1_hair03.png",
        "avatar_c06_skin4_hair05.png",
        "avatar_c10_skin3_hair02.png",
        "avatar_c08_skin2_hair01.png",
    ]
    board = Image.new("RGB", (1024, 1024), (236, 220, 182))
    for i, name in enumerate(picks):
        p = CATALOGUE / name
        if not p.exists():
            avail = sorted(CATALOGUE.glob("avatar_c*.png"))
            if not avail:
                raise SystemExit(f"No portraits found in {CATALOGUE}")
            p = avail[i * max(1, len(avail) // 4)]
        im = Image.open(p).convert("RGB").resize((512, 512), Image.LANCZOS)
        board.paste(im, ((i % 2) * 512, (i // 2) * 512))
    dest.parent.mkdir(parents=True, exist_ok=True)
    board.save(dest)
    return dest


def find_refcell(cell: str) -> Path:
    for base in (REFCELLS, REFCELLS_FALLBACK):
        p = base / cell
        if p.exists():
            return p
    raise SystemExit(
        f"Reference cell {cell} not found in {REFCELLS} or {REFCELLS_FALLBACK}.\n"
        "Crop the midday row of the building's sheet in "
        "art-src/Map/Full Building Final/ (see comfy-building-worksheet.md §3)."
    )


# -------------------------------------------------------------- contact sheet
def contact_sheet(paths: list[tuple[str, Path]], dest: Path, cols: int = 4) -> None:
    if not paths:
        raise SystemExit("Nothing rendered — no contact sheet to build.")
    thumb = 420
    label_h = 30
    rows = (len(paths) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * thumb, rows * (thumb + label_h)), (28, 32, 44))
    draw = ImageDraw.Draw(sheet)
    try:
        font = ImageFont.truetype("arial.ttf", 18)
    except OSError:
        font = ImageFont.load_default()
    for i, (label, p) in enumerate(paths):
        im = Image.open(p).convert("RGB")
        im.thumbnail((thumb, thumb), Image.LANCZOS)
        x = (i % cols) * thumb
        y = (i // cols) * (thumb + label_h)
        sheet.paste(im, (x + (thumb - im.width) // 2, y + (thumb - im.height) // 2))
        draw.text((x + 8, y + thumb + 6), label, fill=(255, 214, 138), font=font)
    sheet.save(dest)


# ---------------------------------------------------------------------- main
def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--subject", default="forge", choices=sorted(SUBJECTS))
    ap.add_argument("--only", default=None, help=f"run a single recipe id (the picked one is {WINNER})")
    ap.add_argument("--winner", action="store_true", help=f"shorthand for --only {WINNER}")
    ap.add_argument("--sheet-only", action="store_true", help="rebuild the contact sheet from existing PNGs")
    ap.add_argument(
        "--cutout",
        action="store_true",
        help="also write a transparent game-ready sprite per render (needs the ComfyUI venv interpreter)",
    )
    ap.add_argument(
        "--sweep2",
        action="store_true",
        help="the Building Style Guide sweep: guide/paint prompts x guide-board IPAdapter, TARGET cell on the sheet",
    )
    args = ap.parse_args()
    if args.winner:
        args.only = WINNER

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    subject = SUBJECTS[args.subject]
    positive_subject = f"{subject['clause']} -- {STATE_L1}"

    if args.sweep2:
        # The Building Style Guide sweep. IPAdapter gets a second chance here
        # on different evidence: the guide board is BUILDINGS-on-grey (see
        # comfy_style_guide.matte_panel), so its background signal is the one
        # we actually want — unlike the portrait board, whose parchment it
        # faithfully reproduced.
        combos = [("noipa", None), ("gb045", (0.45, "style transfer")), ("gb070", (0.70, "style transfer"))]
        recipes = [
            (f"g2_{ck}_{pr}_{ia}", CHECKPOINTS[ck], (PROMPTS[pr].format(subject=positive_subject, fix=FIX_CLAUSES) if pr == "guide" else PROMPTS[pr].format(subject=positive_subject)), ipa)
            for ck in CHECKPOINTS
            for pr in ("guide", "paint")
            for ia, ipa in combos
        ]
    else:
        recipes = [
            (f"{ck}_{pr}_{ia}", CHECKPOINTS[ck], (PROMPTS[pr].format(subject=positive_subject, fix=FIX_CLAUSES) if pr == "guide" else PROMPTS[pr].format(subject=positive_subject)), IPA_SETTINGS[ia])
            for ck in CHECKPOINTS
            for pr in ("paint", "ink")
            for ia in IPA_SETTINGS
        ]
    if args.only:
        recipes = [r for r in recipes if r[0] == args.only]
        if not recipes:
            raise SystemExit(f"No recipe named {args.only}")

    prefix = "" if args.subject == "forge" else f"{args.subject}_"

    if not args.sheet_only:
        if args.sweep2:
            board_path = OUT_DIR.parent / "_guide_board_prog.png"
            if not board_path.exists():
                raise SystemExit("Guide board missing — run tools/comfy_style_guide.py first.")
        else:
            board_path = make_style_board(OUT_DIR / "_style_board.png")
        board_name = upload_image(board_path, STYLE_BOARD)
        ref_name = upload_image(find_refcell(subject["cell"]), f"_dialin_{subject['cell']}")
        print(f"staged refs: {ref_name}, {board_name}")

        for i, (rid, ckpt, positive, ipa) in enumerate(recipes, 1):
            dest = OUT_DIR / f"{prefix}{rid}.png"
            if dest.exists():
                print(f"[{i}/{len(recipes)}] {rid} exists, skipping")
                continue
            graph = build_graph(ckpt, positive, ipa, ref_name, board_name, subject["size"])
            t0 = time.time()
            try:
                dest.write_bytes(queue_and_wait(graph))
            except Exception as e:  # noqa: BLE001 — one bad recipe must not kill the sweep
                print(f"[{i}/{len(recipes)}] {rid} FAILED: {e}")
                continue
            print(f"[{i}/{len(recipes)}] {rid} -> {dest.name}  ({time.time() - t0:.0f}s)")

    found = [(r[0], OUT_DIR / f"{prefix}{r[0]}.png") for r in recipes]
    found = [(lbl, p) for lbl, p in found if p.exists()]
    if args.sweep2:
        target = OUT_DIR.parent / "_guide_target_l1.png"
        if target.exists():
            found.insert(0, ("TARGET — style guide L1", target))

    if args.cutout:
        # generate -> transparent sprite in one command. Imported lazily so a
        # plain sweep never needs rembg.
        from comfy_cutout import cutout  # noqa: PLC0415 — optional dependency

        cut_dir = REPO / "tools" / "comfy_out" / "cutout"
        cut_dir.mkdir(parents=True, exist_ok=True)
        for lbl, p in found:
            if lbl.startswith("TARGET"):
                continue
            im, stats = cutout(p, 320, 6)
            dest = cut_dir / f"{prefix}{lbl}.png"
            im.save(dest)
            ok = max(stats["corners"]) == 0
            print(f"  cutout {dest.name}  {stats['size']}  corners {'clear' if ok else stats['corners']}")

    sheet = OUT_DIR / f"{prefix}{'g2_' if args.sweep2 else ''}contact_sheet.png"
    contact_sheet(found, sheet)
    print(f"\ncontact sheet: {sheet}  ({len(found)} cells)")


if __name__ == "__main__":
    main()
