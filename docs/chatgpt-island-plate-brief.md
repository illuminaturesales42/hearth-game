# ChatGPT / DALL·E brief — Emberhollow art (Batch 15)

Paste the prompts below into ChatGPT (GPT-4o image generation). **Upload two
reference images with the first prompt** so it matches Hearth's style and layout:

1. **Style + world reference:** `Core/Final Assets/Batch 2 - 4 World & Map Merch Products chain.png` (or just the "Landing / Overworld Map" panel from it) — the warm, hand-painted island look to match.
2. **Layout guide:** `Core/Final Assets/Batch 15/PLOT_MASK_map_island_plate.png` — where the building plots, coastline, lighthouse point and dock bay go.

> **Reality check:** DALL·E outputs ~1792×1024, not exactly 2048×1536, and won't
> honour the plot mask pixel-perfectly. That's fine — the game draws the
> buildings *on top*, so the plate only needs the plots to be roughly clear
> land, the lighthouse headland (upper-right) and the dock bay (lower-right)
> empty, and the overall shape to echo the mask. Generate, eyeball against the
> mask, and re-roll or ask for tweaks ("move the wooded area left", "leave the
> upper-right headland bare"). When you're happy, downscale/pad to exactly
> **2048×1536** and save as `Core/Final Assets/Batch 15/map_island_plate.png`.

---

## 1 — The island terrain plate (the big one)

> A warm, hand-painted storybook illustration of a small coastal island seen
> from a gentle top-down 3/4 angle, in golden-hour light from the upper right.
> This is a BACKGROUND PLATE with **no buildings, no boats, no people, no
> lighthouse** — just the land and sea.
>
> The island has an irregular rocky coastline with little headlands and coves,
> a soft sandy beach at the waterline, gentle foam and waves, and a ring of
> shallow turquoise water fading into deeper blue-green open sea that reaches
> all four edges. Wooded copses of pines and oaks along the northern and western
> shores; scattered mossy rocks at the coast. The grassy interior is a warm
> meadow green, dappled with lighter and darker patches, crossed by faint worn
> dirt paths that connect a dozen gently-cleared flat plots (leave these plots
> as open grass — do not put structures on them). Keep the upper-right headland
> and the lower-right sheltered bay clearly empty.
>
> Painterly, cosy, Studio-Ghibli-meets-storybook, soft brushwork, no text, no
> UI, no labels, no grid. Palette: ember gold, warm parchment, wood browns,
> sea teal, leaf green. Landscape orientation, ~2048×1536, opaque, high detail.

## 2 — Isolated building sprites (replace four scene-panel buildings)

For **each** of: **Market stall**, **Town hall**, **Fisherman's hut**, **Bakery** —

> A single [BUILDING] for a cosy merge game, hand-painted storybook style,
> 3/4 isometric view, warm golden light, blue/red-tiled roofs, glowing windows,
> small grassy footprint with a soft shadow. **Isolated on a fully transparent
> background** — no scene, no ground plane beyond a small grass tuft, no other
> buildings, no text. Palette: ember gold, wood brown, sea teal, leaf green.
> Square image, centred, generous padding. Match the style of the attached
> Batch 2 / Batch 5 building art.

Save each transparent PNG as `town_market.png`, `town_townhall.png`,
`town_fisherhut.png`, `town_bakery.png` in `Batch 15/` (and optionally `_l2`/`_l3`
upgraded variants — grander each tier).

## 3 — Villager re-gens (two got damaged in slicing)

> A single full-body villager for a cosy game — [a working man in a flat cap,
> waistcoat and boots / a cheerful child waving, in dungarees] — hand-painted
> storybook style, 3/4 view, standing, warm friendly expression, **isolated on a
> fully transparent background**, no ground, no text, soft contact shadow only.
> Match the attached Batch 8 character sheet. Tall portrait image, centred.

Save as `npc_man.png` and `npc_child.png` in `Batch 15/`.

---

## When the art lands
Drop the PNGs into `…/Core/Final Assets/Batch 15/`, then tell the build session
(or run): `python tools/slice_assets.py` → `pnpm deploy`. The island plate wires
itself in as the ground layer (the render path is already built and verified);
the buildings/NPCs re-slice into the same ids the game already uses.
