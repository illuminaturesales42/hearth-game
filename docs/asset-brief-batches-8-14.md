# HEARTH — Asset Generation Brief · Batches 8–14

*v1.0 · 2026-07-08 · Hand this file to the image-generation AI. Batches 1–7 are done and integrated; this covers the remaining production batches from the `Asset Guide (Read Me).txt` plan. Generate against the locked style — do not invent a new one.*

## Read first (mandatory)

- **Style lock (the law):** `C:\Users\illum\OneDrive\Desktop\Hearth\Graphics and UI\Core\Final Assets\Batch 1 — Foundation & Style Lock.png` — palette, lighting, brush, scale, perspective, naming, transparent-export rules. Every asset here must match it.
- **Design bibles:** `C:\Users\illum\OneDrive\Desktop\Hearth\HEARTH_Codex_and_Production_Pack_v1\` — Book III (villagers), Book V (art), Book VII (player experience), Technical Art Bible, Book VI (naming).
- **Consistency anchors:** the delivered Batch 2–7 sheets in `…\Core\Final Assets\` (match their exact treatment).

## Hard rules (unchanged from batches 1–7)

Hand-painted warm storybook · 45° isometric for world assets, 3/4 view for characters · **transparent-background PNG**, single subject, 6–8% padding, soft contact shadow only · **no text/labels/watermarks inside the image** · palette `#EAD7B5 #C79A6B #8FBF8F #6A8CA7 #8E7CC3 #D46B6B #F4F0E6` · **never generate gems/premium-currency or lightning-bolt energy** (energy = ember-heart flame) · naming `category_subject_state_variant.png`, lowercase snake_case · deliver to `…\Core\Final Assets\Batch <n>\`.

**Legend below:** 🔌 = the game already has the integration seam (slice-and-go, no code needed) · 🛠️ = needs a small code hook after art lands · ✅code = already implemented procedurally in code (generate only if you want to replace the procedural version).

---

## Batch 8 — Characters  *(highest priority: villagers are the emotional centre, Codex Book III)*

3/4 view, characters ≈ 512×1024 (full body) / 512×512 (portrait). Consistent scale and lighting with the villagers shown in Batch 2 panel 7 and Batch 7 panel 9 (Wren card).

**Dialogue portraits** — 512×512, head-and-shoulders, warm, expressive. 🔌 *wire: `char_<name>_bust` — used in every story beat + the Villagers screen (`portraitFor()`).*

| File | Who |
|---|---|
| `char_bran_bust.png` | Bran — baker, warm, flour-dusted, up-before-the-gulls |
| `char_wren_bust.png` | Wren — postmistress, curious, reads every letter twice |
| `char_sorin_bust.png` | Sorin — old keeper, weathered, keeps what the tide throws up |
| `char_marta_bust.png` | Marta — the returned, sea-changed, full of questions |
| `char_joss_bust.png` | Joss — boatswain, gruff, trusts the tide more than people |

**Map-scale walking sprites** — 256×512, tiny full-body figures for the town canvas. 🔌 *wire: `npc_<name>` — the map already walks these along waypoints.*

| File | Who |
|---|---|
| `npc_bran.png` `npc_wren.png` `npc_sorin.png` `npc_marta.png` `npc_joss.png` | the five leads, map scale |
| `npc_child.png` `npc_woman.png` `npc_man.png` | background villagers |

**Expansion cast** (Codex Book III — the village should feel inhabited). Portraits + map sprites, same specs: `char_mayor_bust`, `char_blacksmith_bust`, `char_fisherman_bust`, `char_librarian_bust`, `npc_child_2`, `npc_visitor_1..3`.

**Expression variants** (optional, deepens dialogue): per lead, `char_<name>_bust_happy/worried/surprised.png`. 🛠️ *needs a small hook to pick expression by story beat.*

## Batch 9 — Story & Chapter Assets

Illustrative, painterly, portrait or 16:9. These carry the mystery.

| File | Subject | Size |
|---|---|---|
| `story_chapter_1.png` `story_chapter_2.png` | chapter splash art (The Letter; Shadows in the Sand) | 1080×1350 |
| `story_letter_1..3.png` | the impossible letters, aged paper, handwriting (no legible text) | 1024×1024 |
| `story_journal_page.png` | blank journal page texture for Chronicle entries | 1024×1400 |
| `story_memory_1..4.png` | soft-focus flashback vignettes (a harbour long ago, a rowboat leaving) | 1024×1024 |
| `story_clue_1..6.png` | mystery clues: brass key, lighthouse bolt, tide chart, torn oilskin "A.V.", rusted coin, bootprints | 512×512 |
| `story_photo_old.png` | a weathered old photograph, edges worn | 512×512 |
| `story_loading_1..2.png` | first-load illustrations (harbour dawn; lantern-lit night) | 1080×1920 |

