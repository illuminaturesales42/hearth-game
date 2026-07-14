# HEARTH — Village Life asset brief (for Teddy to generate)

*2026-07-14 · save each PNG into `public/art/<exact-id>.png` — Claude wires the id into the manifest + UI. Transparent background unless noted. No text, no borders, no UI chrome baked in.*

## Shared style anchor (paste at the START of every prompt)

> Painted storybook game art in the cosy warm style of a hand-illustrated harbour village called Emberhollow — soft painterly brushwork, warm golden-hour lighting, muted teal-and-amber palette, gentle depth, rounded friendly forms, mobile game quality, NO text, NO UI, NO frame.

Then append the per-asset line below.

---

## Tier 1 — Mini-game backdrops (biggest visual uplift) — 6 assets

Full-bleed painterly scenes that sit *behind* each game's play area. Keep them **soft and slightly darkened / low-contrast toward the centre** so the game pieces and buttons stay readable on top. Portrait-ish framing.

- **Format:** PNG, **~900 × 1100 px**, opaque (full-bleed), soft vignette edges.
- The centre third will be covered by game pieces — keep detail toward the edges.

| Save as | Prompt (after the style anchor) |
|---|---|
| `mg_bg_well.png` | *…the mossy stone lip of an old wishing well at dusk, cobbles and a few coins glinting at the bottom, soft lantern glow, calm and inviting, centre kept dim and simple.* |
| `mg_bg_beacon.png` | *…the interior lantern-room of a lighthouse looking down toward little fishing boats on a dark evening sea, warm beacon fire glow at top, pegs of light, centre kept dim.* |
| `mg_bg_forge.png` | *…a blacksmith's forge interior, glowing coals and an anvil, warm orange firelight, hanging tools, cosy soot-and-ember mood, centre kept dim and uncluttered.* |
| `mg_bg_catch.png` | *…a quiet fishing jetty over still teal water at golden hour, ripples and reeds, a wooden bucket and net, peaceful, centre kept as calm open water.* |
| `mg_bg_forage.png` | *…a misty woodland-garden floor from above, dappled light through leaves, ferns and mushrooms at the edges, soft fog, centre kept as plain mossy ground.* |
| `mg_bg_stacks.png` | *…a warm library nook, wooden bookshelves and a reading lamp, dust motes in amber light, cosy and hushed, centre kept as a plain tabletop.* |

## Tier 2 — Foraging grid tokens (replace the emoji) — 4 assets

Small centred icons revealed under fog tiles. Currently 🪙🔥🍯🌿.

- **Format:** PNG, **256 × 256 px**, transparent, single centred object, soft drop shadow.

| Save as | Prompt (after the style anchor) |
|---|---|
| `mg_forage_coin.png` | *…a single warm gold coin, painterly, three-quarter view, soft shine.* |
| `mg_forage_ember.png` | *…a small glowing ember / flame wisp, warm orange, gentle glow.* |
| `mg_forage_honeycomb.png` | *…a little piece of golden honeycomb dripping honey, painterly.* |
| `mg_forage_leaf.png` | *…a small sprig of fresh green foliage / a fern frond, painterly.* |

## Tier 3 — Section header illustrations (optional polish) — 2 assets

Wide, low banners above the new panels. Soft, decorative, side-weighted (content sits over them).

- **Format:** PNG, **1200 × 360 px**, transparent or soft-faded edges.

| Save as | Prompt (after the style anchor) |
|---|---|
| `ui_repository_header.png` | *…a cosy "keeping room" — a wooden shelf holding jars, a basket of fish, a stack of books and a pot of honey, warm and homely, objects grouped to the LEFT, right side fading to empty.* |
| `ui_villagelife_header.png` | *…a cheerful row of little Emberhollow shopfronts (well, forge, bakery, library) seen along a lane at golden hour, bunting, objects grouped to the LEFT, right side fading to empty.* |

---

## Optional / future — the "bigger multi-district island"

You said yes to a genuinely larger town too. That's a **separate, larger effort**: it needs a much wider painted island plate AND me re-doing every building's map coordinate in `town-layout.ts` to fit the new composition — not a drop-in. The pan/zoom already lets players "look around" the current island, so I'd suggest we ship that first and treat a bigger island as its own project. If you want to start the art anyway, one plate:

- `map_island_wide.png` — **2400 × 1200 px**, opaque. *…a wide painted harbour-town island seen from a gentle 3/4 top-down angle, distinct districts (a market square, a forge quarter, a harbour with docks, a garden terrace, a lighthouse point), winding paths linking them, surrounded by teal sea, golden-hour light, room between buildings.* — **hold until we plan the coordinate remap.**

---

## What Claude does when the files land

1. Add the new ids to `src/art-manifest.ts` (or the slicer's individual-drop list).
2. Backdrops: per-game background on the mini-game card (already prepped with graceful fallback — no art = current flat panel).
3. Foraging: swap the emoji glyphs for `mg_forage_*` with emoji fallback (already prepped).
4. Headers: drop above the Repository / Village Life sections behind a feature check.

All wiring is fallback-guarded, so partial deliveries are safe — send whatever's ready, in any order.
