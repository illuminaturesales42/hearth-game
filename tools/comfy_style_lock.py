#!/usr/bin/env python3
"""
THE locked style/composition prompt for Hearth building art -- single source
of truth, imported by comfy_style_test.py, comfy_style_batch.py, and the
standalone style_lock_workflow.json. Confirmed working (2026-07-26) on the
Forge.png ruin/dawn cell via comfy_style_test.py's img2img technique: hand-
drawn illustrated look, structure held from the reference, clean isolation.

Do not edit the wording piecemeal in individual scripts -- if the style needs
to change, change it HERE, re-validate with comfy_style_test.py on one cell,
then every script downstream picks it up automatically.

The positive prompt below is the user's own locked wording verbatim (session
2026-07-26), not independently re-derived -- only the {subject} clause is a
template slot so the same style applies across all 5 states.
"""
from __future__ import annotations

PALETTE = "#EAD7B5 #C79A6B #8FBF8F #6A8CA7 #8E7CC3 #D46B6B #F4F0E6"

# {subject} is the only variable slot -- everything else is locked wording.
POSITIVE_TEMPLATE = (
    "game asset, warm hand-drawn storybook illustration, confident visible "
    "ink and pencil linework over soft painted colour, clearly "
    "hand-illustrated NOT a digital render, NOT photoreal, NOT a 3D game "
    f"asset render, NOT CGI, gentle rim light, palette {PALETTE}, "
    "45-degree isometric view, {subject}, standing on its own small "
    "cobblestone plinth with a thin edge of moss and grass, (a plain "
    "uncluttered neutral grey backdrop, no ground plane beyond the plinth, "
    "no other buildings, no street, no sky, no scenery:1.3), (single "
    "subject, small and centred with an even ~10% empty margin on all four "
    "sides, not a close-up, not filling the frame, no part of the building "
    "touching the frame edge:1.35)"
)

# The ruin/dawn subject clause exactly as validated -- the default subject
# when no building-specific description is supplied.
DEFAULT_SUBJECT = "a small storm-ruined stone cottage, collapsed roof, rubble"

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

CHECKPOINT = "Juggernaut-XL_v9.safetensors"
DENOISE = 0.6
PADDING_FRAC = 0.35  # extra canvas margin added before the SDXL-res resize,
# on top of the ~10% margin the prompt itself asks for -- belt and braces
# against any part of the building touching the output's edge.


def positive_for(subject: str = DEFAULT_SUBJECT) -> str:
    return POSITIVE_TEMPLATE.format(subject=subject)


def build_workflow(ref_image_name: str, subject: str, seed: int, filename_prefix: str = "style_lock") -> dict:
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CHECKPOINT}},
        "2": {"class_type": "LoadImage", "inputs": {"image": ref_image_name}},
        "3": {"class_type": "VAEEncode", "inputs": {"pixels": ["2", 0], "vae": ["1", 2]}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": positive_for(subject), "clip": ["1", 1]}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": NEGATIVE, "clip": ["1", 1]}},
        "6": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed, "steps": 30, "cfg": 7.0, "sampler_name": "dpmpp_2m",
                "scheduler": "karras", "denoise": DENOISE,
                "model": ["1", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["3", 0],
            },
        },
        "7": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "8": {"class_type": "SaveImage", "inputs": {"images": ["7", 0], "filename_prefix": filename_prefix}},
    }