🛠️ *wire: Journal Chronicle tab + story modals can show `story_*`; loading art swaps the splash emblem.*

## Batch 10 — Real-World Wellness Assets  *(second priority: the energy loop is the product)*

**Action medallions** — 256×256, round warm-rim + parchment interior (match Batch 7 panel 8 icon buttons). No human faces. 🔌 *wire: `action_<subject>` — replaces the emoji currently on each energy action.*

`action_walk.png` (coast-path boots) · `action_stairs.png` · `action_sleep.png` (crescent + bed) · `action_water.png` (glass) · `action_photo.png` (camera) · `action_sunrise.png` · `action_sunset.png` · `action_nature.png` (wildflower) · `action_squat.png` · `action_stretch.png` · `action_breath.png` (spiral) · `action_meditate.png` (candle + cushion) · `action_journal.png` (book + pen) · `action_plunge.png` (icy barrel) · `action_sauna.png` (hut) · `action_stargaze.png` (telescope) · `action_kindness.png` (clasped hands) · `action_reading.png`

**Energy states** — 512×512 ember-heart flame. 🔌 *wire: `energy_full/mid/low/empty` — the pill already switches on `pill-low`/`pill-full`.*
`energy_full.png` (bright, roaring) · `energy_mid.png` (steady) · `energy_low.png` (dim coals) · `energy_empty.png` (grey ash, one spark)

**Ember-heart animation frames** — 6–8 frames, 512×512, gentle flame flicker loop: `energy_ember_01..08.png`. 🛠️ *needs a small frame-cycler.*

**Streak rewards** — `reward_streak_3/7/30.png` (a warmer hearth each milestone), 512×512.

## Batch 11 — Environment Effects  *(mostly ✅code — generate only to upgrade)*

The reactive-weather system already draws rain, snow, fog, wind-blown smoke, sea shimmer, cloud drift, sun column, and moonlight **procedurally on canvas**. Generate these only if you want painted overlays instead:

| File | Note |
|---|---|
| `fx_rain_sheet.png` `fx_snow_sheet.png` | 512×512 tileable streak/fleck overlays | ✅code |
| `fx_fog_band.png` | 1024×256 soft horizontal fog | ✅code |
| `fx_smoke_puff.png` | 128×128 chimney smoke sprite | ✅code |
| `fx_sparkle_sheet.png` `fx_fireflies.png` | merge sparkle + evening fireflies particle sheets | 🛠️ new |
| `fx_sun_rays.png` `fx_moonlight.png` | 1024×1024 god-ray / moon-glow overlays | ✅code (upgrade) |
| `fx_water_ripple.png` | 256×256 tileable ripple | ✅code |

## Batch 12 — Seasonal Content  *(post-MVP — defer)*

Seasonal re-skins + festival decor. Not needed for the test build; generate after soft-launch. Per season a palette-shifted tree/ground overlay + festival props: `season_<spring/summer/autumn/winter>_overlay.png`, `festival_lantern.png`, `festival_harvest.png`, `festival_fire.png`, `festival_bunting.png` (1024×256), `festival_stall.png`. 🛠️ *needs a seasonal-theme switch.*

## Batch 13 — Marketing Assets  *(needed for store submission, not for testing)*

| File | Subject | Size |
|---|---|---|
| `app_icon.png` | ember-heart over navy circle, storybook painted, no text | 1024×1024 |
| `app_icon_maskable.png` | same with 20% safe margin | 1024×1024 |
| `store_screenshot_1..5.png` | framed in-game beauty shots (compose from real screens) | 1284×2778 |
| `store_feature_graphic.png` | Google Play feature banner | 1024×500 |
| `hero_website.png` | harbour at golden hour, HEARTH wordmark space top-centre | 1920×1080 |
| `press_key_art.png` `trailer_key_art.png` | marketing key art | 1920×1080 |

🔌 *wire: `app_icon` feeds the PWA manifest + favicons (already referenced from the splash emblem — swap in).*

