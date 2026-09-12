#!/usr/bin/env python3
"""
ComfyUI batch generator for Hearth's town art: the island map (4 time-of-day
plates) and every building (5 story states x 4 time-of-day phases each).

Same style-transfer technique as the avatar-portrait catalogue (see
F:/sandbox/sulphur-2/ComfyUI/output/catalogue): RealVisXL_V5.0 + IPAdapter
referencing an existing painted asset, so new art shares the same hand-painted
storybook DNA as the portraits and the game's existing character busts. The
reference image (char_bran_bust_ref.png) is the actual source the portrait
catalogue itself was style-transferred from -- using it here is the most
literal reading of "same style as the portraits".

STRUCTURAL CONSISTENCY ACROSS TIME OF DAY (important):
Each (building, state) generates ONE base image (midday, full txt2img), then
the other 3 phases (dawn/dusk/night) are produced by an img2img "relight" pass
FROM that same base image at moderate denoise (~0.42) -- enough to genuinely
repaint the lighting/palette, low enough that the composition, structure and
silhouette stay locked to the base. Independent text2img per phase was tried
first and rejected: SDXL does not reliably reproduce the same structure across
separate generations even with an identical prompt bar the lighting words, and
the brief is explicit that the building must be recognisably the same building
across all 4 times of day, just lit differently -- exactly how the existing
hand-painted building sheets (e.g. town_quarry) already work.

Usage (run under the ComfyUI venv so numpy/Pillow/urllib deps line up):
    ../ComfyUI/venv/Scripts/python.exe tools/comfy_buildings.py list
    ../ComfyUI/venv/Scripts/python.exe tools/comfy_buildings.py preview <building_id>
    ../ComfyUI/venv/Scripts/python.exe tools/comfy_buildings.py contact-sheet <building_id>
    ../ComfyUI/venv/Scripts/python.exe tools/comfy_buildings.py run [--only building_id]

Output: one PNG per (building, state, phase) combo in
tools/comfy_out/<building>_<state>_<phase>.png, plus 4 map plates as
tools/comfy_out/map_<phase>.png. Resumable -- `run` skips any file that
already exists, so an interrupted multi-hour batch just continues.

Composition step (separate, run after generation + approval): assemble each
building's 20 individual PNGs into one 5-col x 4-row matrix sheet matching
the exact grid tools/import_map_v2.py already parses (COLS_FRAC/ROWS4_FRAC),
so the proven import pipeline needs zero changes.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

# Wire up the proven ComfyUI client from the sibling comfy-autopilot project
# (submit / poll / collect-outputs -- stdlib only, already exercised on real
# renders). No need to reinvent that plumbing.
AUTOPILOT_DIR = Path(r"F:/sandbox/sulphur-2/comfy-autopilot")
sys.path.insert(0, str(AUTOPILOT_DIR))
from autopilot.client import ComfyClient  # noqa: E402

COMFY_BASE = "http://127.0.0.1:8188"
COMFY_OUTPUT_DIR = Path(r"F:/sandbox/sulphur-2/ComfyUI/output")
OUT_DIR = Path(__file__).parent / "comfy_out"
OUT_DIR.mkdir(exist_ok=True)

# The exact reference image the portrait catalogue itself was style-transferred
# from (see the embedded workflow metadata in any catalogue PNG). Already sits
# in ComfyUI's input/ folder.
REF_IMAGE = "char_bran_bust_ref.png"

# RealVisXL_V5.0 (used for the portrait catalogue) is a photorealism-biased
# checkpoint -- fine for faces, but for architecture it kept pulling toward
# "photograph of a physical craft diorama" instead of a painted illustration,
# even with heavy illustration-forcing prompt language (confirmed by a live
# test render). Juggernaut-XL is far more willing to follow a stylised/
# cartoon-illustration prompt for non-portrait subjects.
CHECKPOINT = "Juggernaut-XL_v9.safetensors"
IPADAPTER_FILE = "ip-adapter-plus-face_sdxl_vit-h.safetensors"
CLIP_VISION = "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"

BASE_PHASE = "midday"  # every state's structural anchor; the other 3 relight from it
# 0.42 was tested and produced almost NO visible lighting change (dusk/night
# relights looked essentially identical to the midday base) -- confirmed on
# town_bakery_ruin: structure held perfectly, but nothing about the light,
# palette or mood actually shifted. Raised substantially; structure is
# re-checked at this new value before committing to a batch.
RELIGHT_DENOISE = 0.62

# ---------------------------------------------------------------------------
# Content matrix: 17 buildings from src/data/town-layout.ts BUILDING_INFO.

BUILDINGS: dict[str, str] = {
    "town_cottage": "a small weathered stone-and-timber cottage with a thatched roof, ivy climbing the walls, a modest cottage garden, one chimney",
    "town_bakery": "a timber-framed village bakery with a round stone oven chimney, warm glowing shop windows, a hanging wooden bread sign, flour sacks by the door",
    "prop_well": "a small round stone well with a peaked wooden shingle roof and a wooden bucket-winch, a cobbled surround, moss on the stones",
    "town_market": "an open-air village market square with striped canvas stall awnings, wooden crates and baskets of produce, cobblestone ground",
    "town_garden": "a white-framed glass greenhouse conservatory with climbing vines and flowerbeds, glass panels catching the light",
    "town_townhall": "a small stone village hall with a modest bell tower and arched doorway, a wooden notice board at its steps",
    "town_postoffice": "a tidy timber postmistress's cottage with a painted wooden sign, a red post box, flower window boxes",
    "town_workshop": "a carpenter's workshop with a sawtooth timber roof, stacked lumber outside, tools hanging by the open door",
    "town_farm": "a timber barn with a hayloft door and a small attached farmhouse, a fenced paddock, a few haystacks",
    "town_fisherhut": "a weathered fisherman's hut on wooden stilts over shallow water, fishing nets drying on racks, a small attached dock",
    "town_sawmill": "a timber sawmill with a wooden waterwheel on its side, stacked cut logs, sawdust scattered about",
    "town_blacksmith": "a stone forge with a tall chimney, a glowing warm light from the furnace opening, an anvil and tools just outside the door",
    "town_dock": "a long wooden jetty running out over the bay on pilings, mooring posts with coiled rope, a small lantern post",
    "town_library": "a small stone library building with tall arched leaded-glass windows, ivy on the stone, a cosy reading-nook window",
    "town_quarry": "a stone quarry cut into rock with a tall wooden crane and hoist, cut stone blocks, a small stone-cutter's shelter",
    "town_tailor": "a cosy timber tailor's cottage with bolts of coloured fabric visible in the window, a hanging tailor's sign with scissors, spools of thread on the sill",
    "prop_lighthouse": "a tall round stone lighthouse on a rocky point, a glass lantern room at the top with a gallery rail, a spiral of windows down the tower",
}

# 5 story states, ruin -> wip -> L1 -> L2 -> L3 (matches the existing
# ruin/wip/base/l2/l3 art-id convention every building in the repo already
# uses -- see tools/import_map_v2.py). Worded to match docs/art-bible.md
# section 3 "Homestead Progression" -- the proven prior art for exactly this
# problem (5 staged scenes of the same building). Concrete physical detail
# (caved roof, exposed frame, one lit window, chimney smoke, banners), not
# abstract mood adjectives -- the abstract version ("forlorn", "derelict") is
# what got ignored by the model in testing.
STATES: dict[str, str] = {
    "ruin": "a storm-battered ruin, roof caved in and collapsed, bare broken timber frame exposed, walls crumbled to rubble, scattered storm debris, completely abandoned, no windows or doors intact",
    "wip": "half-built and under active repair, wooden scaffolding braced against open unfinished walls, ladders and building materials piled around, roof only partly closed in, clearly a construction site",
    "l1": "(the smallest and plainest of all five states, a single small room, a compact modest footprint:1.3), freshly finished and humbly restored, plain new roof and walls, (a fully intact, sound, completely closed roof with no holes, no gaps, no openings:1.3), one lit window, a modest chimney, simple and sound but bare",
    "l2": "(visibly bigger than level 1 -- an added room or extension, a taller roofline, more windows -- but still noticeably smaller than the grandest state:1.3), well-established, (a fully intact, sound, completely closed roof with no holes, no gaps, no openings:1.3), a small tended garden and path, flowerboxes on the windows, a garden fence, chimney smoke rising, warmly lived-in",
    "l3": "(the single largest and grandest of all five states, visibly and substantially bigger than level 2, an added wing or upper storey, a taller roofline, extra architectural detail:1.4), (a flawless, fully enclosed, pristine roof with absolutely no holes, gaps, or damage of any kind -- the most complete and well-maintained of all five states:1.4), festival banners and bunting strung along its own eaves only, richly finished and decorated, thriving, the pride of the village, (still one single isolated building, no crowd, no other buildings, no wide street scene:1.2)",
}

# 4 time-of-day phases. Directional key-light recipes match docs/
# time-of-day-art-assets.md's plate spec exactly (dawn=rose from the east,
# dusk=amber from the west, night=cool silver-blue from the upper-right --
# the map's real moonlight key direction) so buildings agree with the plates
# they'll sit on. Only used for TEXT guidance during the relight pass --
# structure comes from the base (midday) image, not from these prompts.
#
# night/dawn were tested at RELIGHT_DENOISE=0.62 and BOTH still rendered as
# plain daylight -- confirmed the actual bug: STYLE_LAW used to hard-bake
# "cosy golden-hour warmth" into every prompt regardless of phase, fighting
# any non-daytime request. Fixed by moving mood language out of STYLE_LAW
# (phase-neutral now) and into here, plus making "night" explicitly say dark/
# black sky rather than relying on "moonlit" alone to imply it.
PHASES: dict[str, str] = {
    "dawn": "early dawn, soft rose-gold sunrise light low on the eastern horizon, the rest of the sky still cool and dim, pale misty morning, long cool blue-grey shadows",
    "midday": "bright midday, warm amber-gold sunlight from the upper-left, cool dusk-blue fill shadow, clear daylight, cosy golden-hour warmth",
    "dusk": "sunset dusk, warm amber and orange light low on the western horizon, long golden shadows stretching, the sky deepening toward evening",
    "night": "deep dark night, black-blue night sky, cool silver-blue moonlight from the upper-right, the building mostly in cool dark shadow, windows glowing warm orange from inside, a soft warm spill of lantern light on the ground at the doorway",
}

# Buildings whose real proportions are tall/portrait rather than the default
# landscape 45-degree isometric footprint (matches existing sliced-art aspect
# ratios -- the lighthouse tower is much taller than it is wide).
PORTRAIT_BUILDINGS = {"prop_lighthouse"}

# STYLE -- ground truth is docs/art-bible.md section 1 + docs/
# time-of-day-art-assets.md's "STYLE BLOCK — prepend to every prompt" (both
# call it "the law"). Locked palette hex codes and the 45-degree isometric
# framing below are lifted verbatim from those docs, not invented here.
#
# Take 1 ("isometric miniature diorama... sitting on a plot base") read as
# literal instructions to photograph a physical craft/dollhouse model --
# confirmed by a live test render (a photo-studio product shot, not a
# painting) -- and the ruin state didn't read at all (a photo of a broken
# product looks wrong to the model, so it quietly substituted a pristine one).
# Take 2 overcorrected the other way (bold cartoon ink outlines) -- the law
# explicitly says NOT cel-shaded; the real target is soft painterly brushwork,
# not comic linework. This is take 3: the law's own vocabulary, plus a
# front-loaded, weight-emphasised state clause (proven necessary in testing --
# buried after a long style preamble, "storm-wrecked ruin" got drowned out by
# the surrounding warm/cosy language and ignored).
# PHASE-NEUTRAL only -- "cosy golden-hour warmth" used to live here and was
# hard-baked into every single prompt including night/dawn, fighting any
# non-daytime request (confirmed: night relights at denoise 0.62 still
# rendered as plain daylight). Time-of-day mood belongs in PHASES only.
STYLE_LAW = (
    "hand-painted warm storybook illustration, soft painterly brushwork, "
    "gentle rim light, palette #EAD7B5 #C79A6B #8FBF8F #6A8CA7 #8E7CC3 "
    "#D46B6B #F4F0E6, 45-degree isometric view"
)
# Take 3 fixed ruin LEGIBILITY (roof genuinely collapsed, rubble genuinely
# shown) but overshot into a real drone/insurance photo of storm damage --
# the state clause at weight 1.35 with the style clause at implicit 1.0
# wasn't a fair fight; the model's "storm damage" training association is
# heavily photo-dominated and swamped the painterly instruction. Take 4:
# weight the illustration-style anchor AT LEAST as hard as the state content,
# both in the same leading emphasis group, so neither wins by default.
# Take 4 solved style + ruin legibility together, but produced a full
# illustrated SCENE (sky, clouds, background trees) instead of an isolated
# game-sprite icon -- the import pipeline needs a clean building on its own
# small plot, not a landscape painting. Tightened the composition framing and
# added scenery to the negative list.
# {phase} is now ALSO weight-emphasised (1.25) -- same lesson as state:
# unweighted, it loses to whatever mood is strongest elsewhere in the prompt.
COMPOSITION = (
    "game asset icon, (isolated single building illustration, standing alone "
    "on a small grounded plot with a soft contact shadow, no other buildings "
    "in frame, no street, no neighbours:1.25), ({state}:1.2), "
    "(hand-painted storybook illustration, soft painterly brushwork, visible "
    "brushstrokes, NOT photorealistic, NOT a photograph, a drawing:1.3), "
    "{subject}, {style}, ({phase}:1.25), plain simple flat background, no "
    "sky, no clouds, no background scenery, no landscape, Emberhollow "
    "fishing village, single isolated building centred and filling the "
    "frame, consistent painterly lighting"
).format(style=STYLE_LAW, state="{state}", subject="{subject}", phase="{phase}")
NEGATIVE = (
    # Verbatim universal negative from docs/art-bible.md section 1:
    "flat vector, sterile, 3d render, cgi, plastic, neon, oversaturated, "
    "harsh contrast, anime, manga, cel shaded, photograph, text, watermark, "
    "signature, ui frame, drop shadow box, low detail, blurry, jpeg artifacts, "
    "extra fingers, deformed, "
    # Additions proven necessary by take 1 (photographed diorama) and take 3
    # (real drone/insurance photo of storm damage) failures:
    "photo, photography, product photography, studio photo, drone photo, "
    "aerial photo, real estate photo, insurance photo, news photo, "
    "photojournalism, diorama, physical model, miniature model, dollhouse, "
    "toy, craft model, felt, clay, real wood grain, real stone texture, "
    "realistic material texture, macro photography, depth of field, bokeh, "
    "tilt-shift, octane render, unreal engine, video game render, modern "
    "architecture, real car, real road, asphalt, people, characters, figures, "
    "extra structures, multiple buildings, village street, market street, "
    "shopfront row, row houses, terrace houses, storefront strip, "
    "neighbouring building, adjacent building, street scene, town square, "
    "cropped, low quality, intact and "
    "undamaged, sky, clouds, background trees, background scenery, "
    "landscape, horizon, distant buildings, wide scene, panorama"
)

# Relight pass keeps the SAME subject/state description (so the model still
# understands what it's repainting) and only swaps the lighting clause. Same
# balanced state/style weighting as COMPOSITION, for consistency -- the base
# image already anchors structure at low denoise, but the prompt still steers
# the relit palette/rendering, so it can still drift photo if unweighted.
RELIGHT_PROMPT = (
    "({state}:1.2), (hand-painted storybook illustration, soft painterly "
    "brushwork, NOT photorealistic, NOT a photograph:1.3), {subject}, "
    "{style}, ({phase}:1.3), Emberhollow fishing village, consistent "
    "painterly lighting"
).format(style=STYLE_LAW, state="{state}", subject="{subject}", phase="{phase}")

MAP_PROMPT_BASE = (
    "top-down isometric painted island map, a small circular fishing-village "
    "island, pine forest on the north shore, sandy beach on the south, a "
    "rocky headland to the east, dirt paths crossing a grassy interior, "
    "({phase}:1.25), {style}, Emberhollow fishing village, viewed from "
    "directly above at a slight isometric angle, a hand-painted illustration, "
    "not a photograph"
).format(style=STYLE_LAW, phase="{phase}")
MAP_RELIGHT_PROMPT = (
    "top-down isometric painted island map, a small circular fishing-village "
    "island, ({phase}:1.3), {style}, Emberhollow fishing village, a "
    "hand-painted illustration, not a photograph"
).format(style=STYLE_LAW, phase="{phase}")


def base_workflow(prompt_text: str, negative_text: str, width: int, height: int, seed: int, filename_prefix: str) -> dict:
    """Full text2img generation -- the structural anchor for a (building, state)
    or (map,) set. Same node shape proven by the portrait catalogue (see the
    embedded metadata in any F:/sandbox/sulphur-2/ComfyUI/output/catalogue/*.png)."""
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT}},
        "11": {"class_type": "IPAdapterModelLoader", "inputs": {"ipadapter_file": IPADAPTER_FILE}},
        "12": {"class_type": "CLIPVisionLoader", "inputs": {"clip_name": CLIP_VISION}},
        "8": {"class_type": "LoadImage", "inputs": {"image": REF_IMAGE}},
        "13": {
            "class_type": "IPAdapterAdvanced",
            "inputs": {
                "weight": 0.3,
                "weight_type": "style transfer",
                "combine_embeds": "concat",
                "start_at": 0.0,
                "end_at": 1.0,
                "embeds_scaling": "V only",
                "model": ["1", 0],
                "ipadapter": ["11", 0],
                "image": ["8", 0],
                "clip_vision": ["12", 0],
            },
        },
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt_text, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": negative_text, "clip": ["1", 1]}},
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": width, "height": height, "batch_size": 1}},
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": 32,
                "cfg": 7.0,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": 1.0,
                "model": ["13", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["4", 0],
            },
        },
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": filename_prefix}},
    }


def relight_workflow(base_image_filename: str, prompt_text: str, negative_text: str, seed: int, filename_prefix: str) -> dict:
    """img2img pass: loads an already-generated base image, re-encodes it to
    latent space, and re-samples at RELIGHT_DENOISE with a lighting-only prompt
    swap. This is what keeps the building/map IDENTICAL in structure across
    dawn/midday/dusk/night -- only the light and palette actually change."""
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT}},
        "11": {"class_type": "IPAdapterModelLoader", "inputs": {"ipadapter_file": IPADAPTER_FILE}},
        "12": {"class_type": "CLIPVisionLoader", "inputs": {"clip_name": CLIP_VISION}},
        "8": {"class_type": "LoadImage", "inputs": {"image": REF_IMAGE}},
        "13": {
            "class_type": "IPAdapterAdvanced",
            "inputs": {
                "weight": 0.2,  # lighter touch on the relight pass -- structure already comes from the base image
                "weight_type": "style transfer",
                "combine_embeds": "concat",
                "start_at": 0.0,
                "end_at": 1.0,
                "embeds_scaling": "V only",
                "model": ["1", 0],
                "ipadapter": ["11", 0],
                "image": ["8", 0],
                "clip_vision": ["12", 0],
            },
        },
        "20": {"class_type": "LoadImage", "inputs": {"image": base_image_filename}},
        "21": {"class_type": "VAEEncode", "inputs": {"pixels": ["20", 0], "vae": ["1", 2]}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt_text, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": negative_text, "clip": ["1", 1]}},
        "5": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": 28,
                "cfg": 6.5,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": RELIGHT_DENOISE,
                "model": ["13", 0],
                "positive": ["2", 0],
                "negative": ["3", 0],
                "latent_image": ["21", 0],
            },
        },
        "6": {"class_type": "VAEDecode", "inputs": {"samples": ["5", 0], "vae": ["1", 2]}},
        "7": {"class_type": "SaveImage", "inputs": {"images": ["6", 0], "filename_prefix": filename_prefix}},
    }


def jobs_for_state(b_id: str, b_desc: str, s_id: str, s_desc: str) -> list[tuple[str, str, dict]]:
    """Returns [(stem, kind, workflow_or_None), ...] for one (building, state)'s
    4 phases -- kind is 'base' (needs no prior file) or 'relight' (needs the
    base stem's output to already exist; workflow is built lazily by the
    runner once that file is on disk, so this returns a placeholder here)."""
    portrait = b_id in PORTRAIT_BUILDINGS
    w, h = (896, 1216) if portrait else (1216, 896)
    base_stem = f"{b_id}_{s_id}_{BASE_PHASE}"
    out: list[tuple[str, str, dict | None]] = [
        (base_stem, "base", {"prompt": COMPOSITION.format(subject=b_desc, state=s_desc, phase=PHASES[BASE_PHASE]), "w": w, "h": h}),
    ]
    for p_id, p_desc in PHASES.items():
        if p_id == BASE_PHASE:
            continue
        out.append(
            (
                f"{b_id}_{s_id}_{p_id}",
                "relight",
                {"prompt": RELIGHT_PROMPT.format(subject=b_desc, state=s_desc, phase=p_desc), "base_stem": base_stem},
            )
        )
    return out


def all_job_specs() -> list[tuple[str, str, dict]]:
    """Flat, dependency-ordered job list: every base before the relights that
    depend on it. Deterministic per-stem seeds so re-running one missing file
    reproduces what the rest of its set would have produced."""
    specs: list[tuple[str, str, dict]] = []

    base_stem = f"map_{BASE_PHASE}"
    specs.append((base_stem, "base", {"prompt": MAP_PROMPT_BASE.format(phase=PHASES[BASE_PHASE]), "w": 1344, "h": 768}))
    for p_id, p_desc in PHASES.items():
        if p_id == BASE_PHASE:
            continue
        specs.append((f"map_{p_id}", "relight", {"prompt": MAP_RELIGHT_PROMPT.format(phase=p_desc), "base_stem": base_stem}))

    for b_id, b_desc in BUILDINGS.items():
        for s_id, s_desc in STATES.items():
            specs.extend(jobs_for_state(b_id, b_desc, s_id, s_desc))
    return specs


def seed_for(stem: str) -> int:
    # Stable, deterministic seed per stem (not just an incrementing counter) so
    # re-running a single missing file is reproducible regardless of run order.
    h = 0
    for ch in stem:
        h = (h * 131 + ord(ch)) & 0xFFFFFFFF
    return 90000 + (h % 900000)


def run_spec(client: ComfyClient, stem: str, kind: str, spec: dict, force: bool) -> bool:
    dest = OUT_DIR / f"{stem}.png"
    if dest.exists() and not force:
        return True  # already present, nothing to do

    if kind == "base":
        wf = base_workflow(spec["prompt"], NEGATIVE, spec["w"], spec["h"], seed_for(stem), stem)
    else:
        base_dest = OUT_DIR / f"{spec['base_stem']}.png"
        if not base_dest.exists():
            print(f"  [{stem}] SKIPPED -- base '{spec['base_stem']}' not generated yet")
            return False
        # ComfyUI's LoadImage reads from its own input/ folder -- copy the base
        # output there under a stable name before referencing it.
        staged = Path(r"F:/sandbox/sulphur-2/ComfyUI/input") / f"_relight_src_{spec['base_stem']}.png"
        staged.write_bytes(base_dest.read_bytes())
        wf = relight_workflow(staged.name, spec["prompt"], NEGATIVE, seed_for(stem), stem)

    code, resp = client.submit(wf)
    if code != 200 or "prompt_id" not in resp:
        print(f"  [{stem}] submit failed ({code}): {json.dumps(resp)[:400]}")
        return False
    prompt_id = resp["prompt_id"]

    def tick(state, elapsed):
        if int(elapsed) % 10 == 0:
            print(f"  [{stem}] {state} ({elapsed:.0f}s)", end="\r")

    hist = client.poll_until_done(prompt_id, timeout_s=600, on_tick=tick)
    if hist is None:
        print(f"  [{stem}] TIMED OUT")
        return False
    if not client.status_ok(hist):
        print(f"  [{stem}] FAILED: {json.dumps(hist.get('status', {}))[:300]}")
        return False
    media = client.collect_outputs(hist)
    if not media:
        print(f"  [{stem}] no output produced")
        return False
    m = media[0]
    src = COMFY_OUTPUT_DIR / m["subfolder"] / m["filename"] if m["subfolder"] else COMFY_OUTPUT_DIR / m["filename"]
    dest.write_bytes(src.read_bytes())
    print(f"  [{stem}] done -> {dest.name}                    ")
    return True


def cmd_list(_args) -> None:
    specs = all_job_specs()
    n_map = sum(1 for s, *_ in specs if s.startswith("map_"))
    print(f"{len(specs)} total generations ({n_map} map plates + {len(BUILDINGS)} buildings x {len(STATES)} states x {len(PHASES)} phases)")
    for stem, kind, _ in specs:
        print(f"  {stem}  [{kind}]")


def cmd_preview(args) -> None:
    """Generate ONE building's full 5-state x 4-phase set (20 images) for
    review before committing to the full 17-building batch."""
    if args.name not in BUILDINGS:
        print(f"unknown building '{args.name}'. Valid ids: {', '.join(BUILDINGS)}")
        return
    client = ComfyClient(COMFY_BASE)
    if not client.wait_ready(30):
        print("ComfyUI not reachable at", COMFY_BASE)
        return
    specs = []
    for s_id, s_desc in STATES.items():
        specs.extend(jobs_for_state(args.name, BUILDINGS[args.name], s_id, s_desc))
    t0 = time.time()
    ok = fail = 0
    for stem, kind, spec in specs:
        print(f"[{stem}] ({kind})")
        if run_spec(client, stem, kind, spec, args.force):
            ok += 1
        else:
            fail += 1
    print(f"\nPreview for '{args.name}': {ok} ok, {fail} failed. {(time.time() - t0) / 60:.1f} min.")


def cmd_run(args) -> None:
    client = ComfyClient(COMFY_BASE)
    if not client.wait_ready(30):
        print("ComfyUI not reachable at", COMFY_BASE)
        return
    specs = all_job_specs()
    if args.only:
        specs = [s for s in specs if s[0].startswith(args.only)]
    total = len(specs)
    ok = fail = skipped = 0
    t0 = time.time()
    for idx, (stem, kind, spec) in enumerate(specs, 1):
        dest = OUT_DIR / f"{stem}.png"
        if dest.exists() and not args.force:
            skipped += 1
            continue
        print(f"[{idx}/{total}] {stem} ({kind})")
        if run_spec(client, stem, kind, spec, args.force):
            ok += 1
        else:
            fail += 1
    elapsed = time.time() - t0
    print(f"\nRun complete: {ok} generated, {skipped} already present, {fail} failed. {elapsed / 60:.1f} min.")


def cmd_contact_sheet(args) -> None:
    """Assemble one building's 20 preview images into a single 5x4 contact
    sheet PNG (states as columns, phases as rows) for quick visual review."""
    from PIL import Image, ImageDraw

    b_id = args.name
    cell = 260
    cols = list(STATES.keys())
    rows = list(PHASES.keys())
    sheet = Image.new("RGB", (cell * len(cols), cell * len(rows) + 30), "#1a1512")
    draw = ImageDraw.Draw(sheet)
    for ci, s_id in enumerate(cols):
        draw.text((ci * cell + 8, 4), s_id, fill="#f0c890")
    for ri, p_id in enumerate(rows):
        for ci, s_id in enumerate(cols):
            p = OUT_DIR / f"{b_id}_{s_id}_{p_id}.png"
            x, y = ci * cell, ri * cell + 30
            if p.exists():
                im = Image.open(p).convert("RGB")
                im.thumbnail((cell - 4, cell - 34))
                sheet.paste(im, (x + 2, y + 2))
            draw.text((x + 4, y + cell - 14), p_id, fill="#cbb790")
    out = OUT_DIR / f"_contact_{b_id}.png"
    sheet.save(out)
    print("wrote", out)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list").set_defaults(fn=cmd_list)

    pv = sub.add_parser("preview")
    pv.add_argument("name")
    pv.add_argument("--force", action="store_true")
    pv.set_defaults(fn=cmd_preview)

    cs = sub.add_parser("contact-sheet")
    cs.add_argument("name")
    cs.set_defaults(fn=cmd_contact_sheet)

    r = sub.add_parser("run")
    r.add_argument("--only", help="prefix filter, e.g. town_bakery")
    r.add_argument("--force", action="store_true", help="regenerate even if the file already exists")
    r.set_defaults(fn=cmd_run)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
