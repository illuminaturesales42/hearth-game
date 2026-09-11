#!/usr/bin/env python3
"""
SUPERSEDED as the source of truth for the prompt: the style/composition
wording here is the first working draft. The user then hand-edited and
locked the final wording (10% margin, trimmed phrasing) into
tools/comfy_style_lock.py -- that module, not this file's constants, is
canonical now. This script is kept as-is since it proved the core img2img
technique; comfy_style_batch.py and style_lock_workflow.json both import
from comfy_style_lock.py.

The simplest possible style test: ONE input image (the first/top-left cell
of a real reference sheet -- Ruins x Dawn, by default), ONE img2img pass to
restyle it into Hearth's actual target look, ONE output image. No IPAdapter,
no multi-branch graph, no 5-state/4-phase matrix -- just answering the single
question "can we hit the right style at all" before scaling back up.

Two style pulls exist in this repo and they disagree in wording:
  - docs/art-bible.md section 1: "hand-painted digital illustration...
    painterly brushwork... NOT cel-shaded anime" -- negative prompt there
    explicitly lists "cartoon" as something to AVOID.
  - The user's own direction (this session): "cartoon, illustrated hand
    drawn feel" -- given directly after rejecting several renders that kept
    drifting toward photoreal/3D-rendered game-asset look.
The read: the user's actual complaint every round has been "too photoreal /
too rendered", not "too painterly". "Cartoon" here means "an illustrated
drawing, clearly hand-drawn, not a render" -- not literal flat cel-shaded
anime (which art-bible.md separately rules out). This prompt aims for warm
hand-drawn storybook illustration with confident, visible linework -- more
overtly "drawn" than the previous painterly-brushwork attempts, short of
flat cel-shaded anime.

Technique: img2img (VAEEncode -> KSampler at moderate denoise) directly on
the reference cell itself, not IPAdapter style-transfer -- img2img inherits
composition/structure far more strongly than IPAdapter did, which matters
since the composition (centred, padded, isometric plinth) is already correct
in the source cell and shouldn't need to be re-described in words.

Usage:
    ../ComfyUI/venv/Scripts/python.exe tools/comfy_style_test.py [ref_cell.png]

Writes:
    tools/comfy_out/workflows/style_test_workflow.json  (the ComfyUI graph, to open directly)
    tools/comfy_out/style_test_result.png                (this run's actual output, for review)
"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

AUTOPILOT_DIR = Path(r"F:/sandbox/sulphur-2/comfy-autopilot")
sys.path.insert(0, str(AUTOPILOT_DIR))
from autopilot.client import ComfyClient  # noqa: E402

COMFY_BASE = "http://127.0.0.1:8188"
COMFY_OUTPUT_DIR = Path(r"F:/sandbox/sulphur-2/ComfyUI/output")
COMFY_INPUT_DIR = Path(r"F:/sandbox/sulphur-2/ComfyUI/input")
OUT_DIR = Path(__file__).parent / "comfy_out"
WF_DIR = OUT_DIR / "workflows"
WF_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_REF = OUT_DIR / "dropin" / "refcells" / "forge_first_position_dawn_ruin.png"
REF_IMAGE_NAME = "_style_test_ref.png"

CHECKPOINT = "Juggernaut-XL_v9.safetensors"
DENOISE = 0.6  # low enough to hold the reference's composition/structure, high
                # enough to genuinely repaint it in the new style rather than
                # just colour-grading the original render

# docs/art-bible.md's locked palette (section 1) -- kept regardless of the
# "cartoon" style shift, since palette and rendering technique are separate
# concerns and only the latter was the actual complaint.
PALETTE = "#EAD7B5 #C79A6B #8FBF8F #6A8CA7 #8E7CC3 #D46B6B #F4F0E6"

STYLE = (
    "warm hand-drawn storybook illustration, confident visible ink and "
    "pencil linework over soft painted colour, a children's picture-book "
    "drawing of a building, clearly hand-illustrated NOT a digital render, "
    "NOT photoreal, NOT a 3D game asset render, NOT CGI, gentle rim light, "
    f"palette {PALETTE}, 45-degree isometric view"
)

# docs/asset-generation-brief.md's actual written rule: "Single subject,
# centred, ~6-8% padding, no cast shadow onto the background."
COMPOSITION = (
    "game asset icon, {style}, a small storm-ruined stone cottage, "
    "collapsed roof, rubble, standing on its own small cobblestone plinth "
    "with a thin edge of moss and grass, (a plain uncluttered neutral grey "
    "backdrop, no ground plane beyond the plinth, no other buildings, no "
    "street, no sky, no scenery:1.3), (single subject, small and centred "
    "with an even ~7% empty margin on all four sides, not a close-up, not "
    "filling the frame, no part of the building touching the frame edge:1.35)"
).format(style=STYLE)

NEGATIVE = (
    "flat vector, sterile, 3d render, cgi render, plastic, oversaturated, "
    "photograph, product photography, studio photography, diorama, "
    "physical model, miniature model, toy, real wood grain, real material, "
    "macro photography, unreal engine, octane render, modern architecture, "
    "photoreal, hyperrealistic, people, characters, extra structures, "
    "multiple buildings, village street, town square, cropped, low "
    "quality, sky, clouds, background scenery, landscape, checkerboard, "
    "gradient background, vignette, ground plane, grass field, meadow, "
    "terrain, drop shadow, close-up, zoomed in, cut off, touching edge of "
    "frame, filling the frame, off-centre, text, watermark, signature, "
    "flat cel-shaded anime, manga"
)


def build_workflow(ref_image_name: str) -> dict:
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT}},
        "2": {"class_type": "LoadImage", "inputs": {"image": ref_image_name}},
        "3": {"class_type": "VAEEncode", "inputs": {"pixels": ["2", 0], "vae": ["1", 2]}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": COMPOSITION, "clip": ["1", 1]}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": NEGATIVE, "clip": ["1", 1]}},
        "6": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 424242,
                "steps": 30,
                "cfg": 7.0,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "denoise": DENOISE,
                "model": ["1", 0],
                "positive": ["4", 0],
                "negative": ["5", 0],
                "latent_image": ["3", 0],
            },
        },
        "7": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "8": {"class_type": "SaveImage", "inputs": {"images": ["7", 0], "filename_prefix": "style_test"}},
    }


def main() -> None:
    ref_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_REF
    if not ref_path.exists():
        print(f"reference image not found: {ref_path}")
        return

    # The reference cell is tiny (~250x209, cropped straight from the sheet)
    # and not a multiple of 8 -- SDXL img2img on a latent that small/odd
    # produces garbage (confirmed: first run output pure noise/abstract
    # shapes, not a building). Upscale to a proper SDXL working resolution
    # (long edge ~1024, dims rounded to a multiple of 8) before VAEEncode.
    from PIL import Image
    im = Image.open(ref_path).convert("RGB")
    long_edge = max(im.width, im.height)
    scale = 1024 / long_edge
    new_w = round(im.width * scale / 8) * 8
    new_h = round(im.height * scale / 8) * 8
    im = im.resize((new_w, new_h), Image.LANCZOS)

    COMFY_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    im.save(COMFY_INPUT_DIR / REF_IMAGE_NAME)

    wf = build_workflow(REF_IMAGE_NAME)
    wf_path = WF_DIR / "style_test_workflow.json"
    wf_path.write_text(json.dumps(wf, indent=2), encoding="utf-8")
    print(f"wrote workflow -> {wf_path}")

    client = ComfyClient(COMFY_BASE)
    if not client.wait_ready(30):
        print("ComfyUI not reachable at", COMFY_BASE)
        return

    print("running...")
    code, resp = client.submit(wf)
    if code != 200 or "prompt_id" not in resp:
        print(f"submit failed ({code}): {resp}")
        return

    def tick(state, elapsed):
        if int(elapsed) % 5 == 0:
            print(f"  {state} ({elapsed:.0f}s)", end="\r")

    hist = client.poll_until_done(resp["prompt_id"], timeout_s=300, on_tick=tick)
    if hist is None or not client.status_ok(hist):
        print("FAILED")
        return
    media = client.collect_outputs(hist)
    if not media:
        print("no output")
        return
    m = media[0]
    src = COMFY_OUTPUT_DIR / m["subfolder"] / m["filename"] if m["subfolder"] else COMFY_OUTPUT_DIR / m["filename"]
    dest = OUT_DIR / "style_test_result.png"
    dest.write_bytes(src.read_bytes())
    print(f"\ndone -> {dest}")


if __name__ == "__main__":
    main()
