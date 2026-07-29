"""
Render MANY buildings with the one locked recipe, to test that the style
holds across different architecture.

A recipe that produces one lovely forge proves very little. The real question
is whether fourteen different buildings — a bakery, a lighthouse, a quarry —
come out looking like they belong in the same village. That needs the style
constrained to a shared contract and only the subject varying, which is
exactly what comfy_dialin's STONE_FORWARD / MOSS_GREEN / GUIDE_* constants and
its per-building SUBJECT_CLAUSES / MATERIALS provide.

LOCKED RECIPE (sweep 2 winner, `g2_realvis_guide_gb045`):
  RealVisXL_V5.0 · the Building Style Guide prompt with its sampled palette ·
  guide-board IPAdapter at 0.45 · the Canny structure spine (strength 0.95,
  released at 0.72, seed 777777, txt2img denoise 1.0)

Usage (ComfyUI venv interpreter — --cutout needs rembg):
  ...python.exe tools/comfy_village.py bakery cottage quarry --cutout
  ...python.exe tools/comfy_village.py --all --cutout        # every building
  ...python.exe tools/comfy_village.py bakery --states all   # full progression
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from comfy_dialin import (  # noqa: E402 — sibling tool, path set above
    CHECKPOINTS,
    LOCKED_CHECKPOINT,
    LOCKED_IPA_TYPE,
    LOCKED_IPA_WEIGHT,
    MOSS_GREEN,
    NEGATIVE,
    CN_END_L3,
    CN_END_RUIN,
    PLAIN_L1_NEG,
    QUARRY_NEG,
    ROOF_NEG,
    REPO,
    STONE_FORWARD,
    SUBJECT_CLAUSES,
    build_graph,
    canny_for,
    contact_sheet,
    guide_prompt,
    materials_for,
    find_refcell,
    queue_and_wait,
    subject_spec,
    upload_image,
)
from comfy_progression import FLOWER_NEG_STATES, STATE_CLAUSES  # noqa: E402

OUT_DIR = REPO / "tools" / "comfy_out" / "village"
GUIDE_BOARD = REPO / "tools" / "comfy_out" / "_guide_board_prog.png"
# Ruins reference the guide's own ruin panel — grey stone and green moss —
# instead of the teal-roofed buildings board.
RUIN_BOARD = REPO / "tools" / "comfy_out" / "_guide_board_ruin.png"
WIP_BOARD = REPO / "tools" / "comfy_out" / "_guide_board_wip.png"
IPA_WEIGHT = LOCKED_IPA_WEIGHT  # from the locked recipe in comfy_dialin
# TESTED AND REJECTED: 0.3 for roofless states. The theory was that the ruin
# and scaffolding boards, being desaturated, were washing warmth out — so a
# weaker board would let the prompt's stone and timber colours through. It did
# the opposite. At 0.3 all four test renders got GREYER and more photoreal, and
# the bakery ruin lost its backdrop entirely (it split into a grey wall and
# floor) — the board was supplying coherence, not stealing warmth. The
# desaturation is in the guide's own ruin/wip panels, so the fix, if wanted, is
# a warmer board, not a weaker one.
ROOFLESS_IPA_WEIGHT = LOCKED_IPA_WEIGHT

# A ruin kept coming out as a tall intact archway with a pristine hinged door.
# The positive clauses now ask for broken stubs and empty openings; these push
# back on what it was reaching for instead.
RUIN_NEG = (
    "intact door, closed door, new door, hinged door leaf, glazed window, "
    "tall archway, gothic arch, standing arch, complete arch, cathedral ruin, "
    "romantic folly, intact roof, ivy-covered arch"
)


def render(building: str, state: str, boards: dict[str, str], force: bool = False) -> Path | None:
    spec = subject_spec(building)
    cell = f"{building}_ref_{state}.png"
    try:
        cell_path = find_refcell(cell)
    except SystemExit:
        print(f"  {building}/{state}: no reference cell — run tools/comfy_refcells.py")
        return None
    from PIL import Image

    with Image.open(cell_path) as im:
        size = im.size

    dest = OUT_DIR / f"{building}_{state}.png"
    if dest.exists() and not force:
        print(f"  {building}/{state} exists, skipping")
        return dest

    clause, extra_neg = STATE_CLAUSES[state]
    body = f"{spec['clause']}, {materials_for(building, state)}, {STONE_FORWARD}"
    positive = guide_prompt(f"{body} -- {clause}", state)
    negative = f"{NEGATIVE}, {extra_neg}" if extra_neg else NEGATIVE
    if state == "ruin":
        negative += ", " + RUIN_NEG
    if state in ("l1", "l2", "l3"):
        negative += ", " + ROOF_NEG  # a restored building is never see-through
    if state == "l1":
        negative += ", " + PLAIN_L1_NEG
    if building == "quarry":
        negative += ", " + QUARRY_NEG  # its rock kept coming out blue

    ref_name = upload_image(cell_path, f"_village_{cell}")
    graph = build_graph(
        CHECKPOINTS[LOCKED_CHECKPOINT], positive,
        (ROOFLESS_IPA_WEIGHT if state in ("ruin", "wip") else IPA_WEIGHT, LOCKED_IPA_TYPE), ref_name,
        boards.get(state, boards["default"]), size,
        negative,
        CN_END_RUIN if state == "ruin" else (CN_END_L3 if state == "l3" else None),
        canny_for(cell_path, state),
    )
    try:
        dest.write_bytes(queue_and_wait(graph))
    except Exception as e:  # noqa: BLE001 — one failure must not kill the batch
        print(f"  {building}/{state} FAILED: {e}")
        return None
    print(f"  {building}/{state} -> {dest.name}  {size[0]}x{size[1]}")
    return dest


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("buildings", nargs="*")
    ap.add_argument("--all", action="store_true", help="every building with a subject clause")
    ap.add_argument("--states", default="l1", help="'l1' (default), 'all', or e.g. ruin,l1,l3")
    ap.add_argument("--cutout", action="store_true")
    ap.add_argument("--force", action="store_true", help="re-render even if the file exists")
    args = ap.parse_args()

    buildings = sorted(SUBJECT_CLAUSES) if args.all else args.buildings
    if not buildings:
        raise SystemExit("Name buildings, or pass --all. Known: " + ", ".join(sorted(SUBJECT_CLAUSES)))
    states = list(STATE_CLAUSES) if args.states == "all" else args.states.split(",")

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if not GUIDE_BOARD.exists():
        raise SystemExit("Guide board missing — run tools/comfy_style_guide.py first.")
    board_name = upload_image(GUIDE_BOARD, "_village_guide_board.png")
    boards = {"default": board_name}
    for st, path in (("ruin", RUIN_BOARD), ("wip", WIP_BOARD)):
        if not path.exists():
            raise SystemExit(f"{st} board missing — re-run tools/comfy_style_guide.py.")
        boards[st] = upload_image(path, f"_village_guide_board_{st}.png")
    print(f"style board: {board_name}   recipe: realvis + guide prompt + board@{IPA_WEIGHT}\n")

    made: list[tuple[str, Path]] = []
    for b in buildings:
        for s in states:
            p = render(b, s, boards, args.force)
            if p:
                made.append((f"{b} {s}" if len(states) > 1 else b, p))

    if made:
        cols = min(5, len(made))
        stem = f"{buildings[0]}_" if len(buildings) == 1 else ""
        sheet = OUT_DIR / f"village_{stem}{'_'.join(states)}.png"
        contact_sheet(made, sheet, cols=cols)
        print(f"\nsheet: {sheet}  ({len(made)} renders)")

    if args.cutout and made:
        from comfy_cutout import cutout  # noqa: PLC0415 — optional dependency

        cut_dir = REPO / "tools" / "comfy_out" / "cutout" / "village"
        cut_dir.mkdir(parents=True, exist_ok=True)
        cells = []
        for label, p in made:
            im, stats = cutout(p, 320, 6)
            d = cut_dir / p.name
            im.save(d)
            ok = max(stats["corners"]) == 0
            print(f"  cutout {d.name}  {stats['size']}  corners {'clear' if ok else stats['corners']}")
            cells.append((f"{label}  {stats['size']}", d))
        stem = f"{buildings[0]}_" if len(buildings) == 1 else ""
        cut_sheet = cut_dir / f"village_cut_{stem}{'_'.join(states)}.png"
        contact_sheet(cells, cut_sheet, cols=min(5, len(cells)))
        print(f"cutout sheet: {cut_sheet}")


if __name__ == "__main__":
    main()
