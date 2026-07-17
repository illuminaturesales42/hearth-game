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

## 2) `mg_sawmill_log_v.png` — 256×512, transparent  ⚠️ **UPRIGHT — replaces the old horizontal brief**

> A single birch log standing **upright / end-on**, storybook-painted: the **round cut face looks straight down the frame at the bottom** — warm honey-coloured growth rings, bright and fresh-sawn — with the silvery-white bark barrel (dark flecks, a little moss) rising above it to the top of the frame. Long edge vertical, taller than it is wide. Soft contact shadow beneath the round face. Fills the frame's height, centred horizontally.

Placement: rides **down** each of the five flume lanes, round face leading (rendered ~46% of a lane's width, aspect ≈ 0.44). Must read at small size — bold bark/ring contrast. **The old `mg_sawmill_log` (horizontal) is superseded and is no longer requested;** the code now asks for `mg_sawmill_log_v` only, and until it lands a hand-painted CSS log (bark barrel + ring face) stands in.

**No `_halves` asset needed.** The split is done in-engine: the app clips this same sprite down the middle and animates the two planks apart, so the halves always match the log exactly.

## 4) `mg_sawmill_blade.png` — 256×256, transparent

> A round brass-and-steel circular saw blade seen face on, storybook style: warm brass centre boss, steel teeth with a soft golden glint on the upper edge, slight painterly wear. Centred in frame, blade circle nearly touching the edges. No motion blur (the app spins it).

Placement: sits at the right end of the glowing blade line, CSS-rotated; static under reduced motion.

## 5) `mg_forge_lump.png` — 256×256, transparent

> A rough lump of copper ore glowing forge-hot: deep orange-red heart, brighter yellow-hot edges facing up, small dark cool patches at the base, tiny sparks of light on the surface. Sits on an implied anvil (no anvil in frame — just the lump with a soft warm under-glow). Centred, fills ~70% of frame.

Placement: appears on hot cells in Strike While Hot; pulsing glow is added by CSS. On a clean strike the app swaps it for the copper ingot (existing `item_copper_2`).

## 6) `mg_forge_hammer.png` — 256×256, transparent  ⚠️ **now wired — please deliver**

> A **large** smith's cross-peen hammer, storybook painted: worn ash handle running to the lower-right, dark polished steel head at the **upper-left** with one warm forge highlight along its striking face. Angled roughly 45°. Centred, head reading big and heavy — this is the hero of the swing.

Placement: **now animated** — the hammer rears back, swings down onto the struck anvil and recoils (the app rotates it about its lower-right handle end, so keep the handle butt near the bottom-right corner and the head upper-left). Until it lands, a 🔨 stands in.

## 7) `mg_peg_brass.png` — 64×64, transparent *(optional)*

> A single round brass peg seen face-on, like a small ship's porthole rivet: warm brass rim, soft centre dome catching a golden glint. Centred, circle filling ~80% of frame.

Placement: replaces the plain glow dots on the Beacon Drop peg board (CSS versions already shipped; this is polish).

## 8) `mg_peg_gold.png` — 64×64, transparent *(optional)*

> The same peg as `mg_peg_brass` but **blessed with light**: pale gold centre blooming to ember-gold `#f4a63b` at the rim, a warm halo glow bleeding just past the circle. Reads as "hit me."

Placement: the Beacon Drop's single **golden peg** — striking it pays a bonus and deepens the catch. CSS pulses it; a shipped sprite would just look richer.

## 9) `mg_forage_clearing.png` — 128×128, transparent *(optional)*

> A small sunlit break in the undergrowth seen top-down: a ring of parted ferns and grass opening onto warm bare earth, a shaft of golden light landing in the middle, one or two tiny wildflowers at the edge. Matches the other `mg_forage_*` tokens in weight and framing.

Placement: the foraging grid's **clearing** tile — uncovering it cascade-reveals its neighbours for free. Falls back to a ✨ until delivered.

## 10–13) The four time-of-day badges — **REDO (current ones are rough placeholders)**

The map's top-right corner shows a small painted badge for the time of day, and the current four were hand-sliced from a montage with the **time and label baked into the picture** (`06:00 SUNRISE`, `00:30 NIGHT`, …) — the app should draw any text, so these need redoing **clean, with NO baked text**. Deliver four **separate square PNGs, 512×512, transparent** (the app rounds/scales them; keep the art within a centred circular medallion so corners can be trimmed):

Filenames (exact): `time_badge_sunrise.png`, `time_badge_midday.png`, `time_badge_sunset.png`, `time_badge_night.png`.

> A small round **medallion / porthole badge** in the Hearth storybook style — a warm brass-and-timber rim framing a tiny painted vignette of Emberhollow's harbour + lighthouse at **[PHASE]**. Centred, the scene filling the medallion, soft rim light, gentle painterly brushwork. **No text, no numbers, no clock** anywhere. Transparent outside the circular rim.
> - **sunrise** — low gold sun just over the sea, rosy dawn sky, long warm reflection.
> - **midday** — bright blue sky, high small sun, sparkling water, a couple of soft clouds.
> - **sunset** — deep amber-and-violet sky, sun sinking to the horizon, lit windows beginning to glow.
> - **night** — deep navy sky, a **crescent moon** and a few stars, the lighthouse beacon lit, cool moonlit water.

Keep the four rims identical so only the sky/scene changes — they swap in place as the hours turn. Fallback: until these land the current placeholder badges keep showing.

---

## Delivery

Drop finished files into `public/art/` with the exact names above, then add each id (filename without `.png`) to the set in `src/art-manifest.ts`. Nothing else to change — every consumer already asks `artUrl(id)` and falls back gracefully until the art exists.