## Batch 14 — Polish & Ambient  *("small acts of life" — Codex Book VII, low priority)*

256×256 transparent props scattered on the map to make Emberhollow feel inhabited. 🔌 *wire: drop into `TOWN_NATURE`/decor catalogue — the map composites any `prop_*`/`ambient_*` sprite.*

`ambient_laundry.png` · `ambient_bird_nest.png` · `ambient_flower_pot.png` · `ambient_butterfly.png` · `ambient_beehive.png` · `ambient_garden_tools.png` · `ambient_campfire.png` · `ambient_wood_pile.png` · `ambient_fishing_basket.png` · `ambient_lantern_hanging.png` · `ambient_cat_sleeping.png` · `ambient_dog_resting.png` · `ambient_market_clutter.png` · `ambient_footprints.png` · `ambient_weathered_fence.png` · `ambient_sign_small.png`

---

## Batch 15 — Map Production Plate & Isolated Sprites  *(2026-07-09 art-quality audit — THE "1000x" fix for the town view)*

The composed town now has a real coastline, waves, warm windows, and clean cutouts for most sprites — but sprite-compositing on procedural terrain will always trail the reference's single cohesive painting, and four building slices are **painted scene-vignettes that cannot be cleanly extracted by keying** (verified pixel-forensically: the stall/hall/hut fill their panels edge-to-edge with scene). This batch replaces those at the source.

### 15.1 The island terrain plate (highest-value single asset in the game)

`map_island_plate.png` — **2048×1536, opaque** — one cohesive painting of Emberhollow's island with **NO buildings, NPCs, boats, or lighthouse** (the game composites all of those on top). Baked into the painting:

- Irregular rocky coastline with headlands and coves; sandy beach at the waterline; foam and gentle waves; shallow turquoise water ringing the shore; open sea to the canvas edges (the game animates extra foam/swell over it).
- A north-east headland kept **empty** for the lighthouse; a sheltered south-east bay with **no dock structures** (the game places them).
- Meadow interior with worn dirt paths connecting **14 building plots left visibly clear** (gentle grass, slight trodden edge — no structures). Wooded copses along the north and west edges, rocks at the shore.
- Golden-hour warm light from the upper right, matching Batch 1/2. **Layout must follow the game's plot map** — generate against the composed-town screenshot + `TOWN_BUILDINGS` positions in `src/data/town-layout.ts` (x/y are fractions of the canvas; the build session can render a plot-mask PNG on request).

🔌 *wire: becomes the ground layer replacing the procedural island fill (coast/sand/meadow/paths stop being code); buildings/walkers/boats/effects composite on top unchanged.*

### 15.2 Isolated building sprites (replace the scene-vignette slices)

512×512 each, **transparent background, one isolated building**, consistent ¾ view, small grass-tuft footprint only, warm windows: `town_market.png` (+`_l2`/`_l3`), `town_townhall.png` (+levels), `town_fisherhut.png` (+levels), `town_bakery.png` (+levels).

### 15.3 NPC re-gens (threshold-unfixable keying damage)

512×1024 transparent full-body, Batch-8 style: `npc_man.png` (trouser folds currently nicked), `npc_child.png` (keep the waving pose).

### 15.4 Living-world life set (Codex "Daily Life" pass)

256×256 transparent: `ambient_laundry_1.png` / `ambient_laundry_2.png` (two sway frames), `animal_pigeon.png`, `animal_dog_walk.png`, `prop_market_cart.png`, `prop_notice_board.png`.

---

## Recommended generation order (by in-game value)

1. **Batch 15.1 island terrain plate** — single biggest jump toward the reference; retires the procedural ground entirely.
2. **Batch 15.2 isolated buildings** — kills the last dirty cutouts (market/townhall/fisherhut/bakery scene panels).
3. **Batch 8 portraits + walking sprites** — the villagers are the emotional core; biggest character jump (+ 15.3 fixes).
4. **Batch 10 action medallions + energy states** — kills the last emoji placeholders in the energy loop (the product's spine).
5. **Batch 9 story/chapter art** — deepens the mystery pull (retention).
6. **Batch 13 app icon** — needed before any store step.
7. **Batch 15.4 life set + Batch 14 ambient**, **Batch 11 fx upgrades**, **Batch 12 seasonal** — polish.

*Per-asset checklist: transparent bg (except the 15.1 plate)? no text? matches Batch-1 palette/lighting? reads at target size? correct filename? in `Batch <n>/`?*
