# HEARTH — Asset Generation Brief (for the art-generation AI)

*v1.0 · 2026-07-08 · Hand this file to the generating AI/artist as the task list. Every asset must be generated against the references below — do not invent a new style.*

## Read these references FIRST

**Design bibles (mandatory reading):** `C:\Users\illum\OneDrive\Desktop\Hearth\HEARTH_Codex_and_Production_Pack_v1\`
- `Book_05_The_Art_of_Hearth_Studio_Complete.md` — the art direction bible
- `HEARTH_Technical_Art_Production_Bible_Foundation.md` — technical/production standards
- `Book_06_The_Builders_Manual_Studio_Complete.md` — naming + pipeline conventions
- `Book_02_The_World_of_Emberhollow_Studio_Complete.md` — what Emberhollow *is* (coastal village, storm-recovery, golden-hour warmth)

**Visual anchors (match these exactly):** `C:\Users\illum\OneDrive\Desktop\Hearth\Graphics and UI\Core\`
- `MVP.png` — canonical style + palette card (`#EAD7B5 #C79A6B #8FBF8F #6A8CA7 #8E7CC3 #D46B6B #F4F0E6`)
- `Merge assest.png` — merge-item icon treatment (rimlight, warm key light, painterly)
- `Map.png` — terrain/props/buildings treatment + its palette strip (Ember Gold, Warm Light, Parchment, Wood, Sea Teal, Leaf Green, Stone, Ink Brown, Night Blue)
- `UI Flame.png` — the ember-heart energy visual ("ember, not lightning")
- `Hearth_ConceptArt.png` — screen mockups for context

## Hard rules (from the Constitution / product pillars)

