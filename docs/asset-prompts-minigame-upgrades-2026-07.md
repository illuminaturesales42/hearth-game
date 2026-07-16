# HEARTH — Mini-game Upgrade Asset Prompts (Saw Song + Forge + Beacon)

*2026-07-17 · hand this whole file to ChatGPT/DALL-E. Companion to `asset-prompts-village-life-2026-07.md` — that file's §0 OUTPUT FORMAT, §1 STYLE BLOCK, §2 UNIVERSAL NEGATIVE and §3 HARD RULES all apply verbatim to every prompt below. Paste the style block at the top of each prompt and the negative at the end.*

Every asset below is **fallback-guarded** in code: the game already plays without it (raw copper ore stands in for the lump, `item_wood_1` for the log, a 🪚 for the blade, plain glow dots for pegs). Drop the file into `public/art/` with the exact filename, add the id to `src/art-manifest.ts`, and the slot lights up with no code change.

## Output rules recap (from §0 — the bit that matters most)

- **One separate image file per asset** — no montages.
- **Exact pixel size**, transparent background (PNG) unless noted.
- **No text/labels baked into the image.**
- Hero centred; nothing important near the edges.

---

## 1) `mg_bg_sawmill.png` — 880×1120, opaque (card backdrop)

> Interior of a warm timber sawmill at dusk, seen straight on. A wooden log flume descends from the top of the frame toward the lower third, worn smooth with use. Warm lantern light from the upper-left, golden sawdust motes drifting in the air, stacked cut planks along the walls, coils of rope, a big brass circular saw at rest low in the frame. Keep the **vertical middle third of the frame darker and quieter** (a shadowed channel) — the game's five lanes render over it and need contrast. No people. No text.

Placement: card backdrop behind The Saw Song, cover-cropped like the other `mg_bg_*` — subject centred vertically.

## 2) `mg_sawmill_log.png` — 512×256, transparent

> A single horizontal birch log, storybook-painted: silvery-white bark with dark flecks, one visible cut face showing warm honey-coloured growth rings at the right end, a little moss on top. Soft contact shadow directly beneath. Fills the frame's width, centred.

Placement: falls down each lane (rendered ~50px wide). Must read at small size — bold shapes, high bark/ring contrast.

## 3) `mg_sawmill_log_halves.png` — 512×256, transparent

> The **same birch log** as `mg_sawmill_log`, now sawn cleanly in two through the middle, the halves parted by a small gap (about a tenth of the frame). Matching grain across the cut — bright fresh-cut faces glowing warm at the two inner ends. Same lighting, same palette, same painterly style.

Placement: swapped in at the moment of a cut, halves animate apart. The UI clips the left/right halves separately, so keep the gap dead-centre.

## 4) `mg_sawmill_blade.png` — 256×256, transparent

> A round brass-and-steel circular saw blade seen face on, storybook style: warm brass centre boss, steel teeth with a soft golden glint on the upper edge, slight painterly wear. Centred in frame, blade circle nearly touching the edges. No motion blur (the app spins it).

Placement: sits at the right end of the glowing blade line, CSS-rotated; static under reduced motion.

## 5) `mg_forge_lump.png` — 256×256, transparent

> A rough lump of copper ore glowing forge-hot: deep orange-red heart, brighter yellow-hot edges facing up, small dark cool patches at the base, tiny sparks of light on the surface. Sits on an implied anvil (no anvil in frame — just the lump with a soft warm under-glow). Centred, fills ~70% of frame.

Placement: appears on hot cells in Strike While Hot; pulsing glow is added by CSS. On a clean strike the app swaps it for the copper ingot (existing `item_copper_2`).

## 6) `mg_forge_hammer.png` — 256×256, transparent *(optional, nice-to-have)*

> A smith's cross-peen hammer, storybook painted: worn ash handle, dark polished steel head with one warm highlight. Angled diagonally (head upper-right), centred.

Placement: a possible strike-swing animation over a hit cell — not yet wired; deliver last.

## 7) `mg_peg_brass.png` — 64×64, transparent *(optional)*

> A single round brass peg seen face-on, like a small ship's porthole rivet: warm brass rim, soft centre dome catching a golden glint. Centred, circle filling ~80% of frame.

Placement: replaces the plain glow dots on the Beacon Drop peg board (CSS versions already shipped; this is polish).

---

## Delivery

Drop finished files into `public/art/` with the exact names above, then add each id (filename without `.png`) to the set in `src/art-manifest.ts`. Nothing else to change — every consumer already asks `artUrl(id)` and falls back gracefully until the art exists.
