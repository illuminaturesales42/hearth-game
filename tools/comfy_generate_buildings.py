#!/usr/bin/env python3
"""
Production driver: generates the full building art set per the approved plan
(C:\\Users\\illum\\.claude\\plans\\jiggly-napping-hamming.md) -- 85 base images
(17 buildings x 5 states) + 85 night-glow variants = 170 total, NOT 340.

Why not 4 phases per state: an Explore-agent investigation of
src/ui/map-view.ts found the renderer already applies a real runtime colour
grade over the whole town (applyTimeLight/gradeLand, real canvas composite
ops, keyed to sun/moon position) AFTER buildings are drawn -- it lands on
every building pixel already. Dawn/midday/dusk mood comes from that grade for
free, with perfect physical consistency (same base pixels, zero AI drift
risk). The only thing the grade can't do is invent NEW light sources (lit
windows, lantern glow), so a single extra AI pass adds just that, per state.

Technique per building x state:
  1. BASE: crop that building's own real approved sheet's midday-row cell
     (art-src/.../Full Building Final/*.png, via import_map_v2's own
     sprite_grid()/key_bg() grid-detection) and restyle it with the LOCKED
     style (tools/comfy_style_lock.py, denoise 0.6). town_tailor has no sheet
     of its own -- it borrows a donor cell (Forge.png) purely for
     composition/framing guidance; its own subject text supplies the content.
  2. NIGHT: a second, LOWER-denoise (0.3) img2img pass sourced from the
     BASE's own rendered output (not the original reference cell) -- this is
     what keeps the night variant's structure tightly locked to the base,
     adding only "(deep night, glowing lit windows, lantern glow...)".
  3. Both outputs go through the same post-process as comfy_dropin_test.py:
     rembg background removal + autocrop + downscale to ~320px (matches the
     real shipped assets' scale).

Usage (ComfyUI venv):
    ../ComfyUI/venv/Scripts/python.exe tools/comfy_generate_buildings.py list
    ../ComfyUI/venv/Scripts/python.exe tools/comfy_generate_buildings.py preview <building_id>
    ../ComfyUI/venv/Scripts/python.exe tools/comfy_generate_buildings.py contact-sheet <building_id>
    ../ComfyUI/venv/Scripts/python.exe tools/comfy_generate_buildings.py run [--only building_id] [--force]

Output: tools/comfy_out/final/<ident>.png (base) and <ident>_night.png,
using the exact naming public/art/ and the engine already expect.
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
AUTOPILOT_DIR = Path(r"F:/sandbox/sulphur-2/comfy-autopilot")
sys.path.insert(0, str(AUTOPILOT_DIR))
from autopilot.client import ComfyClient  # noqa: E402

import comfy_style_lock as LOCK  # noqa: E402
from comfy_dropin_test import remove_bg_and_crop  # noqa: E402
from comfy_buildings import BUILDINGS as SUBJECTS, STATES as STATE_TEXT  # noqa: E402
import import_map_v2 as IMV2  # noqa: E402
from PIL import Image  # noqa: E402

COMFY_BASE = "http://127.0.0.1:8188"
COMFY_OUTPUT_DIR = Path(r"F:/sandbox/sulphur-2/ComfyUI/output")
COMFY_INPUT_DIR = Path(r"F:/sandbox/sulphur-2/ComfyUI/input")
OUT_DIR = Path(__file__).parent / "comfy_out" / "final"
RAW_DIR = OUT_DIR / "raw"
OUT_DIR.mkdir(parents=True, exist_ok=True)
RAW_DIR.mkdir(parents=True, exist_ok=True)

STATE_ORDER = IMV2.STATE_ORDER  # ["ruin", "wip", "l1", "l2", "l3"]
STATE_SUFFIX = IMV2.STATE_SUFFIX

# NIGHT_DENOISE = 0.3 was tried first and rejected: confirmed on town_bakery
# that the "night" output was nearly indistinguishable from its own base
# (same failure mode as comfy_buildings.py's RELIGHT_DENOISE=0.42 bug earlier
# this session -- too low to genuinely repaint lighting). Raised, and the
# night clause itself weight-emphasised (unweighted lost before, same lesson
# as everywhere else this session: content and style must compete at the
# same emphasis tier or one wins by default).
NIGHT_DENOISE = 0.5
NIGHT_ADDITION = (
    " (deep night, black-blue night sky, cool silver-blue moonlight rim on "
    "the roofline, the building mostly in cool dark shadow, glowing warm "
    "lit windows, lantern light spilling at the doorway, same building "
    "structure as the reference, only the lighting changes:1.4)"
)

# town_tailor has no approved sheet of its own -- borrow a donor cell purely
# for composition/framing guidance; its own SUBJECTS text supplies content.
TAILOR_DONOR_SHEET = Path(
    r"C:/Users/illum/OneDrive/Desktop/Hearth/Graphics and UI/Core/Map/Full Building Final/Forge.png"
)


def discover_sheets() -> dict[str, tuple[Path, list[str]]]:
    """art_id -> (sheet path that contains the midday row, that file's phase list).
    Mirrors import_map_v2.import_buildings()'s own discovery loop."""
    out: dict[str, tuple[Path, list[str]]] = {}
    for path in sorted(IMV2.BUILDINGS_DIR.glob("*.png")):
        stem = path.stem
        if stem.lower() in IMV2.SKIP_STEMS:
            continue
        building = IMV2.match_building(stem)
        if building is None or building not in IMV2.CANON:
            continue
        want = IMV2.ROW_PHASES.get(stem.lower().replace(" ", ""), IMV2.DEFAULT_PHASES)
        if "midday" not in want:
            continue  # the other half of a split sheet (e.g. LibraryB) has it instead
        out[IMV2.CANON[building]] = (path, want)
    return out


SHEETS = discover_sheets()


def crop_midday_cell(sheet_path: Path, want: list[str], s_idx: int) -> Image.Image:
    im = Image.open(sheet_path).convert("RGB")
    rows, cols = IMV2.sprite_grid(im, len(want))
    midday_row = rows[want.index("midday")]
    x0, x1 = cols[s_idx]
    return im.crop((x0, midday_row[0], x1, midday_row[1]))


def pad_and_resize(cell: Image.Image, padding_frac: float = 0.35) -> Image.Image:
    cw, ch = cell.size
    pad_w, pad_h = round(cw * padding_frac), round(ch * padding_frac)
    canvas = Image.new("RGB", (cw + 2 * pad_w, ch + 2 * pad_h), (255, 255, 255))
    canvas.paste(cell, (pad_w, pad_h))
    long_edge = max(canvas.width, canvas.height)
    scale = 1024 / long_edge
    new_w = round(canvas.width * scale / 8) * 8
    new_h = round(canvas.height * scale / 8) * 8
    return canvas.resize((new_w, new_h), Image.LANCZOS)


def stage_ref(im: Image.Image, name: str) -> str:
    COMFY_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    im.save(COMFY_INPUT_DIR / name)
    return name


def seed_for(stem: str) -> int:
    h = 0
    for ch in stem:
        h = (h * 131 + ord(ch)) & 0xFFFFFFFF
    return 70000 + (h % 700000)


def build_night_workflow(ref_image_name: str, subject: str, seed: int, filename_prefix: str) -> dict:
    positive = LOCK.positive_for(subject) + NIGHT_ADDITION
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": LOCK.CHECKPOINT}},
        "2": {"class_type": "LoadImage", "inputs": {"image": ref_image_name}},
        "3": {"class_type": "VAEEncode", "inputs": {"pixels": ["2", 0], "vae": ["1", 2]}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": positive, "clip": ["1", 1]}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"text": LOCK.NEGATIVE, "clip": ["1", 1]}},
        "6": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed, "steps": 28, "cfg": 6.5, "sampler_name": "dpmpp_2m",
                "scheduler": "karras", "denoise": NIGHT_DENOISE,
                "model": ["1", 0], "positive": ["4", 0], "negative": ["5", 0], "latent_image": ["3", 0],
            },
        },
        "7": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "8": {"class_type": "SaveImage", "inputs": {"images": ["7", 0], "filename_prefix": filename_prefix}},
    }


