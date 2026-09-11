#!/usr/bin/env python3
"""
Drop-in test: generate ONE building's full 5-state set (ruin/wip/l1/l2/l3),
matching the ACTUAL established in-game art style -- not the painterly
portrait-catalogue style comfy_buildings.py was chasing before.

Ground truth for "the established style" is the real shipped assets in
public/art/ (e.g. town_bakery.png, town_bakery_l2.png, town_bakery_ruin.png):
a crisp, detailed hand-painted ISOMETRIC GAME ASSET, each building sitting on
its own small irregular cobblestone/paving-stone plinth with moss and grass
tufts at the edges, a soft ambient-occlusion contact shadow, true alpha
transparency, tightly cropped to content (no fixed canvas/background at all).
That is a different bar than the storybook-illustration style tried in
comfy_buildings.py -- more rendered, less "brushstrokes visible", much closer
to a painted game icon than a book illustration.

Technique:
- IPAdapter style-transfer reference = a REAL existing shipped asset
  (town_bakery_l2.png), not the character bust -- we want to match this
  precise, already-approved building-icon rendering style exactly.
- Generate on a flat, saturated chroma-key magenta background (#FF00FF,
  nothing in the building palette is close to it) instead of relying on
  ComfyUI's background-removal nodes (no bg-removal model is installed on
  this machine -- see docs/comfy-building-workflow.md "Known open issues").
- Post-process in Pillow: chroma-key the magenta to alpha, autocrop to the
  content bounding box -- mirrors exactly how the real public/art/*.png
  files are cropped (e.g. town_bakery_ruin.png is 253x177, not a fixed size).
- One lighting pass only (no dawn/dusk/night relights yet) -- this run is
  about nailing the STYLE + transparency + drop-in readiness first.

Usage (ComfyUI venv):
    ../ComfyUI/venv/Scripts/python.exe tools/comfy_dropin_test.py <building_id>

Output: tools/comfy_out/dropin/<building>_<state>.png (true RGBA, auto-cropped)
        tools/comfy_out/dropin/_preview_<building>.png (checkerboard contact strip)
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

AUTOPILOT_DIR = Path(r"F:/sandbox/sulphur-2/comfy-autopilot")
sys.path.insert(0, str(AUTOPILOT_DIR))
from autopilot.client import ComfyClient  # noqa: E402

from comfy_buildings import BUILDINGS, STATES  # noqa: E402 -- reuse the same content matrix

COMFY_BASE = "http://127.0.0.1:8188"
COMFY_OUTPUT_DIR = Path(r"F:/sandbox/sulphur-2/ComfyUI/output")
COMFY_INPUT_DIR = Path(r"F:/sandbox/sulphur-2/ComfyUI/input")
OUT_DIR = Path(__file__).parent / "comfy_out" / "dropin"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# PER-STATE reference cells cropped directly from a real, approved matrix
# sheet (the artist's own finals in art-src/ -- e.g. Forge.png), not an
# invented style description or one generic reference image. Composition
# problems (off-centre, uneven/zero padding, wrong plinth style) proved very
# hard to nail with text alone across 6+ prompt iterations; cropping the
# actual midday cell for each state and feeding THAT to IPAdapter gives the
# model a concrete, already-correct example of centring/padding/plinth style
# to match, per state, rather than one static full-building reference used
# for every state regardless of shape. See build_ref_cells() below --
# extracts cells with the same sprite_grid()/key_bg() machinery
# tools/import_map_v2.py already uses in production.
REF_SHEET = Path(r"C:/Users/illum/OneDrive/Desktop/Hearth/Graphics and UI/Core/Map/Full Building Final/Forge.png")
REF_CELL_DIR = Path(__file__).parent / "comfy_out" / "dropin" / "refcells"

CHECKPOINT = "Juggernaut-XL_v9.safetensors"
IPADAPTER_FILE = "ip-adapter-plus-face_sdxl_vit-h.safetensors"
CLIP_VISION = "CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors"

# Chroma-keying (magenta, then green) was tried and rejected: naming ANY
# colour word in the prompt visibly bled into the model's own material
# choices for that generation (pink stucco walls when we said "magenta",
# green-painted walls when we said "green screen") -- SDXL sometimes reads a
# background colour instruction as a paint instruction instead. Switched to
# `rembg` (a real trained matting/segmentation model, U^2-Net) as a pure
# post-process instead: it doesn't care what the background looks like, so
# the prompt just asks for a plain, uncluttered backdrop and rembg removes
# whatever that turns out to be. Installed into the ComfyUI venv (`pip
# install rembg onnxruntime`) -- not a ComfyUI node, run directly in Python.

STYLE = (
    "(a hand-painted digital illustration, painted texture, NOT a "
    "photograph, NOT a physical model, NOT a real object, NOT studio "
    "photography, NOT 3D rendered, a 2D painting of a building:1.35), "
    "crisp clean painted brushwork, warm rim light, soft ambient occlusion "
    "contact shadow, painted mobile game art style, 45-degree isometric view"
)

COMPOSITION = (
    "game asset icon, ({state}:1.3), {style}, {subject}, (the entire small "
    "building shown complete and whole in frame, full view from the roof "
    "peak down to the base plinth, no part of the building cut off or "
    "touching the edge of the frame:1.3), standing on its own tiny irregular "
    "cobblestone plinth base no bigger than the building itself, a thin edge "
    "of moss and grass right at the rim of the plinth only, (a plain "
    "uncluttered neutral grey studio backdrop, no ground plane, no field, no "
    "meadow, no grass beyond the tiny plinth, no other buildings, no street, "
    "no scenery, no sky, no crowd, no village scene:1.35), (the subject is "
    "small and perfectly centred in the frame with a wide even empty margin "
    "of plain backdrop on all four sides -- equal space above the roof "
    "peak, below the plinth, and to the left and right -- like a product "
    "icon thumbnail with generous padding, not a close-up, not zoomed in, "
    "not filling the frame:1.4)"
).format(style=STYLE, state="{state}", subject="{subject}")

NEGATIVE = (
    "flat vector, sterile, 3d render, cgi render, plastic, oversaturated, "
    "harsh contrast, anime, manga, cel shaded, photograph, text, watermark, "
    "signature, ui frame, low detail, blurry, jpeg artifacts, extra fingers, "
    "deformed, photo, photography, product photography, studio photography, "
    "studio lighting, diorama, physical model, miniature model, dollhouse, "
    "toy, craft model, paper craft, wood craft, real wood grain, real "
    "material, macro photography, depth of field, bokeh, octane render, "
    "unreal engine, modern architecture, people, characters, figures, extra "
    "structures, multiple buildings, village street, town square, row "
    "houses, cropped, low quality, sky, clouds, background trees, "
    "background scenery, landscape, horizon, checkerboard, gradient "
    "background, vignette, shaded background, ground plane, grass field, "
    "meadow, dirt field, wide grassy area, terrain, studio floor, drop "
    "shadow, close-up, extreme close-up, macro, zoomed in, cropped view, "
    "partial view, cut off, touching edge of frame, filling the frame, "
    "off-centre, out of frame, detail shot"
)


def base_workflow(prompt_text: str, negative_text: str, seed: int, filename_prefix: str, ref_image_name: str, ip_weight: float = 0.55) -> dict:
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT}},
        "11": {"class_type": "IPAdapterModelLoader", "inputs": {"ipadapter_file": IPADAPTER_FILE}},
        "12": {"class_type": "CLIPVisionLoader", "inputs": {"clip_name": CLIP_VISION}},
        "8": {"class_type": "LoadImage", "inputs": {"image": ref_image_name}},
        "13": {
            "class_type": "IPAdapterAdvanced",
            "inputs": {
                "weight": ip_weight,
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
        "4": {"class_type": "EmptyLatentImage", "inputs": {"width": 1216, "height": 896, "batch_size": 1}},
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


def seed_for(stem: str) -> int:
    h = 0
    for ch in stem:
        h = (h * 131 + ord(ch)) & 0xFFFFFFFF
    return 40000 + (h % 400000)


_REMBG_SESSION = None


def remove_bg_and_crop(src_path: Path, dest_path: Path) -> None:
    """Real ML background removal (rembg/U^2-Net) + autocrop to content,
    matching how the real public/art/*.png assets are cropped. Doesn't care
    what colour the backdrop is, so it sidesteps the colour-bleed problem
    chroma-keying hit (see comment above CHROMA note)."""
    from PIL import Image
    from rembg import remove, new_session

    global _REMBG_SESSION
    if _REMBG_SESSION is None:
        _REMBG_SESSION = new_session("u2net")

    im = Image.open(src_path).convert("RGB")
    out = remove(im, session=_REMBG_SESSION)

    bbox = out.getbbox()
    if bbox:
        pad = 6
        l, t, r, b = bbox
        l = max(0, l - pad)
        t = max(0, t - pad)
        r = min(out.width, r + pad)
        b = min(out.height, b + pad)
        out = out.crop((l, t, r, b))

    # The real shipped assets (public/art/town_bakery*.png) run ~250-280px on
    # their long side, ~60-95KB each -- this is a PWA, art is runtime-loaded,
    # not precached, and there are ~340 of these planned. Our raw SDXL output
    # is ~1000-1150px / 600KB-1.2MB per file, ~15x oversized on both counts.
    # Downscale to the same order of magnitude before saving.
    TARGET_LONG_EDGE = 320
    long_edge = max(out.width, out.height)
    if long_edge > TARGET_LONG_EDGE:
        scale = TARGET_LONG_EDGE / long_edge
        out = out.resize((max(1, round(out.width * scale)), max(1, round(out.height * scale))), Image.LANCZOS)

    out.save(dest_path, optimize=True)


def build_preview(building: str, states: list[str]) -> Path:
    from PIL import Image, ImageDraw

    cell = 300
    sheet = Image.new("RGB", (cell * len(states), cell + 30), "#3a3a3a")
    # checkerboard so transparency is visible
    check = Image.new("RGB", (cell, cell), "#4a4a4a")
    cd = ImageDraw.Draw(check)
    sq = 16
    for y in range(0, cell, sq):
        for x in range(0, cell, sq):
            if (x // sq + y // sq) % 2 == 0:
                cd.rectangle([x, y, x + sq, y + sq], fill="#5c5c5c")

    draw = ImageDraw.Draw(sheet)
    for i, s_id in enumerate(states):
        x = i * cell
        sheet.paste(check, (x, 30))
        p = OUT_DIR / f"{building}_{s_id}.png"
        draw.text((x + 8, 4), s_id, fill="#f0c890")
        if p.exists():
            im = Image.open(p).convert("RGBA")
            im.thumbnail((cell - 20, cell - 50))
            ox = x + (cell - im.width) // 2
            oy = 30 + (cell - 20 - im.height) // 2 + 10
            sheet.paste(im, (ox, oy), im)
    out = OUT_DIR / f"_preview_{building}.png"
    sheet.save(out)
    return out


def main() -> None:
    if len(sys.argv) < 2 or sys.argv[1] not in BUILDINGS:
        print(f"usage: comfy_dropin_test.py <building_id>\nvalid: {', '.join(BUILDINGS)}")
        return
    b_id = sys.argv[1]
    b_desc = BUILDINGS[b_id]

    COMFY_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    (COMFY_INPUT_DIR / REF_IMAGE_NAME).write_bytes(REF_ASSET.read_bytes())

    client = ComfyClient(COMFY_BASE)
    if not client.wait_ready(30):
        print("ComfyUI not reachable at", COMFY_BASE)
        return

    t0 = time.time()
    ok = fail = 0
    for s_id, s_desc in STATES.items():
        stem = f"{b_id}_{s_id}"
        raw_dest = OUT_DIR / f"_raw_{stem}.png"
        prompt = COMPOSITION.format(state=s_desc, subject=b_desc)
        wf = base_workflow(prompt, NEGATIVE, seed_for(stem), f"dropin_{stem}")
        print(f"[{stem}] submitting...")
        code, resp = client.submit(wf)
        if code != 200 or "prompt_id" not in resp:
            print(f"  [{stem}] submit failed ({code}): {resp}")
            fail += 1
            continue

        def tick(state, elapsed):
            if int(elapsed) % 10 == 0:
                print(f"  [{stem}] {state} ({elapsed:.0f}s)", end="\r")

        hist = client.poll_until_done(resp["prompt_id"], timeout_s=600, on_tick=tick)
        if hist is None or not client.status_ok(hist):
            print(f"  [{stem}] FAILED")
            fail += 1
            continue
        media = client.collect_outputs(hist)
        if not media:
            print(f"  [{stem}] no output")
            fail += 1
            continue
        m = media[0]
        src = COMFY_OUTPUT_DIR / m["subfolder"] / m["filename"] if m["subfolder"] else COMFY_OUTPUT_DIR / m["filename"]
        raw_dest.write_bytes(src.read_bytes())
        remove_bg_and_crop(raw_dest, OUT_DIR / f"{stem}.png")
        print(f"  [{stem}] done                              ")
        ok += 1

    preview = build_preview(b_id, list(STATES.keys()))
    print(f"\n{ok} ok, {fail} failed. {(time.time() - t0) / 60:.1f} min.")
    print("preview:", preview)


if __name__ == "__main__":
    main()
