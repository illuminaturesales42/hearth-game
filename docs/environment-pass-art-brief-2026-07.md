# HEARTH — Environment-Pass Art Brief (2026-07-22)

*Companion to the world-map environment pass (commits `7751c2b…f1b0be8`): the map
was stripped to a clean production foundation (no people/animals/laundry/moon/
hearthfire sprite), recomposed to the plate's plot rings with a focal hierarchy
(town hall → lighthouse → harbour cove), water pieces re-grounded with real
reflections, and every effect anchor moved into `town-layout.ts` data. Everything
below is the art that finishes the job — generate with the user's pipeline
(IPAdapter + fixed seed per category), slice via `tools/slice_assets.py`, and the
code seams named here pick each piece up.*

## STYLE BLOCK — prepend to every prompt

```
HEARTH art style (the law — match exactly, do not invent a new style):
Hand-painted warm storybook illustration. Soft painterly brushwork, gentle
rim light, cosy golden-hour warmth. Palette: #EAD7B5 #C79A6B #8FBF8F #6A8CA7
#8E7CC3 #D46B6B #F4F0E6. 45° isometric for world/buildings/props; 3/4 view
for characters. TRANSPARENT background PNG, single subject centred, 6–8%
padding, soft contact shadow only (no ground plane, no scene box). No text,
labels, letters, numbers, watermarks, or UI frames inside the image. Never
draw gems or premium currency; game energy is an ember-heart flame, never a
lightning bolt. Consistent scale and lighting with the delivered Batch 2–8
sheets. Deliver as lowercase snake_case PNG named exactly as specified.
```

---

## Priority 1 — Dock & shore set (the permanent water-seam fix)

The pass fixed the *grounding* (no more earth pads under water buildings; boats
got reflections), but the remaining seam is baked into the art: `town_dock` and
`town_fisherhut` carry their own painted water discs that are LIGHTER than the
plate's cove water, so a pale halo rings each structure. The fix is art whose
water matches the plate — or pieces with **no** baked water at all.

| id | prompt sketch | size | wiring |
|---|---|---|---|
| `dock_pier_long` | weathered timber pier running toward the lower-right on tall pilings, NO water painted around the pilings (transparent below deck level), barnacle + rope detail, lantern on the far post | ~700×450 | replaces `dock_small` at the south beach (`TOWN_TERRAIN`), `water: true` |
| `dock_pier_end` | matching pier end-cap with mooring bollard + tied rope, transparent below deck | ~360×360 | optional second segment; composes with `dock_pier_long` |
| `shore_transition_sand_a/b/c` | three soft grass→sand→wet-sand skirt tiles matching the plate's beach palette (#EAD7B5 sand family), irregular painterly edges, fully flat (no structure) | ~420×220 each | tuck under water-adjacent buildings via `TOWN_TERRAIN` FLAT set |
| `town_market_awning` | the market's striped awning alone (furled + unfurled pair: `_furled` suffix), matching `town_market`'s exact awning geometry | match `town_market` width | overlay sprite for the walk-reaction "market opens" beat (today an ember glow stands in — `map-view` market block) |

**Also acceptable (bigger win):** re-render `town_dock` / `town_fisherhut` with
their water discs matched to the plate's cove teal (`#4f8698` family, sampled
from `map_island_plate.png` in the cove box x 0.6–0.86, y 0.56–0.78). Keep
silhouettes and footprints identical — anchors and hitboxes must survive.

## Priority 2 — Plaza fire-ring (conditional)

The floating hearthfire flame was **removed by design**. If the town-gathering
hearth ever returns, it returns as painted art, not a sprite flame:

| id | prompt sketch |
|---|---|
| `prop_firering` | low round stone fire-ring, cold ashes, on trampled earth — 45° iso, ~300×220 |
| `prop_firering_lit` | same ring alight: small warm flames, ember glow on the surrounding stones |

Wiring: `TOWN_NATURE` at the plaza (`PLAZA` anchor in `town-layout.ts`), lit
variant swapped by stage — the seam matches the lighthouse's state ladder.

## Priority 3 — Plate re-render notes (2×, geography frozen)

When `map_island_plate` is re-rendered at 2× (crispness at zoom), keep the
geography EXACTLY as-is — every anchor in `town-layout.ts` and every test
assumes it. Improvements to fold in:

1. Slightly larger cove sand arc (the pier base sits at x 0.655, y 0.645).
2. Plot clearings sized for the shipped footprint: buildings span `w × 1.04`
   of canvas width (`BUILDING_PLATE_SCALE`) — rings at ~0.17–0.19 W fit the
   0.148-wide buildings with breathing room.
3. Cove + shallows water tuned toward `#4f8698` so the dock/fisherhut sprites
   (or their re-renders, above) sit seamlessly.
