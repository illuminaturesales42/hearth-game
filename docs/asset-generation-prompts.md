# HEARTH — Asset Generation Prompts (ready to paste)

*v1 · 2026-07-09 · Every asset still worth generating, each with a paste-ready prompt.
The 335 assets already sliced (merge chains, buildings + tiers, ruins/scaffold, villagers,
portraits, wellness medallions, resources, Builder's-Yard chains, coastal dressing,
lighthouse, wordmark, panels) are NOT re-listed — this is the gap list.*

---

## 0. How to use this

1. **Paste the STYLE BLOCK (§1) + a group's SUBJECT + the NEGATIVE (§1) into one prompt.** Every group below gives you the subject clause; the shared style + negative stay constant so everything comes out on-model.
2. **Grids:** where a group asks for a sheet, generate it as an evenly-spaced grid with **large uniform padding** between cells and a **fully transparent background** — the slicer (`tools/slice_assets.py`) cuts by content, so padding + transparency = clean cuts.
3. **Drop the result** into `Core/Final Assets/Transparent/`, register it in `SHEETS`, add crop ids, run `python tools/slice_assets.py`.
4. **Filenames** listed per group are the code ids the game already looks up via `artUrl()` — matching them means the art drops straight in.

---

## 1. THE STYLE BLOCK (constant — paste into every prompt)

> **Style:** cosy coastal storybook — hand-painted digital illustration, soft painterly brushwork, gentle rim light, subtle paper texture. Warm amber/gold key light from the upper-left, cool dusk-blue fill; every asset feels lit by a hearth or a low sun. 3/4 isometric view (~30°). Clean, readable silhouettes. NOT flat vector, NOT 3D render, NOT cel-shaded anime, NOT photoreal. Palette: night navy #0f1626, parchment #ecdcb6, wood #6b4a2a, ember gold #f4a63b / #ffd27a, ember deep #e5761e, sea teal #4f8698, leaf green #3a5a34. Warm/gold dominant, moderate saturation.

**Universal negative:** `flat vector, sterile, 3d render, cgi, plastic, neon, oversaturated, harsh contrast, anime, manga, cel shaded, photograph, text, watermark, signature, ui frame, drop shadow box, low detail, blurry, jpeg artifacts, extra fingers, deformed`

**Consistency tip:** generate one hero image per group first, approve it, then use IPAdapter + a fixed seed for the rest of that group so silhouettes and scale stay on-model.

---

## 2. App icon & store  *(highest priority for launch)*

| id | size | purpose |
|---|---|---|
| `app_icon` | 1024×1024 | iOS/Android/PWA icon |
| `feature_graphic` | 1024×500 | Play Store banner |

**app_icon prompt:**
> [STYLE BLOCK] A single app icon: a glowing ember-heart flame in the warm-lit window of a tiny cosy cottage at dusk, deep navy background, soft golden bloom around the flame. Iconic, centred, instantly readable at 60px. No text. Square, safe margins. [NEGATIVE]

**feature_graphic prompt:**
> [STYLE BLOCK] A wide banner of Emberhollow harbour at golden hour — a small restored coastal town on an island, warm-lit cottages, a lighthouse with a lit beacon, fishing boats, calm glowing sea, space on the left third for a title. Cinematic, cosy, painted. [NEGATIVE]

---

## 3. Board frame (the merge tray)  *(fills art plan 1a)*

| id | format | purpose |
|---|---|---|
| `board_frame` | ~600×700, 9-slice-able | painted frame around the 6×7 board |

**prompt:**
> [STYLE BLOCK] A hand-painted wooden garden-tray frame, top-down, empty in the middle (transparent centre), thick carved timber border with mossy corners and small brass corner brackets, warm and cosy. Uniform border thickness on all four sides so it tiles as a 9-slice. Transparent background, no contents inside the frame. [NEGATIVE]

---

## 4. Board FX overlay sheet  *(art plan §3 G1)*

One sheet, transparent, grid of frames. ids: `fx_burst_1..4`, `fx_ring`, `fx_orb_trail`, `fx_levelup`.

**prompt:**
> [STYLE BLOCK] A sprite sheet of warm particle effects on a fully transparent background, arranged in a padded grid: (1) a four-frame ember sparkle-burst expanding outward, (2) a soft golden expanding ring, (3) a glowing ember orb with a comet trail, (4) a radiant golden level-up flash. Painted, warm gold and cream, soft glow, no hard edges. Each effect in its own well-spaced cell. [NEGATIVE]

---

## 5. Chapter thumbnails ×6  *(Journal / chapter modals)*

320×200 each, painted key scene. ids: `chapter_1`…`chapter_6`.

> [STYLE BLOCK] Six painted storybook scene-cards for a cosy coastal mystery, one image each, warm evening light, no text:
> 1. `chapter_1` A letter pinned to a storm-battered notice board in an empty square.
> 2. `chapter_2` Lantern-lit bootprints leading across dark sand to a north cove.
> 3. `chapter_3` A lighthouse beacon blazing over black rocks and a wrecked ship at night.
> 4. `chapter_4` A lost ship's crew rowing home toward a warm harbour under the beacon.
> 5. `chapter_5` A snug snow-dusted harbour town, warm windows glowing in winter dusk.
> 6. `chapter_6` A spring harbour wedding under strung lanterns, blossom and calm sea.
>
> Same camera, same warm palette across all six. [NEGATIVE]

---

## 6. Story-beat vignettes  *(behind story modals; optional but lovely)*

