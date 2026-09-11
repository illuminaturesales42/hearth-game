#!/usr/bin/env python3
"""
Drop in ANY real building reference sheet -- the same 5-state x 4-phase
matrix format as art-src/.../Full Building Final/*.png (Ruins|Under
Construction|Level 1|Level 2|Level 3 columns x Dawn/Midday/Dusk/Night rows,
e.g. Forge.png) -- and this restyles all 20 cells individually in one batch.

Unlike comfy_generate_buildings.py (which only needs ONE base image per state
plus an AI-synthesised night, because the engine's own runtime colour-grade
covers dawn/midday/dusk -- see docs/comfy-building-workflow.md), THIS tool is
for when you already have a real, professionally-composed sheet with all 4
phases genuinely hand-illustrated: it restyles every one of the 20 real cells
1:1, so all 4 phases keep their own authored lighting/composition exactly,
just repainted in the locked Hearth style (tools/comfy_style_lock.py).

How it knows what to create: it auto-detects the grid (import_map_v2's own
sprite_grid()/key_bg(), the same production grid-detection code) -- no manual
cropping needed, just point it at a sheet file. Building name for output
naming is auto-matched from the filename (import_map_v2.match_building);
override with --name if the filename doesn't contain a recognisable building
word.

Usage (ComfyUI venv):
    ../ComfyUI/venv/Scripts/python.exe tools/comfy_slice_and_style.py "path/to/Sheet.png" --list
    ../ComfyUI/venv/Scripts/python.exe tools/comfy_slice_and_style.py "path/to/Sheet.png" --preview
    ../ComfyUI/venv/Scripts/python.exe tools/comfy_slice_and_style.py "path/to/Sheet.png" [--name town_blacksmith] [--only ruin,wip] [--force]

--list     just report the detected grid + 20 planned output filenames, no generation
--preview  restyle ONE cell (ruin/dawn) only, for a quick style/composition check
--only     comma-separated state ids to restrict to (ruin,wip,l1,l2,l3)
--force    regenerate even if the output file already exists (resumable otherwise)

Output: tools/comfy_out/sliced/<sheet-stem>/<ident>.png, one file per cell,
named with the same STATE_SUFFIX + PHASE_SUFFIX convention import_map_v2.py
and the engine both use (e.g. town_blacksmith_l2_dusk.png).
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
from comfy_buildings import BUILDINGS as SUBJECTS, STATES as STATE_TEXT, PHASES as PHASE_TEXT  # noqa: E402
import import_map_v2 as IMV2  # noqa: E402
from PIL import Image  # noqa: E402

# RIGOROUS-CONSISTENCY FIX (2026-07-26): the first version of this tool
# restyled all 20 cells INDEPENDENTLY, each from its own raw sheet cell with
# its own random seed. Confirmed broken on Forge.png's full batch: even
# though the real source sheet has the SAME building across all 4 phases of
# a state (only lighting differs -- see the reference image itself), four
# independent denoise=0.6 img2img passes reinvented structural details
# differently every time (different window layout, different roof shape,
# banner position, etc. between dawn/midday/dusk/night of the SAME state).
# High denoise gives the model enough room to regenerate structure, and nothing
# forces four separate runs to agree with each other.
#
# Fixed with the same anchor+relight technique already proven in
# comfy_generate_buildings.py's base+night pass: style ONLY the midday cell
# from its real reference (denoise=LOCK.DENOISE, structural anchor), then
# derive dawn/dusk/night from THAT SAME STYLED OUTPUT via a second,
# LOW-denoise pass (RELIGHT_DENOISE) -- low enough that structure stays
# locked to the already-correct anchor, high enough to genuinely shift the
# lighting using each phase's own real PHASE_TEXT description. This
# guarantees consistency by construction instead of hoping independent runs
# converge.
#
# RELIGHT_DENOISE = 0.32 was tried first: IoU vs the anchor came out 0.99+
# (structure genuinely locked), BUT confirmed visually on town_blacksmith
# that dawn/dusk/night were barely distinguishable from midday -- same class
# of bug hit twice already this session (comfy_buildings.py's
# RELIGHT_DENOISE=0.42, comfy_generate_buildings.py's NIGHT_DENOISE=0.3):
# too low to genuinely repaint lighting, regardless of how hard the phase
# text is weighted. 0.5 is the value that actually shifted mood earlier this
# session (comfy_generate_buildings.py's night pass) -- raised to match.
# Structural lock will be slightly less perfect than 0.32's 0.99 IoU, but
# still anchored (not independent), and this is the actual tradeoff point:
# genuinely different lighting requires genuinely more repainting.
RELIGHT_DENOISE = 0.5
ANCHOR_PHASE = "midday"

COMFY_BASE = "http://127.0.0.1:8188"
COMFY_OUTPUT_DIR = Path(r"F:/sandbox/sulphur-2/ComfyUI/output")
COMFY_INPUT_DIR = Path(r"F:/sandbox/sulphur-2/ComfyUI/input")
BASE_OUT = Path(__file__).parent / "comfy_out" / "sliced"

STATE_ORDER = IMV2.STATE_ORDER  # ["ruin", "wip", "l1", "l2", "l3"]
STATE_SUFFIX = IMV2.STATE_SUFFIX
PHASE_SUFFIX = IMV2.PHASE_SUFFIX  # {"midday": "", "dawn": "_dawn", "dusk": "_dusk", "night": "_night"}


def detect_grid(sheet_path: Path) -> tuple[Image.Image, list[tuple[int, int]], list[tuple[int, int]], list[str]]:
    im = Image.open(sheet_path).convert("RGB")
    stem_key = sheet_path.stem.lower().replace(" ", "")
    want = IMV2.ROW_PHASES.get(stem_key, IMV2.DEFAULT_PHASES)
    rows, cols = IMV2.sprite_grid(im, len(want))
    if len(cols) != 5 or len(rows) != len(want):
        raise SystemExit(
            f"could not confidently detect a 5-state x {len(want)}-phase grid in "
            f"{sheet_path.name} (found {len(cols)} cols x {len(rows)} rows) -- "
            "check the sheet matches the standard matrix layout"
        )
    return im, rows, cols, want


def resolve_building_id(sheet_path: Path, override: str | None) -> str:
    if override:
        return override
    building = IMV2.match_building(sheet_path.stem)
    if building is None or building not in IMV2.CANON:
        raise SystemExit(
            f"couldn't auto-match a building name from '{sheet_path.stem}' -- pass --name explicitly, "
            f"e.g. --name town_blacksmith"
        )
    return IMV2.CANON[building]


def pad_and_resize(cell: Image.Image, padding_frac: float = LOCK.PADDING_FRAC) -> Image.Image:
    cw, ch = cell.size
    pad_w, pad_h = round(cw * padding_frac), round(ch * padding_frac)
    canvas = Image.new("RGB", (cw + 2 * pad_w, ch + 2 * pad_h), (255, 255, 255))
    canvas.paste(cell.convert("RGB"), (pad_w, pad_h))
    long_edge = max(canvas.width, canvas.height)
    scale = 1024 / long_edge
    new_w = round(canvas.width * scale / 8) * 8
    new_h = round(canvas.height * scale / 8) * 8
    return canvas.resize((new_w, new_h), Image.LANCZOS)


def seed_for(stem: str) -> int:
    h = 0
    for ch in stem:
        h = (h * 131 + ord(ch)) & 0xFFFFFFFF
    return 80000 + (h % 800000)


def build_relight_workflow(ref_image_name: str, subject: str, phase_id: str, seed: int, filename_prefix: str) -> dict:
    """img2img from an already-STYLED anchor image (not the raw sheet cell),
    at RELIGHT_DENOISE -- what actually keeps structure locked across phases."""
    positive = LOCK.positive_for(subject) + f" ({PHASE_TEXT[phase_id]}:1.5)"
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
                "scheduler": "karras", "denoise": RELIGHT_DENOISE,
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


def cell_jobs(sheet_path: Path, b_id: str, only_states: set[str] | None) -> list[tuple[str, int, int]]:
    """[(ident, col_idx, row_idx), ...] for every cell to process."""
    _, rows, cols, want = detect_grid(sheet_path)
    jobs = []
    for ci, s_id in enumerate(STATE_ORDER):
        if ci >= len(cols):
            break
        if only_states and s_id not in only_states:
            continue
        for ri, p_id in enumerate(want):
            if ri >= len(rows):
                break
            ident = b_id + STATE_SUFFIX[s_id] + PHASE_SUFFIX[p_id]
            jobs.append((ident, ci, ri))
    return jobs


def cmd_list(args) -> None:
    sheet_path = Path(args.sheet)
    b_id = resolve_building_id(sheet_path, args.name)
    im, rows, cols, want = detect_grid(sheet_path)
    print(f"{sheet_path.name}: {len(cols)} states x {len(rows)} phases ({', '.join(want)}) -> building id '{b_id}'")
    for ident, ci, ri in cell_jobs(sheet_path, b_id, None):
        print(f"  {ident}.png")


def generate_state(client: ComfyClient, out_dir: Path, sheet_im: Image.Image, rows, cols, s_id: str,
                    ci: int, want: list[str], b_id: str, subject_extra: str, force: bool) -> tuple[int, int]:
    """Styles the anchor (midday) cell from the real sheet, then relights every
    other phase from THAT styled output at low denoise. Returns (ok, fail)."""
    ok = fail = 0
    subject = f"{subject_extra} -- {STATE_TEXT[s_id]}"

    anchor_ri = want.index(ANCHOR_PHASE) if ANCHOR_PHASE in want else 0
    anchor_p_id = want[anchor_ri]
    anchor_ident = b_id + STATE_SUFFIX[s_id] + PHASE_SUFFIX[anchor_p_id]
    anchor_dest = out_dir / f"{anchor_ident}.png"
    anchor_raw = out_dir / f"_raw_{anchor_ident}.png"

    if not anchor_raw.exists() or force:
        x0, x1 = cols[ci]
        y0, y1 = rows[anchor_ri]
        cell = sheet_im.crop((x0, y0, x1, y1))
        ref_padded = pad_and_resize(IMV2.key_bg(cell))
        ref_name = f"_slice_ref_{anchor_ident}.png"
        COMFY_INPUT_DIR.mkdir(parents=True, exist_ok=True)
        ref_padded.save(COMFY_INPUT_DIR / ref_name)

        wf = LOCK.build_workflow(ref_name, subject, seed_for(anchor_ident), filename_prefix=anchor_ident)
        print(f"[{anchor_ident}] (anchor) submitting...")
        src = run_graph(client, wf, anchor_ident)
        if src is None:
            return 0, len(want)
        anchor_raw.write_bytes(src.read_bytes())

    if not anchor_dest.exists() or force:
        remove_bg_and_crop(anchor_raw, anchor_dest)
    ok += 1

    # stage the STYLED anchor (not the raw sheet cell) as the relight source
    anchor_ref_name = f"_slice_relight_src_{anchor_ident}.png"
    COMFY_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    Image.open(anchor_raw).convert("RGB").save(COMFY_INPUT_DIR / anchor_ref_name)

    for ri, p_id in enumerate(want):
        if p_id == anchor_p_id:
            continue
        if ri >= len(rows):
            continue
        ident = b_id + STATE_SUFFIX[s_id] + PHASE_SUFFIX[p_id]
        dest = out_dir / f"{ident}.png"
        raw = out_dir / f"_raw_{ident}.png"
        if dest.exists() and not force:
            ok += 1
            continue
        if not raw.exists() or force:
            wf = build_relight_workflow(anchor_ref_name, subject, p_id, seed_for(ident), filename_prefix=ident)
            print(f"[{ident}] (relight from anchor) submitting...")
            src = run_graph(client, wf, ident)
            if src is None:
                fail += 1
                continue
            raw.write_bytes(src.read_bytes())
        remove_bg_and_crop(raw, dest)
        ok += 1

    return ok, fail


def cmd_preview(args) -> None:
    sheet_path = Path(args.sheet)
    b_id = resolve_building_id(sheet_path, args.name)
    im, rows, cols, want = detect_grid(sheet_path)
    subject_extra = SUBJECTS.get(b_id, b_id)
    out_dir = BASE_OUT / sheet_path.stem
    out_dir.mkdir(parents=True, exist_ok=True)

    client = ComfyClient(COMFY_BASE)
    if not client.wait_ready(30):
        print("ComfyUI not reachable at", COMFY_BASE)
        return
    ok, fail = generate_state(client, out_dir, im, rows, cols, "ruin", 0, want, b_id, subject_extra, args.force)
    print(f"preview: {ok} ok, {fail} failed")


def cmd_run(args) -> None:
    sheet_path = Path(args.sheet)
    b_id = resolve_building_id(sheet_path, args.name)
    im, rows, cols, want = detect_grid(sheet_path)
    subject_extra = SUBJECTS.get(b_id, b_id)
    out_dir = BASE_OUT / sheet_path.stem
    out_dir.mkdir(parents=True, exist_ok=True)
    only_states = set(args.only.split(",")) if args.only else None

    client = ComfyClient(COMFY_BASE)
    if not client.wait_ready(30):
        print("ComfyUI not reachable at", COMFY_BASE)
        return

    ok = fail = 0
    t0 = time.time()
    for ci, s_id in enumerate(STATE_ORDER):
        if ci >= len(cols):
            break
        if only_states and s_id not in only_states:
            continue
        print(f"=== {b_id}{STATE_SUFFIX[s_id]} ===")
        s_ok, s_fail = generate_state(client, out_dir, im, rows, cols, s_id, ci, want, b_id, subject_extra, args.force)
        ok += s_ok
        fail += s_fail
    print(f"\n{ok} ok, {fail} failed. {(time.time() - t0) / 60:.1f} min. Output: {out_dir}")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("sheet", help="path to a matrix reference sheet image")
    p.add_argument("--name", help="override the auto-detected building id, e.g. town_blacksmith")
    p.add_argument("--list", action="store_true")
    p.add_argument("--preview", action="store_true")
    p.add_argument("--only", help="comma-separated state ids to restrict to, e.g. ruin,wip")
    p.add_argument("--force", action="store_true")
    args = p.parse_args()

    if args.list:
        cmd_list(args)
    elif args.preview:
        cmd_preview(args)
    else:
        cmd_run(args)


if __name__ == "__main__":
    main()