4. South-beach shallows kept clear: the jetty + fishing boat moor at
   x 0.505–0.575, y 0.945–0.97.

## Priority 4 — Slicer harvest list (no generation needed — sheets exist)

These source sheets are on the production machine and under-harvested; add the
entries to `tools/slice_assets.py` and re-run:

- **Batch 6-7 “Terrain and UI”** (`final_ui`): only ONE grass tile is cut
  (`turf_light`, reused brightness-shifted as `turf_dark`). Harvest: path/dirt/
  sand/stone ground tiles → `terrain_path_dirt`, `terrain_path_stone`,
  `terrain_sand_patch`; any cliff/shore edge tiles → `shore_edge_a/b`.
- **Batch 11-12 “Environmental effects and Seasonal content”** (`final_env`):
  registered in the slicer, ZERO ids cut. Harvest seasonal dressing (blossom,
  leaf-fall, snow patches) → candidates for `drawSeason` sprite upgrades.
- **`Transparent/Nature.png`**: only 3 dead trees cut; the grid cutter will
  surface the remaining healthy trees/bushes → more variety for `TOWN_NATURE`.
- **`Transparent/Costal Effect.png`**: partially cut (tidepool/shorerock/
  lighthouse/debris); harvest any remaining foam/wave/rock pieces.

## Housekeeping (asset truth after the pass)

- **Deleted** (orphans, never in the manifest): `debris_barrel/crate/driftwood/
  planks/wheel.png`.
- **Unused but kept on disk + in manifest** (manifest is slicer-generated;
  churning it locally would be overwritten): `npc_bran/wren/sorin/marta/joss/
  child/woman/man` (walkers removed from the map — figures return only as
  painted art, if ever), `animal_dog`, `animal_cat` (cut with the figures),
  `boat_fishing_m`, `dock_straight`, `dock_corner`, `dock_end` (retired jetty
  pieces — superseded by Priority 1).
- The **seasonal constellation overlay, meteor showers and on-map moon** were
  retired from the map by design (the night keeps its starfield + real-moonlight
  wash; the stargaze feature keeps its own dedicated sky). `data/moon.ts` and
  `data/constellations.ts` remain live for the dawn "look up" line and stargaze.

## Priority 0 — NIGHT ART (the times-of-day ceiling) · added 2026-07-22

The procedural night was rebuilt (blue grade + jewel lights + ambience layer)
and now reads as a true cozy night — but grading a *daylight* painting can only
go so far: the plate's baked warm shadows fight every night grade. The code now
has **dormant crossfade seams** that lift the ceiling the moment painted night
art lands. Generate in this order:

### 0.1 `map_island_plate_night` (single biggest win)
Moonlit repaint of `map_island_plate` — **SAME geography pixel-for-pixel**
(building anchors, layout tests and the sea-mask classifier all depend on it;
use the day plate as the ControlNet/img2img base at low denoise for structure).
- Palette: deep night navy `#0f1626`→`#16203a` ground shadows, moonlit grass
  blue-green, sea near-black teal `#12242e` with silver moon shimmer.
- Key light: cool silver-blue from the UPPER-RIGHT (matches the code's
  moonlight key + moon-path).
- NO lit windows on the plate (buildings composite separately); a faint warm
  glint allowed only at the lighthouse rock.
- Water must stay blue-dominant (the runtime sea-mask classifies `b > r`).
- Wiring: `public/art/map_island_plate_night.png` + manifest id (re-run the
  slicer or add the id to `ART_IDS`). The map then crossfades the whole ground
  by the real night weight, and the procedural night grade automatically drops
  to 35% strength — art carries the mood.

### 0.2 `town_*_night` building variants (per-building, most-seen first)
`town_cottage_night`, `town_market_night`, `town_bakery_night`,
`town_townhall_night`, then the remaining ten + `_l2/_l3` versions of the four
above. Rules per variant:
- IDENTICAL silhouette + footprint to its day sprite (pipeline: ControlNet
  lineart from the day sprite, fixed per-category seed + IPAdapter).
- Moonlit blue walls/roofs; windows warmly LIT from inside (`#f4a63b`→
  `#ffd27a` family); a soft warm spill onto the ground at the doorway baked in.
- Transparent PNG, same canvas/padding as the day sprite so anchors hold.
- Wiring: drop as `public/art/<id>_night.png` + manifest id — each building
  crossfades individually as its art lands; no code changes needed.

### 0.3 optional: `map_island_plate_dusk` / `map_island_plate_dawn`
Same geography rules; amber golden-hour key from the west / rose first-light
key from the east. The plate seam generalises when these exist (ask for the
two-line code hookup when ready).

## Mockup deviation (LOCKED)

Any future UI/board mockups showing a **gem/diamond currency are off-law**:
Hearth's currencies are coins + the ember-heart energy only. Never generate
premium-currency art.