720×480 opaque, painted fireside/scene backdrops for delivery-resolution moments. ids: `story_bg_warm`, `story_bg_night`, `story_bg_sea`, `story_bg_winter`, `story_bg_spring`.

> [STYLE BLOCK] Five soft, slightly-out-of-focus painted background vignettes (safe for text over them), warm and unobtrusive: a fireside interior; a moonlit harbour at night; a calm open sea at dusk; a snowy village square; a blossoming spring meadow. Muted, atmospheric, no focal subject, no text. [NEGATIVE]

---

## 7. Order & interaction markers  *(art plan §3 G4)*

Small transparent sheet. ids: `marker_order`, `marker_quest`, `marker_glow`, `marker_new`.

> [STYLE BLOCK] A small transparent sheet of painted map markers in a padded row: (1) a carved wooden "order" signpost pin with a parchment scroll, (2) a glowing quest node (a soft golden diamond), (3) a warm circular "tap here" glow ring, (4) a small "new!" ember starburst. Cohesive, warm, readable at small size. [NEGATIVE]

---

## 8. Friend avatars ×6  *(Villagers screen — currently CSS gradients)*

256×256 transparent, circular-safe busts. ids: `avatar_1`…`avatar_6` (palettes: warm-peach, sky-blue, leaf-green, violet, gold, rose).

> [STYLE BLOCK] Six painted friendly villager head-and-shoulders busts, storybook (not anime), diverse ages and faces, each on a distinct warm palette (peach, sky-blue, leaf-green, violet, gold, rose), gentle smiles, transparent background, same crop and lighting, circular-safe framing. [NEGATIVE]

---

## 9. Map location vignettes ×6  *(Journal "Places")*

360×240 opaque mini-scenes. ids: `loc_lighthouse`, `loc_bakery`, `loc_market`, `loc_pier`, `loc_docks`, `loc_cove`.

> [STYLE BLOCK] Six small painted location cards of a cosy coastal village, one each, warm evening light, no text: a lighthouse on a rocky point; a red-roofed bakery with an awning; a market square with striped stalls; a wooden fishing pier; the north docks with moored boats; a hidden northern cove with black rocks. Same palette and camera. [NEGATIVE]

---

## 10. Event banner  *(Shop / Beacon Fair)*

880×360 opaque. id: `event_beacon_fair`.

> [STYLE BLOCK] A wide festive banner: Emberhollow harbour at night during the Beacon Fair — lanterns strung across the square, warm crowds, the lighthouse beam sweeping, boats lit in the harbour, joyful and glowing. Space-aware for a title overlay, no text baked in. [NEGATIVE]

---

## 11. Festival & wedding decor props  *(Chapter 6 dressing)*

Transparent sheet, grid. ids: `prop_bunting`, `prop_arch`, `prop_lantern_string`, `prop_maypole`, `prop_flower_arch`, `prop_banquet_table`.

> [STYLE BLOCK] A transparent padded grid of cosy coastal-festival decorations, 3/4 iso: a string of triangular bunting, a flower-draped wedding arch, a string of warm paper lanterns, a ribboned maypole, a blossoming garden arch, a long laid banquet table. Painted, warm, celebratory, each in its own cell. [NEGATIVE]

---

## 12. Seasonal board-skin turf  *(upgrades the CSS-tint skins to real art)*

Four ~256×256 seamless-ish turf tiles. ids: `turf_autumn`, `turf_twilight`, `turf_rose`, `turf_frost`.

> [STYLE BLOCK] Four painted top-down grass/ground tiles for a merge board, each seamless-tiling and richly textured: autumn (warm amber grass with fallen leaves), twilight (cool blue-green dusk grass), festival rose (grass strewn with pink petals), winter frost (pale frosted grass with a dusting of snow). Subtle, not busy — merge pieces sit on top. [NEGATIVE]

---

## 13. New character portraits  *(story cast added in Ch4–6; optional)*

512×512 transparent busts, matching the existing `char_*_bust` set. ids: `char_keeper_bust` (the returned old keeper), `char_seachild_bust` (the child born at sea).

> [STYLE BLOCK] Two painted storybook character portraits, head-and-shoulders, warm lantern light, transparent background, matching a cosy coastal cast: (1) a weathered, kindly very-old former lighthouse keeper, salt-worn, at peace; (2) a bright-eyed small child with sea-tousled hair, about three years old. Gentle expressions. [NEGATIVE]

---

## 14. Collection crests ×5  *(chain-mastery emblems for the Shop)*

128×128 transparent painted emblems. ids: `crest_timberline`, `crest_harvest`, `crest_hearthfire`, `crest_keepsakes`, `crest_builders`.

> [STYLE BLOCK] Five small painted heraldic-style emblems on transparent backgrounds, warm gold and wood tones, each a cosy craft badge: a stack of timber (Timberline); a wheat sheaf and loaf (Harvest); an ember flame in a hearth (Hearthfire); a wax-sealed letter (Keepsakes); a mason's trowel crossing a cottage (Builder's Yard). Cohesive set, gentle, readable at 128px. [NEGATIVE]

---

## Priority order for launch

1. **App icon + feature graphic** (§2) — store/PWA can't ship without them.
2. **Board frame** (§3) + **FX overlay** (§4) — the surface players stare at.
3. **Chapter thumbnails** (§5) + **friend avatars** (§8) — finish the shell.
4. **Location vignettes** (§9), **event banner** (§10), **collection crests** (§14) — depth.
5. **Story vignettes** (§6), **festival decor** (§11), **seasonal turf** (§12), **new portraits** (§13) — polish.

Everything else the game needs already exists in `public/art/` (335 sliced assets).