def run_graph(client: ComfyClient, wf: dict, stem: str) -> Path | None:
    code, resp = client.submit(wf)
    if code != 200 or "prompt_id" not in resp:
        print(f"  [{stem}] submit failed ({code}): {resp}")
        return None

    def tick(state, elapsed):
        if int(elapsed) % 10 == 0:
            print(f"  [{stem}] {state} ({elapsed:.0f}s)", end="\r")

    hist = client.poll_until_done(resp["prompt_id"], timeout_s=300, on_tick=tick)
    if hist is None or not client.status_ok(hist):
        print(f"  [{stem}] FAILED")
        return None
    media = client.collect_outputs(hist)
    if not media:
        print(f"  [{stem}] no output")
        return None
    m = media[0]
    src = COMFY_OUTPUT_DIR / m["subfolder"] / m["filename"] if m["subfolder"] else COMFY_OUTPUT_DIR / m["filename"]
    print(f"  [{stem}] done                              ")
    return src


def generate_one(client: ComfyClient, b_id: str, s_id: str, force: bool, base_only: bool = False) -> tuple[bool, bool]:
    """Returns (base_ok, night_ok). base_only=True skips the night pass entirely
    -- current focus is nailing the 5-state progression itself first."""
    ident = b_id + STATE_SUFFIX[s_id]
    s_idx = STATE_ORDER.index(s_id)
    subject = f"{SUBJECTS[b_id]} -- {STATE_TEXT[s_id]}"

    raw_base = RAW_DIR / f"{ident}_base.png"
    final_base = OUT_DIR / f"{ident}.png"
    base_ok = final_base.exists() and not force

    if not raw_base.exists() or force:
        if b_id in SHEETS:
            sheet_path, want = SHEETS[b_id]
        else:
            sheet_path, want = TAILOR_DONOR_SHEET, IMV2.DEFAULT_PHASES
        cell = crop_midday_cell(sheet_path, want, s_idx)
        ref_name = stage_ref(pad_and_resize(cell), f"_gen_base_ref_{ident}.png")
        wf = LOCK.build_workflow(ref_name, subject, seed_for(f"{ident}_base"), filename_prefix=f"{ident}_base")
        print(f"[{ident}] base submitting...")
        src = run_graph(client, wf, f"{ident}_base")
        if src is None:
            return False, False
        raw_base.write_bytes(src.read_bytes())

    if not base_ok:
        remove_bg_and_crop(raw_base, final_base)
        base_ok = True

    if base_only:
        return base_ok, True

    raw_night = RAW_DIR / f"{ident}_night.png"
    final_night = OUT_DIR / f"{ident}_night.png"
    night_ok = final_night.exists() and not force

    if not raw_night.exists() or force:
        ref_name = stage_ref(Image.open(raw_base).convert("RGB"), f"_gen_night_ref_{ident}.png")
        wf = build_night_workflow(ref_name, subject, seed_for(f"{ident}_night"), filename_prefix=f"{ident}_night")
        print(f"[{ident}] night submitting...")
        src = run_graph(client, wf, f"{ident}_night")
        if src is None:
            return base_ok, False
        raw_night.write_bytes(src.read_bytes())

    if not night_ok:
        remove_bg_and_crop(raw_night, final_night)
        night_ok = True

    return base_ok, night_ok