1. **Style:** hand-painted, warm, whimsical, storybook. Soft golden-hour lighting, readable at small sizes, consistent scale and perspective with the anchors.
2. **Transparent background PNG** for every sprite/icon (opaque only where noted). Single subject, centred, ~6–8% padding, no cast shadow onto the background (soft contact shadow baked under the subject is fine).
3. **No text, labels, numbers, or watermarks inside the image.**
4. **Never generate:** gems/diamonds/premium-currency iconography, lightning-bolt energy symbols, ads/FOMO imagery. Energy is an **ember/flame heart**; currency is a **coin** only.
5. **Naming (Book VI):** `category_subject_state_variant.png`, lowercase snake_case, e.g. `item_keepsake_2.png`, `building_bakery_ruined.png`.
6. Deliver to: `C:\Users\illum\OneDrive\Desktop\Hearth\Generated\<category>\`

---

## Priority 1 — blocks current polish

### 1. Keepsake merge chain (7 icons — currently emoji placeholders in-game)
512×512 transparent PNGs, matching the treatment in `Core/Merge assest.png` (see the Timberline/Harvest rows there). Weathered, sea-touched, sentimental objects — this chain carries the mystery story.

| File | Subject |
|---|---|
| `item_keepsake_0.png` | A sealed letter, aged paper, wax seal |
| `item_keepsake_1.png` | A tied stack of letters/papers, string bow |
| `item_keepsake_2.png` | A copper kettle, warm reflections |
| `item_keepsake_3.png` | A weathered wooden bench |
| `item_keepsake_4.png` | A small writing desk with inkwell |
| `item_keepsake_5.png` | A coiled fishing net with cork floats |
| `item_keepsake_6.png` | A rowboat, oars shipped, sea-worn |

### 2. Merge-chain icon remaster (18 icons — replace sheet-sliced versions)
Same spec as above. Current in-game versions were cut from a contact sheet and carry edge artefacts; regenerate each as an individual asset. Match subjects exactly:

- **Timberline (wood):** `item_wood_0..6` — Sapling, Log, Plank, Hammer, Chair, **Door**, **Cottage** *(Door and Cottage are the worst offenders in-game — do these first)*
- **Harvest:** `item_harvest_0..6` — Wheat, Loaf, Pie, Cake, Basket, Feast, Fair Prize (golden trophy-cup)
- **Hearthfire:** `item_hearthfire_0..3` — Candle, Lantern, Hearthfire, Beacon

### 3. Merge board field — portrait, grid-true (the big one)
The game board is **6 columns × 7 rows, portrait**. The current field is stretched from a landscape reference and its painted squares can't align with gameplay. Deliver as **three files** so the game can compose it pixel-true:

| File | Spec |
|---|---|
| `board_frame_portrait.png` | 1080×1400, opaque edges/transparent middle: mossy grass fringe + tucked corner stones + tiny flowers framing an EMPTY middle (match `Core/MVP.png` "Grid Board" panel's rim exactly). Border thickness ~56px, 9-slice-safe (uniform rim, corner details only in corners). |
| `turf_tile_light.png` | 256×256 opaque, seamlessly tileable, light mossy turf square (match the light squares in MVP.png's grid board) |
| `turf_tile_dark.png` | 256×256 opaque, seamlessly tileable, darker sibling of the above |

### 4. Ruined building variants (14 sprites)
For each existing town sprite (in repo `public/art/`: `town_cottage, town_bakery, town_market, town_garden, town_townhall, town_workshop, town_farm, town_fisherhut, town_sawmill, town_blacksmith, town_dock, town_library` + `prop_sign, prop_well`): a **storm-ruined state** — collapsed roof section, scorched/water-stained walls, boarded windows, debris at the base — same footprint, angle, and scale as the intact sprite so they swap 1:1. Melancholy but never grim; a building waiting, not destroyed. 1024px wide, transparent.
Name: `building_<subject>_ruined.png`.

## Priority 2 — polish that sells the fantasy

### 5. Wellness action icons (17 medallions, 256×256)
Round-ish medallion icons for real-world actions, warm ember-gold rim, parchment interior (see icon medallions in `Core/MVP.png` panel 8). No human faces. Subjects: walking boots on a coast path · stone stairs · crescent moon over a bed · water glass · camera · sunrise over sea · sunset over sea · wildflower · squat figure silhouette (abstract) · stretching figure (abstract) · breath spiral · candle + cushion (meditation) · journal + pen · icy plunge barrel · sauna hut · telescope under stars · two clasped hands (kindness).
Name: `action_<subject>.png`.

### 6. Ember-heart energy pill (4 states, 512×256 each)
The energy meter visual from `Core/UI Flame.png`: a heart-shaped ember flame. States: `energy_full` (bright roaring), `energy_mid` (steady warm), `energy_low` (dim coals), `energy_empty` (grey ash with one spark). Transparent.

### 7. Lighthouse map sprite (2 states)
Map-scale lighthouse matching the building sprites' angle/scale (see `Map.png` vignettes): `building_lighthouse_dark.png` (shuttered, storm-worn) and `building_lighthouse_lit.png` (lamp aglow). ~800px tall, transparent.

### 8. App identity set
- `app_icon.png` — 1024×1024, the ember-heart over a navy circle, storybook painted (no text)
- `app_icon_maskable.png` — 1024×1024 with 20% safe margin
- `splash_portrait.png` — 1080×1920 opaque: Emberhollow harbour at golden hour, lighthouse point, HEARTH-style vine-framed composition top-centre left EMPTY for the wordmark (we overlay text in-game)

## Priority 3 — nice to have

9. **Weather overlay textures** (rain streak sheet, snow flecks, fog band — 512×512 tileable, transparent)
10. **Chapter banners** ×2 (1024×256 parchment ribbons, empty of text): weathered-blue seaside for Ch1 "The Letter", dusk-sand for Ch2 "Shadows in the Sand"
11. **Bonfire duel scene card** (1024×640): Old Joss across a driftwood bonfire at night, gulls asleep, two mugs
12. **Building upgrade variants** L2/L3 for the 12 town buildings (flower boxes/bunting at L2; lanterns, banners, golden warmth at L3) — same footprint rule as ruins. 24 sprites, biggest batch, lowest urgency (game currently decorates upgrades procedurally).

---

*Sanity checklist per delivered asset: transparent bg? no text? matches MVP.png palette? reads at 64px? correct filename? placed in `Generated/<category>/`?*
