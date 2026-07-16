# HEARTH — Beauty Decor art brief (late-game coin sink)

*2026-07-16 · hand to ChatGPT/DALL-E. Unblocks the audit's G1b "beauty catalogue": the late game has ~5× more coins than things to buy, and coins must only ever buy **beauty, never power**. These are premium, placeable town decorations — a real, pillar-safe coin sink.*

## Why this needs new art (not a reuse)
Placed decor is stored by its `art` id, and each piece's width/cost is looked up by that id (`src/data/town-layout.ts DECOR_CATALOG`, `game.ts placeDecor/removeDecor`). So a "premium" tier **cannot** reuse an existing sprite at a bigger size — it needs its **own distinct id**. Hence this brief. (Until these land, the catalogue stays as-is; the refund loophole is already closed — removal reclaims 50%.)

## Wiring when the art arrives (no code rewrite — one catalogue entry each)
1. Slice each PNG to `public/art/<id>.png` (register in `tools/slice_assets.py`, transparent cut-out — omit `opaque`).
2. Add one row per piece to `DECOR_CATALOG` in `src/data/town-layout.ts`, e.g.
   `{ art: 'decor_fountain', name: 'Village Fountain', cost: 600, w: 0.10 }`.
3. For **permanent monuments** (a real sink that can't be sold back), add a `permanent: true` field to `DecorDef` and skip the 50% reclaim in `removeDecor` for those (a ~3-line guard). Ordinary decor stays reclaimable so the town can be rearranged (keep-everything holds).

## Shared spec (all pieces)
- **Transparent-background PNG**, single object, **bottom-centre anchored** (it sits on the ground; the game draws a soft contact shadow — bake none).
- Author **~256–320 px** on the longest side; height follows the art's natural aspect (only the width fraction `w` is set in data).
- Style: the HEARTH storybook look — hand-painted, warm amber/gold key light from upper-left, cool dusk fill; night-navy/ember/parchment/sea-teal palette; painterly, NOT vector/3D/photoreal. British-cosy, no gems, no bolts.
- Negative: `flat vector, 3d render, cgi, neon, anime, cel shaded, photo, text, watermark, ui frame, drop-shadow box, deformed`.

## The pieces
| id | Subject | Tier | Suggested cost |
|---|---|---|---|
| `decor_fountain` | A carved stone **village fountain**, water catching warm light | Ordinary | 600 |
| `decor_statue` | A weathered bronze **founder's statue** on a plinth | Permanent | 900 |
| `decor_arch` | A flower-wound **festival archway** (bunting, lanterns) | Ordinary | 500 |
| `decor_gazebo` | A little painted **harbour gazebo / bandstand** | Ordinary | 750 |
| `decor_monument` | A tall **memorial obelisk** with a small ember-lantern at its foot | Permanent | 1200 |
| `decor_planter` | A grand tiered **stone planter** overflowing with blooms | Ordinary | 300 |
| `decor_birdbath` | A mossy **stone birdbath** with a resting gull | Ordinary | 250 |
| `decor_lantern_post` | An ornate **triple lantern post**, warm glow | Ordinary | 350 |

Paste-ready prompt (swap the subject line per row):
> Hand-painted cosy storybook game decoration — a carved stone village fountain, water catching warm amber light, soft painterly brushwork, warm gold key from upper-left with a cool dusk fill, night-navy/ember/parchment/sea-teal palette. Single object, centred, transparent background, bottom-centred, no baked cast shadow, ~300px. NOT flat vector, NOT 3d render, NOT photoreal. No text, no gems, no lightning bolts.

## Impact
Eight pieces at 250–1200 coins, several placeable multiple times, half of them permanent (non-reclaimable) — turns the inert late-game coin pile into a genuine "make Emberhollow beautiful" sink, exactly on the "coins buy beauty" pillar. Pair with the already-shipped P1 late-coin compression to bring the faucet:sink ratio into balance.
