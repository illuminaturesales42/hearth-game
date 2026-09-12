#!/usr/bin/env python3
"""
Scales the validated comfy_style_test.py technique (single img2img restyle
pass, locked style) across an ENTIRE reference sheet: all 20 cells (5 states
x 4 phases) of one building, each restyled independently from its own real
sheet cell, using the exact style/negative prompt confirmed working in the
single-cell test.

Style is LOCKED here (STYLE/COMPOSITION/NEGATIVE copied verbatim from
comfy_style_test.py, not re-derived) -- do not tune wording per-cell; if the
style needs a change, change it in comfy_style_test.py, re-validate on one
cell, then copy the change back here.

Padding fix: the raw sheet cells are tightly cropped to content (near-zero
margin at the crop boundary) -- img2img at denoise 0.6 mostly repaints in
place, so a tight source stays tight. Each cell is padded onto a larger
white canvas (comfortable extra margin) BEFORE the SDXL-resolution resize,
so the model has real empty space to work with and the subject has honest
breathing room in the output, not just at the original crop's tight edge.

Usage:
    ../ComfyUI/venv/Scripts/python.exe tools/comfy_style_batch.py [sheet.png] [building_id]

Writes:
    tools/comfy_out/style_batch/<building>_<state>_<phase>.png  (20 files)
    tools/comfy_out/style_batch/_contact_<building>.png          (review sheet)
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
AUTOPILOT_DIR = Path(r"F:/sandbox/sulphur-2/comfy-autopilot")
sys.path.insert(0, str(AUTOPILOT_DIR))
from autopilot.client import ComfyClient  # noqa: E402
from import_map_v2 import sprite_grid  # noqa: E402
from PIL import Image  # noqa: E402
import comfy_style_lock as LOCK  # noqa: E402 -- single source of truth for the prompt

COMFY_BASE = "http://127.0.0.1:8188"
COMFY_OUTPUT_DIR = Path(r"F:/sandbox/sulphur-2/ComfyUI/output")
COMFY_INPUT_DIR = Path(r"F:/sandbox/sulphur-2/ComfyUI/input")
OUT_DIR = Path(__file__).parent / "comfy_out" / "style_batch"
OUT_DIR.mkdir(parents=True, exist_ok=True)

DEFAULT_SHEET = Path(r"C:/Users/illum/OneDrive/Desktop/Hearth/Graphics and UI/Core/Map/Full Building Final/Forge.png")
STATE_ORDER = ["ruin", "wip", "l1", "l2", "l3"]
PHASE_ORDER = ["dawn", "midday", "dusk", "night"]  # matches sheet row order

PADDING_FRAC = LOCK.PADDING_FRAC

STATE_DESC = {
    "ruin": "a storm-battered ruin, roof caved in, walls crumbled to rubble",
    "wip": "half-built and under active repair, wooden scaffolding, a construction site",
    "l1": "freshly finished and humbly restored, plain roof and walls, simple and sound",
    "l2": "well-established with a small tended garden, chimney smoke rising, lived-in",
    "l3": "flourishing and grand, festival banners and bunting, richly finished, thriving",
}


def pad_and_resize(cell: Image.Image) -> Image.Image:
    cw, ch = cell.size
    pad_w = round(cw * PADDING_FRAC)
    pad_h = round(ch * PADDING_FRAC)
    canvas = Image.new("RGB", (cw + 2 * pad_w, ch + 2 * pad_h), (255, 255, 255))
    canvas.paste(cell, (pad_w, pad_h))
    long_edge = max(canvas.width, canvas.height)
    scale = 1024 / long_edge
    new_w = round(canvas.width * scale / 8) * 8
    new_h = round(canvas.height * scale / 8) * 8
    return canvas.resize((new_w, new_h), Image.LANCZOS)


def seed_for(stem: str) -> int:
    h = 0
    for ch in stem:
        h = (h * 131 + ord(ch)) & 0xFFFFFFFF
    return 60000 + (h % 600000)


def build_contact_sheet(building: str) -> Path:
    from PIL import ImageDraw

    cell = 260
    sheet = Image.new("RGB", (cell * len(STATE_ORDER), cell * len(PHASE_ORDER) + 30), "#1a1512")
    draw = ImageDraw.Draw(sheet)
    for ci, s_id in enumerate(STATE_ORDER):
        draw.text((ci * cell + 8, 4), s_id, fill="#f0c890")
    for ri, p_id in enumerate(PHASE_ORDER):
        for ci, s_id in enumerate(STATE_ORDER):
            p = OUT_DIR / f"{building}_{s_id}_{p_id}.png"
            x, y = ci * cell, ri * cell + 30
            if p.exists():
                im = Image.open(p).convert("RGB")
                im.thumbnail((cell - 4, cell - 34))
                sheet.paste(im, (x + 2, y + 2))
            draw.text((x + 4, y + cell - 14), p_id, fill="#cbb790")
    out = OUT_DIR / f"_contact_{building}.png"
    sheet.save(out)
    return out


def main() -> None:
    sheet_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SHEET
    building = sys.argv[2] if len(sys.argv) > 2 else sheet_path.stem.lower()
    if not sheet_path.exists():
        print(f"sheet not found: {sheet_path}")
        return

    im = Image.open(sheet_path).convert("RGB")
    rows, cols = sprite_grid(im, 4)
    if len(rows) != 4 or len(cols) != 5:
        print(f"grid detection failed: {len(rows)} rows, {len(cols)} cols (expected 4x5)")
        return

    client = ComfyClient(COMFY_BASE)
    if not client.wait_ready(30):
        print("ComfyUI not reachable at", COMFY_BASE)
        return

    COMFY_INPUT_DIR.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    ok = fail = 0
    for ri, p_id in enumerate(PHASE_ORDER):
        y0, y1 = rows[ri]
        for ci, s_id in enumerate(STATE_ORDER):
            x0, x1 = cols[ci]
            stem = f"{building}_{s_id}_{p_id}"
            dest = OUT_DIR / f"{stem}.png"
            cell = im.crop((x0, y0, x1, y1))
            padded = pad_and_resize(cell)
            ref_name = f"_style_batch_ref_{stem}.png"
            padded.save(COMFY_INPUT_DIR / ref_name)

            wf = LOCK.build_workflow(ref_name, STATE_DESC[s_id], seed_for(stem), filename_prefix="style_batch")
            print(f"[{stem}] submitting...")
            code, resp = client.submit(wf)
            if code != 200 or "prompt_id" not in resp:
                print(f"  [{stem}] submit failed ({code}): {resp}")
                fail += 1
                continue

            def tick(state, elapsed):
                if int(elapsed) % 10 == 0:
                    print(f"  [{stem}] {state} ({elapsed:.0f}s)", end="\r")

            hist = client.poll_until_done(resp["prompt_id"], timeout_s=300, on_tick=tick)
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
            dest.write_bytes(src.read_bytes())
            print(f"  [{stem}] done                              ")
            ok += 1

    contact = build_contact_sheet(building)
    print(f"\n{ok} ok, {fail} failed. {(time.time() - t0) / 60:.1f} min.")
    print("contact sheet:", contact)


if __name__ == "__main__":
    main()
