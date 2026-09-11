#!/usr/bin/env python3
"""
Builds a single ComfyUI workflow JSON (API-format graph) that generates all
20 looks (5 states x 4 time-of-day phases) of ONE building in one go, using
per-state reference cells cropped straight from a real, approved matrix sheet
(e.g. art-src's Forge.png) as IPAdapter structure/composition guidance --
same idea as comfy_dropin_test.py, but saved as a workflow file to open and
run inside the ComfyUI web UI instead of driven over the HTTP API from
Python.

Graph shape per state (ruin/wip/l1/l2/l3):
  LoadImage(ref cell) -> IPAdapterAdvanced -> [shared MODEL for all 4 phases]
  MIDDAY (base):   CLIPTextEncode x2 -> EmptyLatentImage -> KSampler(denoise=1.0)
                   -> VAEDecode -> SaveImage
  DAWN/DUSK/NIGHT (relight): VAEEncode(pixels = the midday VAEDecode's own
                   output, wired directly node-to-node -- no filesystem
                   staging needed inside one graph) -> KSampler(denoise=
                   RELIGHT_DENOISE) -> VAEDecode -> SaveImage
This mirrors the base+relight structural-consistency technique from
comfy_buildings.py / comfy_dropin_test.py, just expressed as one static graph
instead of a Python-driven sequence of HTTP submits.

Usage:
    ../ComfyUI/venv/Scripts/python.exe tools/comfy_build_workflow.py <building_id> [ref_sheet.png]

Writes: tools/comfy_out/workflows/<building>_workflow.json

Open it in ComfyUI: the web UI's Workflow menu -> Open (or drag the file onto
the canvas) -- modern ComfyUI front-ends auto-detect and import API-format
JSON exports directly as a graph. Hit Queue to run all 20 branches.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from comfy_buildings import BUILDINGS, STATES, PHASES, STYLE_LAW, PORTRAIT_BUILDINGS  # noqa: E402
from import_map_v2 import sprite_grid, key_bg  # noqa: E402
from PIL import Image  # noqa: E402

COMFY_INPUT_DIR = Path(r"F:/sandbox/sulphur-2/ComfyUI/input")
OUT_DIR = Path(__file__).parent / "comfy_out" / "workflows"
OUT_DIR.mkdir(parents=True, exist_ok=True)
REFCELL_DIR = Path(__file__).parent / "comfy_out" / "dropin" / "refcells"
REFCELL_DIR.mkdir(parents=True, exist_ok=True)

CHECKPOINT = "Juggernaut-XL_v9.safetensors"
IPADAPTER_FILE = "ip-adapter-plus-face_sdxl_vit-h.safetensors"
CLIP_VISION = "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"
BASE_PHASE = "midday"
RELIGHT_DENOISE = 0.62
IP_WEIGHT = 0.55

STYLE = (
    "(a hand-painted digital illustration, painted texture, NOT a "
    "photograph, NOT a physical model, NOT studio photography, NOT 3D "
    "rendered, a 2D painting of a building:1.35), crisp clean painted "
    "brushwork, warm rim light, soft ambient occlusion contact shadow, "
    "painted mobile game art style, 45-degree isometric view"
)
COMPOSITION = (
    "game asset icon, ({state}:1.3), {style}, {subject}, (the entire small "
    "building shown complete and whole in frame, no part cut off or "
    "touching the frame edge:1.3), standing on its own small irregular "
    "cobblestone plinth base, a thin edge of moss and grass at the rim of "
    "the plinth only, (a plain uncluttered neutral grey studio backdrop, no "
    "ground plane, no field, no other buildings, no street, no sky, no "
    "crowd, no village scene:1.35), (small and perfectly centred with a "
    "wide even empty margin on all four sides, product icon thumbnail "
    "padding, not a close-up, not filling the frame:1.4), ({phase}:1.25)"
)
NEGATIVE = (
    "flat vector, sterile, 3d render, cgi render, plastic, oversaturated, "
    "photograph, product photography, studio photography, diorama, "
    "physical model, miniature model, toy, real wood grain, real material, "
    "macro photography, depth of field, unreal engine, modern architecture, "
    "people, characters, extra structures, multiple buildings, village "
    "street, town square, cropped, low quality, sky, clouds, background "
    "scenery, landscape, checkerboard, gradient background, vignette, "
    "ground plane, grass field, meadow, terrain, drop shadow, close-up, "
    "zoomed in, cropped view, cut off, touching edge of frame, filling the "
    "frame, off-centre, text, watermark, signature"
)
RELIGHT_PROMPT = (
    "({state}:1.2), {style}, {subject}, ({phase}:1.3), consistent painterly lighting"
)


def build_ref_cells(sheet_path: Path) -> dict[str, str]:
    """Crop the midday row of a real matrix sheet into 5 per-state reference
    images, stage them into ComfyUI's input/ folder, return {state: filename}."""
    im = Image.open(sheet_path).convert("RGB")
    rows, cols = sprite_grid(im, 4)
    midday = rows[1]
    names = {}
    for s_id, (x0, x1) in zip(STATES.keys(), cols):
        cell = im.crop((x0, midday[0], x1, midday[1]))
        keyed = key_bg(cell)
        fname = f"_wf_ref_{sheet_path.stem}_{s_id}.png"
        keyed.save(REFCELL_DIR / fname)
        COMFY_INPUT_DIR.mkdir(parents=True, exist_ok=True)
        keyed.save(COMFY_INPUT_DIR / fname)
        names[s_id] = fname
    return names


