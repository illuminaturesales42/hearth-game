# Hearth asset system & production-art integration

*v1 · 2026-07-09 · How every graphic in the game is cut, named, scaled, layered,
and where the remaining production art still needs wiring.*

## The pipeline (single source of truth)

All art is cut from source sheets by **`tools/slice_assets.py`** into
`public/art/<id>.png`, which also regenerates **`src/art-manifest.ts`**
(`artUrl(id)` → `/art/<id>.png` or null). The app never hard-codes art paths;
it asks `artUrl()`, so adding/replacing an asset is one manifest entry + a
re-slice. Run: `python tools/slice_assets.py`.

**Cut modes** (auto-selected per id):
| Source background | Mode | Used for |
|---|---|---|
| Already alpha-transparent | `AUTOCROP` — trim to alpha bbox | the 3 truly-transparent sheets |
| RGB on **white** | white-key (edge-flood, keeps interior whites) → defringe → autocrop | `Large transparent.png` |
| RGB on cream/navy panel | `KEYED` (border-flood) → `defringe` → `clean_sprite` | the Batch 1–14 sheets |
| Opaque whole-image | copied verbatim | `map_island_plate` |

`defringe()` kills the 1px halo; `global_key()` sweeps panel colour from canopy
gaps; `clean_sprite()` drops speckles + autocrops. This is why cutouts are clean
on any background.

## Naming convention (`category_subject_state`)

`town_<id>` + `town_<id>_l2/_l3` (upgrade tiers) · `npc_<name>` (map walkers) ·
`char_<name>_bust` (portraits) · `item_<chain>_<n>` (merge stages) · `res_<x>`
(currencies) · `action_<x>` (wellness medallions) · `energy_<state>` +
`energy_heart` · `prop_<x>` / `tree_<x>` / `terrain_<x>` (world dressing) ·
`icon_<x>` / `nav_<x>` / `panel_<x>` (UI) · `map_island_plate` (ground).

## Scale, pivot, layering (the visual system)

- **Pivot** = ground baseline: every world sprite's `y` is where its feet meet
  the ground; the scene is **painter-sorted by y** (things lower on screen draw
  in front). Positions are normalized 0..1 of the canvas in `town-layout.ts`.
- **Scale** = fraction of canvas width: buildings `w` from `TOWN_BUILDINGS`
  (0.045–0.21), ×1.16 when the painted plate is active so they read against the
  detailed terrain; map people `0.027·W`; the dog `0.03·W`.
- **Layer order** (`drawTown`): island plate → sky overlays (sun/moon, clouds,
  stars, weather) → shore foam → boats → **buildings** (painter-sorted with
  props/nature) → walkers + dog → lighthouse → ambient FX → reactive flourishes.
- **Perf**: PNG, transparent, alpha-autocropped (no wasted pixels); the plate is
  the only large asset; art is fetched on demand via `artUrl`.

## The transparent production library (`Final Assets/Transparent/`)

| Sheet | Alpha? | Contents | Status |
|---|---|---|---|
| **Large transparent.png** | RGB/white | market, town hall, fisher's hut, bakery, npc_man, npc_child, energy-heart medallion | ✅ 6 wired (buildings + npcs) |
| **Large transparent2.png** | RGB/white | more hero buildings/props | ⏳ to catalogue |
| **Buildings2.png** | alpha ✓ | ~8 building types × [under-construction / L1 / L2 / L3 / damaged] | ⏳ **best source for all building tiers** |
| **Buildings.png** / **Building + costal build.png** | RGB | building variants + coastal builds | ⏳ |
| **Merg chain sprites.png** | RGB/white | 14 merge chains × ~10 stages (Wood, Stone, Clay, Seeds, Flowers, Water, Copper, Fish, Bread, Honey, Herbs, Wool, Books, Music) | ⏳ **board item upgrade** |
| **Build Merg.png** | alpha ✓ | building-merge stages | ⏳ |
| **Nature.png** | alpha ✓ | trees, bushes, rocks, flowers | ⏳ TOWN_NATURE upgrade |
| **Animals.png** | RGB | cat, dog, gull, pigeon, etc. | ⏳ |
| **Map terrain.png** | RGB | terrain / paths / coast tiles | ⏳ |
| **Costal Effect.png** | RGB | foam, waves, water FX | ⏳ (mostly ✅ procedural) |

## Known inconsistencies & gaps (for future work)

1. **Building upgrade tiers**: the 4 new hero buildings' `_l2`/`_l3` still come
   from Batch 5 — a slight style step at high tiers. Fix: re-cut all building
   tiers from **Buildings2.png** (has L1/L2/L3/damaged/under-construction per
   type, one consistent style) — the single biggest cohesion win left.
2. **Merge-board items**: the game's chains (`wood/stone/harvest/hearthfire/
   keepsake`) don't map 1:1 to the 14 chains on `Merg chain sprites.png`.
   Adopting the richer art means either re-labelling chains to the sheet's
   names or picking 5 sheet-chains to re-slice into the existing ids.
3. **UI panels**: modals/cards are still CSS-drawn; Batch 13/14 provide painted
   9-slice panels (`panel_wood`, `panel_parch` already sliced) not yet adopted.
4. **Ruined-building art**: currently a procedural sepia mask; Buildings2's
   "Damaged" column is purpose-built and would look better.
5. **Missing / to generate**: app icon (`app_icon`), story/chapter art
   (Batch 9), seasonal re-skins (Batch 12) — none block the current build.

## Verification

Every art change is checked on a light **and** dark checkerboard (halos hide on
one or the other) and screenshot in the live town via Playwright (noon/dusk/
night, multiple progression states). Never verify a keyed sprite on navy alone.
