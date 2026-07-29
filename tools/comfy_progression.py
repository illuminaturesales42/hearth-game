"""
Test a building's five-state upgrade path for identity + growth.

The question this answers: do ruin -> under construction -> L1 -> L2 -> L3 read
as ONE building being restored, or as five different buildings?

Two mechanisms carry that, and they do different jobs:

  GROWTH comes from Canny. Each state's edge map is taken from the artist's own
  reference sheet, where the forge genuinely grows — correct relative size,
  correct roof integrity. Structure is inherited for free, which is why the
  state clauses below describe material and condition ONLY, never size or
  completeness (worksheet §0).

  IDENTITY comes from an IPAdapter pointed at the APPROVED L1 render — the
  stone colour, roof material and palette that make it recognisably the same
  forge. Note this is a different use from the style board that the 07-28 sweep
  rejected: there we asked an adapter to carry brushwork from portraits (it
  carried their parchment instead); here we ask it to carry materials from a
  render of this very building, which is what the adapter is actually good at.

Because that distinction is a hypothesis and not a fact, --compare renders each
state BOTH with and without the identity reference, so the contact sheet shows
whether it earns its place.

Order matters: L1 is the anchor and must be approved before the rest run.

Usage (ComfyUI venv interpreter so --cutout can reach rembg):
  F:/sandbox/sulphur-2/ComfyUI/venv/Scripts/python.exe tools/comfy_progression.py
  ...                                             --compare        both variants
  ...                                             --cutout         + game sprites
  ...                                             --anchor PATH    a different L1
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from comfy_dialin import (  # noqa: E402 — sibling tool, path set above
    CHECKPOINTS,
    NEGATIVE,
    OUT_DIR as DIALIN_DIR,
    PROMPT_GUIDE,
    PROMPT_PAINT,
    fix_for,
    REPO,
    SUBJECTS,
    build_graph,
    contact_sheet,
    find_refcell,
    queue_and_wait,
    upload_image,
)

OUT_DIR = REPO / "tools" / "comfy_out" / "progression"

# Ruin and wip kept rendering their interior ground as warm timber decking.
# The first fix attempt put "NO wooden floor, NOT orange" in the POSITIVE
# prompt and changed nothing — CLIP has no notion of negation, so those tokens
# read as "wooden floor, orange" and reinforced the very thing they forbade.
# Unwanted content belongs in the negative; the positive only ever states what
# IS wanted. Applied per state, because L1-L3 have a warm wooden deck by design
# and a global ban would wreck them.
FLOWER_NEG = (
    "yellow flowers, flowering scrub, wildflowers, blossom, golden foliage, "
    "autumn colours, orange shrubs, bright yellow"
)
GROUND_NEG = (
    "orange floor, terracotta floor tiles, red clay paving, warm orange ground, "
    "wooden floor, timber decking, wooden planks on the ground, polished wood, "
    "warm brown floorboards, " + FLOWER_NEG
)

# Worksheet §4 — condition and material only. No size language, no weights:
# the edge map already carries size, layout and roof integrity, and the old
# weighted comparatives ("visibly bigger than level 1") fought each other.
# Fifth field: extra negative terms for that state (None = the shared one).
STATES = [
    (
        "ruin",
        "forge_ref_ruin.png",
        (1024, 840),
        "derelict and long abandoned, crumbling bare stone, weathered, soft green "
        "moss and grey lichen on the stone, muted sage green, empty dark openings "
        "with no glass, "
        "(the ground inside the walls is cold grey weathered flagstone, ashen "
        "slate-grey paving, lichen and dust, desaturated cool stone:1.45)",
        GROUND_NEG,
    ),
    (
        "wip",
        "forge_ref_wip.png",
        (1024, 832),
        "under active reconstruction, fresh pale new-cut timber scaffolding and "
        "ladders, raw unfinished stonework, building materials stacked about, "
        "(the ground inside the walls is cold grey weathered flagstone, ashen "
        "slate-grey paving, rubble and dust, desaturated cool stone:1.45)",
        GROUND_NEG,
    ),
    (
        "l1",
        "forge_ref_l1.png",
        (1024, 848),
        "(the FIRST and plainest restoration, the simplest and least decorated "
        "version of this building, bare and minimal:1.35), clean plain honest "
        "stonework, one simple sound roof, one window warmly lit, no ornament, "
        "no extensions, no decoration, modest and sparse but cared for",
        None,
    ),
    (
        "l2",
        "forge_ref_l2.png",
        (1024, 808),
        "(the MIDDLE stage, clearly more developed than the first but clearly "
        "NOT the final grandest version:1.3), comfortably established, a modest "
        "side extension, a few flower boxes, a tidy swept yard, some windows "
        "warmly lit, chimney smoke, still plain in its finishes, no bunting and "
        "no gilding yet",
        None,
    ),
    (
        "l3",
        "forge_ref_l3.png",
        (1024, 792),
        "(the grandest and final stage, visibly the most prosperous and most "
        "ornate version of this building:1.4), richly carved timber detailing "
        "and moulded trim, festival bunting strung along every eave, hanging "
        "lanterns lit, overflowing flower boxes and planters, copper and "
        "gilded accents, every single window glowing warm, banners and "
        "decorative finials, immaculate and thriving",
        None,
    ),
]

# Shared lookup for the multi-building runner (tools/comfy_village.py):
# state -> (clause, extra negative). Derived from STATES so there is exactly
# one definition of what each state means.
STATE_CLAUSES = {name: (clause, neg) for name, _cell, _size, clause, neg in STATES}
FLOWER_NEG_STATES = {"ruin", "wip"}

IDENTITY_REF_NAME = "_prog_identity_l1.png"
DEFAULT_IDENTITY_WEIGHT = 0.5  # worksheet §3

# ------------------------------------------------------------------ MATERIALS
# The 2026-07-28 progression test found the roof flipping teal -> orange -> teal
# across L1/L2/L3. Diagnosis: Canny carries SHAPE but not COLOUR, the seed can't
# help because each state has a different prompt and latent size, and nothing
# told the model what the building is made of — so it re-imagined the materials
# every render. An identity IPAdapter at 0.5 did not fix it (and dragged the
# reference's backdrop in, the same failure the style-board sweep found).
#
# The reliable lock is to STATE the materials, in every state, exactly as the
# state clauses state the condition. Shape from Canny, condition from the state
# clause, materials from here.
# Hexes sampled from the Building Style Guide's own swatches
# (tools/comfy_style_guide.py -> tools/comfy_out/style_guide.json).
MATERIALS = {
    "forge": (
        "teal slate roof tiles #45625e #355654, warm grey-brown fieldstone walls "
        "#897153 #b1926b, rich brown timber beams #7b4a23 #be8551, copper accents"
    ),
    "bakery": (
        "teal slate roof tiles #45625e #355654, warm cream plaster over stone "
        "#c79867, rich brown timber beams #7b4a23 #be8551, copper accents"
    ),
}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--subject", default="forge", choices=sorted(SUBJECTS))
    ap.add_argument(
        "--anchor",
        default=None,
        help="approved L1 render to carry identity from (default: the winner from the dial-in sweep)",
    )
    ap.add_argument("--weight", type=float, default=DEFAULT_IDENTITY_WEIGHT)
    ap.add_argument("--compare", action="store_true", help="render each state with AND without the identity ref")
    ap.add_argument("--cutout", action="store_true", help="also write transparent game-scale sprites")
    ap.add_argument("--sheet-only", action="store_true")
    ap.add_argument("--materials", default=None, help="override the shared material clause")
    ap.add_argument("--no-materials", action="store_true", help="omit it (reproduces the roof-drift bug)")
    ap.add_argument("--tag", default="", help="suffix for output names, to keep a variant set side by side")
    ap.add_argument("--states", default=None, help="comma-separated subset, e.g. l2,l3")
    ap.add_argument("--prompt", default="paint", choices=["paint", "guide"], help="style dialect")
    ap.add_argument(
        "--ipa-all",
        action="store_true",
        help="apply the IPAdapter to L1 too — correct when --anchor is an EXTERNAL style board "
        "(the L1 exception only exists to stop a render referencing itself)",
    )
    args = ap.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    subject = SUBJECTS[args.subject]
    ckpt = CHECKPOINTS["realvis"]  # the locked winner

    anchor = Path(args.anchor) if args.anchor else DIALIN_DIR / "realvis_paint_noipa.png"
    variants = ["ident", "plain"] if args.compare else ["ident"]
    tag = f"_{args.tag}" if args.tag else ""
    materials = "" if args.no_materials else (args.materials or MATERIALS.get(args.subject, ""))
    states = [s for s in STATES if not args.states or s[0] in args.states.split(",")]

    if not args.sheet_only:
        if not anchor.exists():
            sys.exit(
                f"No approved L1 anchor at {anchor}.\n"
                "Render one first:  tools/comfy_dialin.py --winner"
            )
        identity_name = upload_image(anchor, IDENTITY_REF_NAME)
        print(f"identity anchor: {anchor.name} -> {identity_name}")

        for state, cell, size, clause, extra_neg in states:
            ref_name = upload_image(find_refcell(cell), f"_prog_{cell}")
            # shape from Canny · materials from MATERIALS · condition from the clause
            body = f"{subject['clause']}, {materials}" if materials else subject["clause"]
            template = PROMPT_GUIDE if args.prompt == "guide" else PROMPT_PAINT
            positive = template.format(subject=f"{body} -- {clause}", fix=fix_for(state)) if template is PROMPT_GUIDE else template.format(subject=f"{body} -- {clause}")
            for variant in variants:
                dest = OUT_DIR / f"{args.subject}_{state}_{variant}{tag}.png"
                if dest.exists():
                    print(f"  {dest.name} exists, skipping")
                    continue
                # L1 is the anchor itself — never re-derive its identity from itself.
                skip_l1 = state == "l1" and not args.ipa_all
                ipa = None if (variant == "plain" or skip_l1) else (args.weight, "style transfer")
                negative = f"{NEGATIVE}, {extra_neg}" if extra_neg else NEGATIVE
                graph = build_graph(ckpt, positive, ipa, ref_name, identity_name, size, negative)
                try:
                    dest.write_bytes(queue_and_wait(graph))
                    print(f"  {dest.name}")
                except Exception as e:  # noqa: BLE001 — one bad state shouldn't kill the run
                    print(f"  {dest.name} FAILED: {e}")

    # Sheet laid in upgrade order so the progression is judgeable at a glance.
    for variant in variants:
        cells = []
        for state, *_ in states:
            p = OUT_DIR / f"{args.subject}_{state}_{variant}{tag}.png"
            if p.exists():
                cells.append((f"{state}  ({variant})", p))
        if cells:
            sheet = OUT_DIR / f"{args.subject}_progression_{variant}{tag}.png"
            contact_sheet(cells, sheet, cols=5)
            print(f"progression sheet: {sheet}  ({len(cells)} states)")

    if args.cutout:
        from comfy_cutout import cutout  # noqa: PLC0415 — optional dependency

        cut_dir = REPO / "tools" / "comfy_out" / "cutout"
        cut_dir.mkdir(parents=True, exist_ok=True)
        cut_cells = []
        for state, *_ in states:
            p = OUT_DIR / f"{args.subject}_{state}_{variants[0]}{tag}.png"
            if not p.exists():
                continue
            im, stats = cutout(p, 320, 6)
            dest = cut_dir / f"{args.subject}_{state}{tag}.png"
            im.save(dest)
            cut_cells.append((f"{state}  {stats['size']}", dest))
            ok = max(stats["corners"]) == 0
            print(f"  cutout {dest.name}  {stats['size']}  corners {'clear' if ok else stats['corners']}")
        if cut_cells:
            sheet = cut_dir / f"{args.subject}_progression_cut{tag}.png"
            contact_sheet(cut_cells, sheet, cols=5)
            print(f"cutout progression: {sheet}")


if __name__ == "__main__":
    main()