def cmd_list(_args) -> None:
    print(f"{len(SUBJECTS)} buildings x {len(STATE_ORDER)} states = {len(SUBJECTS) * len(STATE_ORDER)} base + same for night")
    for b_id in SUBJECTS:
        src = "own sheet" if b_id in SHEETS else "NO SHEET -- donor cell + text"
        print(f"  {b_id:20s} {src}")


def cmd_preview(args) -> None:
    if args.name not in SUBJECTS:
        print(f"unknown building '{args.name}'. Valid: {', '.join(SUBJECTS)}")
        return
    client = ComfyClient(COMFY_BASE)
    if not client.wait_ready(30):
        print("ComfyUI not reachable at", COMFY_BASE)
        return
    t0 = time.time()
    ok = fail = 0
    for s_id in STATE_ORDER:
        b_ok, n_ok = generate_one(client, args.name, s_id, args.force, base_only=args.base_only)
        ok += int(b_ok) + int(n_ok)
        fail += int(not b_ok) + int(not n_ok)
    print(f"\npreview '{args.name}': {ok} ok, {fail} failed, {(time.time() - t0) / 60:.1f} min.")
    if args.base_only:
        cmd_progression(args)
    else:
        cmd_contact_sheet(args)


def cmd_progression(args) -> None:
    """Single-row contact sheet of just the 5 base states -- for checking the
    ruin->wip->l1->l2->l3 growth trajectory reads clearly, no night pass."""
    from PIL import ImageDraw

    b_id = args.name
    cell = 260
    row = Image.new("RGB", (cell * len(STATE_ORDER), cell + 20), "#1a1512")
    draw = ImageDraw.Draw(row)
    for ci, s_id in enumerate(STATE_ORDER):
        ident = b_id + STATE_SUFFIX[s_id]
        p = OUT_DIR / f"{ident}.png"
        x = ci * cell
        if p.exists():
            im = Image.open(p).convert("RGB")
            im.thumbnail((cell - 4, cell - 4))
            row.paste(im, (x + 2, 2))
        draw.text((x + 4, cell + 4), s_id, fill="#f0c890")
    out = OUT_DIR / f"_progression_{b_id}.png"
    row.save(out)
    print("progression sheet:", out)