def build_graph(b_id: str, b_desc: str, ref_names: dict[str, str]) -> dict:
    portrait = b_id in PORTRAIT_BUILDINGS
    w, h = (896, 1216) if portrait else (1216, 896)

    g: dict[str, dict] = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT}},
        "11": {"class_type": "IPAdapterModelLoader", "inputs": {"ipadapter_file": IPADAPTER_FILE}},
        "12": {"class_type": "CLIPVisionLoader", "inputs": {"clip_name": CLIP_VISION}},
    }
    nid = 100  # running id allocator for per-branch nodes

    def new_id() -> str:
        nonlocal nid
        nid += 1
        return str(nid)

    for s_id, s_desc in STATES.items():
        ref_load = new_id()
        g[ref_load] = {"class_type": "LoadImage", "inputs": {"image": ref_names[s_id]}}

        ipa = new_id()
        g[ipa] = {
            "class_type": "IPAdapterAdvanced",
            "inputs": {
                "weight": IP_WEIGHT,
                "weight_type": "style transfer",
                "combine_embeds": "concat",
                "start_at": 0.0,
                "end_at": 1.0,
                "embeds_scaling": "V only",
                "model": ["1", 0],
                "ipadapter": ["11", 0],
                "image": [ref_load, 0],
                "clip_vision": ["12", 0],
            },
        }

        # --- base (midday) branch ---
        pos = new_id()
        g[pos] = {"class_type": "CLIPTextEncode", "inputs": {
            "text": COMPOSITION.format(style=STYLE, state=s_desc, subject=b_desc, phase=PHASES[BASE_PHASE]),
            "clip": ["1", 1],
        }}
        neg = new_id()
        g[neg] = {"class_type": "CLIPTextEncode", "inputs": {"text": NEGATIVE, "clip": ["1", 1]}}
        lat = new_id()
        g[lat] = {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}}
        ks = new_id()
        g[ks] = {"class_type": "KSampler", "inputs": {
            "seed": seed_for(f"{b_id}_{s_id}_{BASE_PHASE}"), "steps": 32, "cfg": 7.0,
            "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0,
            "model": [ipa, 0], "positive": [pos, 0], "negative": [neg, 0], "latent_image": [lat, 0],
        }}
        vd = new_id()
        g[vd] = {"class_type": "VAEDecode", "inputs": {"samples": [ks, 0], "vae": ["1", 2]}}
        si = new_id()
        g[si] = {"class_type": "SaveImage", "inputs": {"images": [vd, 0], "filename_prefix": f"{b_id}_{s_id}_{BASE_PHASE}"}}

        # --- relight branches (dawn/dusk/night), fed directly from the base's own VAEDecode output ---
        for p_id, p_desc in PHASES.items():
            if p_id == BASE_PHASE:
                continue
            ve = new_id()
            g[ve] = {"class_type": "VAEEncode", "inputs": {"pixels": [vd, 0], "vae": ["1", 2]}}
            rpos = new_id()
            g[rpos] = {"class_type": "CLIPTextEncode", "inputs": {
                "text": RELIGHT_PROMPT.format(style=STYLE, state=s_desc, subject=b_desc, phase=p_desc),
                "clip": ["1", 1],
            }}
            rneg = new_id()
            g[rneg] = {"class_type": "CLIPTextEncode", "inputs": {"text": NEGATIVE, "clip": ["1", 1]}}
            rks = new_id()
            g[rks] = {"class_type": "KSampler", "inputs": {
                "seed": seed_for(f"{b_id}_{s_id}_{p_id}"), "steps": 28, "cfg": 6.5,
                "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": RELIGHT_DENOISE,
                "model": [ipa, 0], "positive": [rpos, 0], "negative": [rneg, 0], "latent_image": [ve, 0],
            }}
            rvd = new_id()
            g[rvd] = {"class_type": "VAEDecode", "inputs": {"samples": [rks, 0], "vae": ["1", 2]}}
            rsi = new_id()
            g[rsi] = {"class_type": "SaveImage", "inputs": {"images": [rvd, 0], "filename_prefix": f"{b_id}_{s_id}_{p_id}"}}

    return g


def seed_for(stem: str) -> int:
    h = 0
    for ch in stem:
        h = (h * 131 + ord(ch)) & 0xFFFFFFFF
    return 50000 + (h % 500000)


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in BUILDINGS:
        print(f"usage: comfy_build_workflow.py <building_id> [ref_sheet.png]\nvalid: {', '.join(BUILDINGS)}")
        return
    b_id = sys.argv[1]
    b_desc = BUILDINGS[b_id]
    sheet_path = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(
        r"C:/Users/illum/OneDrive/Desktop/Hearth/Graphics and UI/Core/Map/Full Building Final/Forge.png"
    )
    if not sheet_path.exists():
        print(f"reference sheet not found: {sheet_path}")
        return

    print(f"cropping per-state reference cells from {sheet_path.name} ...")
    ref_names = build_ref_cells(sheet_path)
    for s, fn in ref_names.items():
        print(f"  {s}: {fn}")

    graph = build_graph(b_id, b_desc, ref_names)
    out = OUT_DIR / f"{b_id}_workflow.json"
    out.write_text(json.dumps(graph, indent=2), encoding="utf-8")
    print(f"\nwrote {out}  ({len(graph)} nodes, 20 SaveImage branches)")
    print("Open ComfyUI -> Workflow menu -> Open (or drag this file onto the canvas),")
    print("then hit Queue to run all 20 states x phases for", b_id)


if __name__ == "__main__":
    main()
