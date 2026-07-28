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
CANNY_LOW, CANNY_HIGH, CANNY_RES = 100, 200, 1024

# The subject under test: the Forge, level 1 (the identity anchor state).
SUBJECTS = {
    "forge": {
        "cell": "forge_ref_l1.png",
        "size": (1024, 848),
        "clause": (
            "a stone forge with a tall chimney, a glowing warm light from the "
            "furnace opening, an anvil and tools just outside the door"
        ),
    },
    "bakery": {
        "cell": "bakery_ref_l1.png",
        "size": (1024, 848),
        "clause": (
            "a village bakery with a domed stone oven and its own chimney, "
            "a flour sack and a bread paddle by the door"
        ),
    },
}
STATE_L1 = (
    "newly rebuilt, clean plain honest stonework, simple sound roof, one "
    "window warmly lit, modest and bare but cared for"
)

# ------------------------------------------------------------- prompt dialects
# Shared tail: the three clauses §1b added after the first pass found a
# floating sign and a garbled door. They fixed real defects — keep in BOTH
# dialects so the comparison isolates style, not glitch-proofing.
FIX_CLAUSES = (
    "(clearly defined wooden doors and windows with visible planks, iron hinges "
    "and simple frames, set squarely inside their stone openings:1.35), "
    "(structurally sound, every part properly joined and supported, signs and "
    "brackets firmly bolted, nothing floating or detached:1.3), "
    "(hand-drawn illustrated 2D game asset, flat isolated icon, NOT a photograph, "
    "NOT a physical object, NOT a miniature, NOT sitting on a real surface, no "
    "depth of field, no blur:1.4)"
)
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
    "cel-shaded anime, manga, floating objects, levitating, detached, disconnected, "
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
PROMPTS = {"paint": PROMPT_PAINT, "ink": PROMPT_INK}
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
WINNER = "realvis_paint_noipa"


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
def build_graph(ckpt: str, positive: str, ipa, ref_name: str, board_name: str, size) -> dict:
    w, h = size
    g: dict = {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": ckpt}},
        "2": {"class_type": "LoadImage", "inputs": {"image": ref_name}},
        "3": {
            "class_type": "CannyEdgePreprocessor",
            "inputs": {
                "image": ["2", 0],
                "low_threshold": CANNY_LOW,
                "high_threshold": CANNY_HIGH,
                "resolution": CANNY_RES,
            },
        },
        "4": {"class_type": "ControlNetLoader", "inputs": {"control_net_name": CN_MODEL}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": positive, "clip": ["1", 1]}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"text": NEGATIVE, "clip": ["1", 1]}},
        "7": {
            "class_type": "ControlNetApplyAdvanced",
            "inputs": {
                "positive": ["5", 0],
                "negative": ["6", 0],
                "control_net": ["4", 0],
                "image": ["3", 0],
                "strength": CN_STRENGTH,
                "start_percent": 0.0,
                "end_percent": CN_END,
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
    args = ap.parse_args()
    if args.winner:
        args.only = WINNER

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    subject = SUBJECTS[args.subject]
    positive_subject = f"{subject['clause']} -- {STATE_L1}"

    recipes = [
        (f"{ck}_{pr}_{ia}", CHECKPOINTS[ck], PROMPTS[pr].format(subject=positive_subject), IPA_SETTINGS[ia])
        for ck in CHECKPOINTS
        for pr in PROMPTS
        for ia in IPA_SETTINGS
    ]
    if args.only:
        recipes = [r for r in recipes if r[0] == args.only]
        if not recipes:
            raise SystemExit(f"No recipe named {args.only}")

    prefix = "" if args.subject == "forge" else f"{args.subject}_"

    if not args.sheet_only:
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

    if args.cutout:
        # generate -> transparent sprite in one command. Imported lazily so a
        # plain sweep never needs rembg.
        from comfy_cutout import cutout  # noqa: PLC0415 — optional dependency

        cut_dir = REPO / "tools" / "comfy_out" / "cutout"
        cut_dir.mkdir(parents=True, exist_ok=True)
        for lbl, p in found:
            im, stats = cutout(p, 320, 6)
            dest = cut_dir / f"{prefix}{lbl}.png"
            im.save(dest)
            ok = max(stats["corners"]) == 0
            print(f"  cutout {dest.name}  {stats['size']}  corners {'clear' if ok else stats['corners']}")

    sheet = OUT_DIR / f"{prefix}contact_sheet.png"
    contact_sheet(found, sheet)
    print(f"\ncontact sheet: {sheet}  ({len(found)} cells)")


if __name__ == "__main__":
    main()
