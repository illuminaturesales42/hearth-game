# HEARTH — Art Assets to Complete the Dynamic Time-of-Day System

*Generation-ready list. The engine is built and procedural grading already makes the
island shift through dawn/midday/dusk/night — these assets lift it from "graded
daylight painting" to "hand-painted at every hour," and fill the environment gaps.
Every code seam below is already wired: drop the PNG into `public/art/<id>.png`, add
the id to the manifest (re-run `tools/slice_assets.py` or add to `ART_IDS`), and it
lights up. No code changes needed for anything in P0–P1.*

---

## STYLE BLOCK — prepend to EVERY prompt

```
HEARTH art style (the law — match exactly, do not invent a new style):
Hand-painted warm storybook illustration. Soft painterly brushwork, gentle
rim light, cosy golden-hour warmth. Palette: #EAD7B5 #C79A6B #8FBF8F #6A8CA7
#8E7CC3 #D46B6B #F4F0E6. 45° isometric for world/buildings/props; 3/4 view
for characters. No text, labels, letters, numbers, watermarks, or UI frames
inside the image. Never draw gems or premium currency; game energy is an
ember-heart flame, never a lightning bolt. Consistent scale and lighting with
the delivered Batch 2–8 sheets.
```

**Pipeline note:** for every variant that must line up with an existing sprite
(all `_night`/`_dusk`/`_dawn` plates and buildings), use the **day asset as an
img2img / ControlNet base at low denoise** so geometry stays pixel-aligned — the
building anchors, the layout tests, and the runtime sea-mask all depend on the
geography and silhouettes not moving.

---

## P0 — Time-of-day island plates ⭐ biggest single win

The whole ground is one painted plate (`map_island_plate.png`, 1536×1024). Painting
it at three more times of day makes the island *authored* at each hour; the engine
crossfades between them by the real sun and automatically backs its procedural grade
down to 35% when the art is present. **Same geography pixel-for-pixel** (base each on
the day plate).

| id | when | key light | palette / mood |
|---|---|---|---|
| `map_island_plate_night` | deep night | cool silver-blue from UPPER-RIGHT | deep navy `#0f1626`→`#16203a` ground, moonlit blue-green grass, near-black teal sea `#12242e` with a silver moon shimmer. **No lit windows** (buildings composite on top); a faint warm glint only at the lighthouse rock. Water must stay blue-dominant. |
| `map_island_plate_dusk` | golden hour | warm amber from the WEST (left) | long warm shadows, amber-lit west faces, sea deep blue-violet with a molten gold sun-path from the left edge. |
| `map_island_plate_dawn` | sunrise | rose-gold from the EAST (right) | cool pastel mist in the low ground, dewy blue-green, pale rose sea, soft haze. |

Size: 1536×1024, opaque (full scene), PNG. *(midday = the existing day plate — no new art.)*

---

## P1 — Building night variants (lit windows) ⭐ the cosy payoff

The town composites as separate building sprites over the plate. A `_night` variant per
building — moonlit walls + **warmly lit windows** — crossfades in as night falls. Ships
per-building, so generate in this order (most-seen first) and drop them in as you go.

**Order 1 (do these four first):** `town_cottage_night`, `town_market_night`,
`town_bakery_night`, `town_townhall_night`
**Order 2:** `town_garden_night`, `town_farm_night`, `town_workshop_night`,
`town_sawmill_night`, `town_blacksmith_night`, `town_library_night`
**Water buildings:** `town_dock_night`, `town_fisherhut_night`
**Lighthouse:** `prop_lighthouse_night`, `prop_lighthouse_l2_night` (windows + a warm lantern-room glow)

Per variant, prompt after the STYLE BLOCK:
```
Night version of <BUILDING>. IDENTICAL silhouette, footprint and roofline to the
daytime sprite (use it as the base). Moonlit blue-grey walls and roof, cool rim
light from the upper-right. Windows glowing warm from inside (#f4a63b → #ffd27a),
a soft warm spill of light on the ground at the doorway. Transparent background,
single subject centred, same canvas size and padding as the day sprite, soft
contact shadow only.
```
Size: match each day sprite exactly (transparent PNG). Also do `_l2`/`_l3` night
variants for the four Order-1 buildings once the base set looks right.

---

## P2 — Water-seam + market (finishes the environment pass)

The pier and fisher's hut carry their own baked water that's lighter than the plate's
cove, leaving a pale halo. Fix with either art below.

| id | spec |
|---|---|
| `dock_pier_long` | weathered timber pier on tall pilings running toward lower-right; **no water painted** (transparent below deck), rope + lantern detail. ~700×450. Replaces `dock_small`. |
| `dock_pier_end` | matching end-cap with mooring bollard, transparent below deck. ~360×360. |
| `shore_transition_sand_a` / `_b` / `_c` | three flat grass→sand→wet-sand skirt tiles, plate sand palette, irregular painterly edges, no structure. ~420×220 each. |
| `town_market_awning` + `town_market_awning_furled` | the striped market awning alone, matching `town_market`'s awning geometry — the walk-reaction "market opens" beat (a warm glow stands in for now). |

**Alternative (bigger win):** re-render `town_dock` and `town_fisherhut` with their baked
water matched to the plate's cove teal (`#4f8698` family) — keep silhouettes/footprints
identical so anchors hold.

---

## P3 — Dusk / dawn building variants (optional polish)

Only if you want buildings *painted* at golden hour / sunrise rather than procedurally
graded. Same rules as P1 (identical silhouette), keys: dusk = warm amber from the west;
dawn = rose from the east. `town_<id>_dusk`, `town_<id>_dawn`. Lowest priority — the P0
plates + procedural grade already carry these hours well.

---

## P4 — Conditional / small

- `prop_firering` + `prop_firering_lit` — a low stone gathering-fire ring for the plaza,
  cold + alight. Only if you want the town hearth back as painted art (~300×220, 45° iso).
- `prop_well_night`, `prop_sign_night` — night variants for the two props (nice-to-have).

---

## NOT art (context — so nothing here is generated by mistake)

- **UI theming** (panels, brass, buttons, energy pill shifting with the day) is done with
  **CSS variables**, not images — a code task, no assets.
- **Time badge** (corner medallion) already has all four states
  (`time_badge_sunrise/midday/sunset/night`) — no new art.
- **Cast shadows, water lighting, moon phase, fireflies, sun-path** are all procedural — no art.

## Already on your machine — slice, don't generate

These sit unharvested on delivered source sheets; add stanzas to `tools/slice_assets.py`
and re-run rather than regenerating:
- **Batch 6-7 "Terrain and UI"** — path/dirt/sand/stone ground tiles (only one grass tile
  was ever cut) → `terrain_path_dirt`, `terrain_path_stone`, `terrain_sand_patch`.
- **Batch 11-12 "Environmental & Seasonal"** — registered in the slicer, **zero ids cut**;
  seasonal dressing (blossom, leaf-fall, snow patches).
- **`Transparent/Nature.png`** — healthy trees/bushes beyond the 3 dead trees.
- **`Transparent/Costal Effect.png`** — remaining foam/wave/rock pieces.

---

## Generation priority summary

1. **`map_island_plate_night`** — the single biggest visual jump.
2. **Order-1 building `_night` set** (cottage, market, bakery, townhall) — the cosy lit-window feel.
3. **`map_island_plate_dusk`** + the rest of the `_night` buildings.
4. **`map_island_plate_dawn`**, then the P2 water set.
5. Everything else as polish.

*File naming = the code id exactly, lowercase snake_case, `.png`. Drop into
`public/art/`, add to the manifest, and it wires itself in.*