def cmd_contact_sheet(args) -> None:
    from PIL import ImageDraw

    b_id = args.name
    cell = 260
    sheet = Image.new("RGB", (cell * len(STATE_ORDER), cell * 2 + 30), "#1a1512")
    draw = ImageDraw.Draw(sheet)
    for ci, s_id in enumerate(STATE_ORDER):
        draw.text((ci * cell + 8, 4), s_id, fill="#f0c890")
    for ri, kind in enumerate(["base", "night"]):
        for ci, s_id in enumerate(STATE_ORDER):
            ident = b_id + STATE_SUFFIX[s_id]
            p = OUT_DIR / (f"{ident}.png" if kind == "base" else f"{ident}_night.png")
            x, y = ci * cell, ri * cell + 30
            if p.exists():
                im = Image.open(p).convert("RGB")
                im.thumbnail((cell - 4, cell - 34))
                sheet.paste(im, (x + 2, y + 2))
            draw.text((x + 4, y + cell - 14), kind, fill="#cbb790")
    out = OUT_DIR / f"_contact_{b_id}.png"
    sheet.save(out)
    print("contact sheet:", out)


def cmd_run(args) -> None:
    client = ComfyClient(COMFY_BASE)
    if not client.wait_ready(30):
        print("ComfyUI not reachable at", COMFY_BASE)
        return
    building_ids = [b for b in SUBJECTS if not args.only or b == args.only]
    total = len(building_ids) * len(STATE_ORDER)
    t0 = time.time()
    ok = fail = 0
    i = 0
    for b_id in building_ids:
        for s_id in STATE_ORDER:
            i += 1
            print(f"[{i}/{total}] {b_id}_{s_id}")
            b_ok, n_ok = generate_one(client, b_id, s_id, args.force, base_only=args.base_only)
            ok += int(b_ok) + int(n_ok)
            fail += int(not b_ok) + int(not n_ok)
    print(f"\nrun complete: {ok} ok, {fail} failed, {(time.time() - t0) / 60:.1f} min.")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list").set_defaults(fn=cmd_list)

    pv = sub.add_parser("preview")
    pv.add_argument("name")
    pv.add_argument("--force", action="store_true")
    pv.add_argument("--base-only", action="store_true", help="skip the night pass, just the 5-state progression")
    pv.set_defaults(fn=cmd_preview)

    cs = sub.add_parser("contact-sheet")
    cs.add_argument("name")
    cs.set_defaults(fn=cmd_contact_sheet)

    pg = sub.add_parser("progression")
    pg.add_argument("name")
    pg.set_defaults(fn=cmd_progression)

    r = sub.add_parser("run")
    r.add_argument("--only", help="single building id, e.g. town_bakery")
    r.add_argument("--force", action="store_true")
    r.add_argument("--base-only", action="store_true", help="skip the night pass, just the 5-state progression")
    r.set_defaults(fn=cmd_run)

    args = p.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
