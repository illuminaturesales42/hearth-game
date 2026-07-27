# HEARTH — Living Weather & Atmosphere System

**Production blueprint · v1 · 2026-07-28**

> *"It's raining outside… and it's raining in Hearth."*
>
> The goal is emotional resonance, not weather accuracy. Every time the player opens Hearth,
> the island should already feel like their moment of their day — before they read a single
> number. This document specifies a ground-up redesign of Hearth's presentation layer:
> a painterly art revamp of the whole island (matching the portrait-catalogue style), a hybrid
> canvas + WebGL render pipeline, an art-directed weather-mood system, a transition engine so
> weather breathes instead of snapping, adaptive audio, and the emotional design that binds it.

**Part A** fully specifies the highest-value targets. **Part B** scopes everything else for later.

---

## Governing laws (unchanged, non-negotiable)

1. **The Hearth Test** — the world *reflects*, it never punishes. No weather state may feel like
   a penalty; storms are cosy drama, not gloom lock-in (see §8, Interpret mode).
2. **Ember, never lightning-bolt** — energy iconography stays an ember-heart. Storm lightning is
   environmental art only and never touches UI/energy metaphors.
3. **Dark navy/gold storybook palette** — art-bible §1 remains the style law; the new painterly
   pass *raises fidelity within* that palette, it does not replace it.
4. **Accessibility escape hatches** — `body.reduce-motion` (no rAF at all) and
   `body.high-contrast` (pins all `--env-*` vars) must both remain fully honoured by every new
   system. Every animated effect ships with a static representative frame.
5. **No gems, no IAP art, energy never sold.**
6. **Never theme** text contrast, semantic colours (good/danger), currency colours, progress
   readability, or focus rings.

## What survives vs. what is redesigned

| Survives (the data spine) | Redesigned (the presentation) |
|---|---|
| `src/core/sun.ts` — real solar position/times (SunCalc port) | All island + building art → painterly portrait style, authored in layers |
| `src/core/time-of-day.ts` — overlapping phase crossfade weights | Map rendering → hybrid canvas + WebGL composite |
| `src/ui/weather.ts` — Open-Meteo fetch, geolocation, sky-pref opt-out | Atmosphere FX (clouds, rain, fog, light) → GPU, mood-driven |
| `src/core/world-mood.ts` + `weather-history.ts` — mood fields, accumulation | UI environment treatment → widened `--env-*`, glass, live medallion |
| `src/core/environment.ts` — `computeEnvironment()` | Audio mix design → mood-mixed stems, new voices |
| `hearth:environment` DOM event seam | Weather state changes → damped transition engine |
| `src/ui/feedback.ts` + `stem-levels.ts` — procedural WebAudio stems | |
| `artUrl(id) === null` art-gating; settings/reduced-motion/high-contrast | |

---

# PART A — FULL SPECIFICATIONS

---

## 1. Vision & emotional design foundation

### 1.1 The resonance principle

Raw weather data is an **input to art direction, never an animation timeline**. Between
Open-Meteo and the renderer sits a resolver that answers one question: *what should this
moment feel like?* Two rainy days with different wind, temperature and time of day are two
different feelings — and Hearth renders the feeling.

### 1.2 WeatherMood — the art-directed layer

```ts
// src/core/weather-mood.ts (new, pure)
export type WeatherMood =
  | 'golden-calm'      // clear, low sun, light wind
  | 'bright-day'       // clear/partly cloudy midday
  | 'fresh-morning'    // clear-ish dawn, dew, cool
  | 'soft-overcast'    // full cloud, dry, gentle
  | 'cosy-rain'        // light/moderate rain, low wind, mild
  | 'wind-swept'       // strong wind, dry or spitting
  | 'misty'            // fog/mist, low visibility
  | 'storm-watch'      // heavy rain + gusts + thunder risk
  | 'frosted'          // clear + below ~3°C, frost memory
  | 'snow-glow'        // snowing or fresh snow cover
  | 'moonlit-clear'    // night + low cloud + moon up
  | 'deep-night';      // night + overcast/new moon
```

**Resolver inputs:** WMO weather code (`weatherFromWmo`), cloud cover, precipitation +
intensity, wind speed/gusts, temperature, visibility, thunder risk, phase weights
(`phaseForTime`), moon illumination, season, and accumulation memory (wetness/snowDepth/frost
from `weather-history.ts`). **Resolution is a priority ladder** (storm-watch beats cosy-rain
beats soft-overcast…), then night variants override day variants. Hysteresis: a mood must be
stable for ≥2 refresh cycles before switching, so boundary conditions don't flicker.

### 1.3 The mood → feeling matrix

Each mood has one **target emotion** and the levers that produce it. This table is the
acceptance test for all downstream art and audio: if a mood doesn't land its feeling, the
levers are wrong.

| Mood | Target feeling | Primary levers |
|---|---|---|
| golden-calm | nostalgic warmth | long amber light, god rays, slow motion, warm brass UI |
| bright-day | hopeful energy | crisp light, sparkling water, gulls + market bustle |
| fresh-morning | renewal | pastel grade, dew glints, mist burning off, morning birds |
| soft-overcast | gentle calm | flattened contrast, muted palette, soft ambient hush |
| cosy-rain | sheltered cosiness | warm windows vs cool rain, roof-rain audio, glass droplets |
| wind-swept | adventurous | fast clouds + shadows, bent trees, flags, whoosh gusts |
| misty | mystery, quiet | depth fog, lighthouse beam visible, muffled sound |
| storm-watch | safe drama | dark ambient + bright interiors, cloud-lit lightning, thunder |
| frosted | crisp stillness | cold blue-gold grade, frost glints, clear air, sparse audio |
| snow-glow | wonder | bounced white light, fat flakes, snow-hush audio, warm chimneys |
| moonlit-clear | peaceful reflection | moon path on sea, stars, fireflies, owl + crickets |
| deep-night | sleepy safety | near-monochrome navy, ember windows, hearth crackle |

**Mood captions** (shown in the HUD/medallion tooltip) are written in Hearth's voice — never
data-speak: *"A storm is watching the harbour"*, not *"Heavy rain, 32 km/h gusts"*. One caption
set per mood × phase, in `src/data/` alongside existing copy.

### 1.4 Season colours the mood

Season (hemisphere-aware, `seasonForMonth`) never *selects* a mood — it *tints* it: spring
pushes grades greener and adds blossom particles; summer warms and lengthens golden hour;
autumn ambers the palette and adds leaf-fall; winter cools grades, lengthens shadows, and
biases toward frosted/snow-glow when temperature allows.

---

## 2. Layered art architecture & ComfyUI production pipeline

**This is the load-bearing section.** The renderer can only light what the art encodes. The
island is rebuilt as *authored layers*, not flat plates — generated with the same ComfyUI
discipline that produced the 288-portrait catalogue (`docs/avatar-modular-catalogue.md`).

### 2.1 Scene decomposition

Render stack, back to front:

```
L0  Sky strip           art_sky_strip (tall, gradient-friendly painted sky, clean horizon)
L1  Far band            art_far_band (distant sea + headland, transparent top)
L2  Island base plate   map_island_plate_v3 (NEUTRAL-LIT painterly island, no baked time-of-day)
L3  Building sprites    town_<id>_v3[_l2|_l3|_ruin|_wip] (portrait-style, neutral-lit)
L4  Near foreground     art_near_band (foreground grasses/rocks, strongest parallax)
——— WebGL composite consumes L0–L4 plus the masks below ———
M1  Emissive masks      mask_emit_<building> + mask_emit_island (windows, lanterns, forge,
                        oven, hearths, lighthouse lamp — greyscale, white = glows)
M2  Sun-key overlays    light_key_e / _se / _s / _sw / _w (soft painted highlight passes,
                        'screen'-composited, blended by real sun azimuth)
M3  Material overlays   wet_sheen_<building>, snowcap_<building>, snow_island, frost_island
M4  Depth mask          mask_depth_island (greyscale near→far, drives fog-by-depth + parallax)
```

Key changes from today:

- **One neutral plate, not four time plates.** Time-of-day becomes *entirely* a lighting
  operation (grade LUT + sun-key + emissive), so every minute of the day looks unique instead
  of crossfading four paintings. The four painted plates retire to the Tier-C fallback.
- **Sky is procedural + painted hybrid.** The painted sky strip carries brushwork texture; the
  shader multiplies a continuous multi-stop gradient (Nimbus-style, 7 elevation zones) over it
  and composites procedural cloud layers, sun/moon disc, and stars.
- **Emissive masks make dusk magical.** Each building's windows warm individually
  (`hash(buildingId)` offset, as today's glow logic) but now with true bloom.
- **Depth mask buys atmosphere.** Fog, mist, haze, and rain-fade all become depth-weighted —
  distant headland dissolves first, foreground stays crisp. This single mask is the highest
  leverage per art-hour in the whole plan.

### 2.2 Geography freeze

`town-layout.ts` anchors and the no-collision tests are load-bearing. **The v3 island plate
must keep the same geography** (coastline, building footprints, paths) as the current plate —
same rule as `environment-pass-art-brief-2026-07.md`. Style revamps; positions don't. If the
revamp genuinely needs new geography, that is a separate, explicitly-planned layout migration
with test updates — not a side effect of art delivery.

### 2.3 ComfyUI pipeline (mirrors the portrait-catalogue workflow)

1. **Hero reference** — grade one hero frame first: the island at neutral light in portrait
   style. This is the style anchor for everything else (as `avatar_c01` was for the catalogue).
2. **Style lock** — IPAdapter on the hero + 2–3 best portraits; fixed seed per asset family;
   shared checkpoint/LoRA stack recorded in `docs/island-v3-comfy-prompts.md` (new, sibling of
   `avatar-portrait-comfy-prompts.md`).
3. **Structure lock** — ControlNet (depth or lineart) from the *current* plate/building renders
   so geography and silhouettes survive the style transfer (img2img denoise ≈ 0.45–0.6).
4. **Per-layer prompts** — neutral overcast lighting in the prompt for base layers ("soft
   diffuse daylight, no strong shadows"); the universal negative prompt from
   `asset-generation-brief.md` applies (no text, no gems, no lightning bolts).
5. **Mask extraction** — emissive masks are *derived*, not hand-painted from scratch: generate
   the building lit-at-night variant, difference it against neutral, threshold + blur → mask;
   hand-touch in an editor. Depth mask: ControlNet depth estimate of the plate, manually
   corrected. Document the exact node graph in the prompts doc.
6. **QA checklist per asset** — silhouette matches current anchor box; palette within art-bible
   swatches; no baked time-of-day light; no baked text; alpha edges clean at 200% zoom;
   emissive mask has zero bleed outside window/lamp shapes.
7. **Delivery** — PNG into `public/art/<id>.png`, regenerate manifest via
   `tools/import_map_v2.py`. Sheet-based batches go through `slice_assets.py`
   (`register_whole()` for singles). **Tileable textures must bypass `AUTOCROP`** — the
   alpha-bbox trim destroys edge-to-edge tiling.

### 2.4 Asset inventory (priorities & dependencies)

**P0 — pipeline provers (blocks W2/W3):**

| Asset | Notes |
|---|---|
| `mask_emit_island` + 3 hero building emissive masks (cottage, bakery, lighthouse) | Derivable from *existing* night art today — no new painting needed. Unblocks the WebGL emissive/bloom pass immediately |
| `mask_depth_island` | ControlNet depth of current plate — unblocks fog-by-depth |
| `art_sky_strip` | First v3-style painting; proves the style lock |

**P1 — island revamp wave 1 (W3):**

| Asset | Notes |
|---|---|
| `map_island_plate_v3` (neutral) | Geography-frozen, style-locked |
| `art_far_band`, `art_near_band` | Depth separation |
| `light_key_se`, `light_key_s`, `light_key_sw` | 3 sun keys first (morning/noon/afternoon); E/W later |
| 3 hero buildings v3 (all states) + their masks | Establishes the building re-gen recipe |
| Particle atlas 1: `fx_rain_streaks`, `fx_snow_flakes`, `fx_fog_band` (512² tileable) | Already asset-brief P3 §9 — promoted to P1 |

**P2 — full catalogue (W5):**

| Asset | Notes |
|---|---|
| Remaining 11 buildings v3 × states + masks | Batch re-gen using the W3 recipe |
| `wet_sheen_*`, `snowcap_*`, `snow_island`, `frost_island` overlays | Material variants |
| Particle atlas 2: `fx_leaf`, `fx_blossom`, `fx_firefly`, `fx_pollen`, `fx_splash` | Replaces procedural dots with painterly motes |
| Seasonal dressing props (art-todo P1 #4–12: snow trees, snowman, brazier, icicles, blossom) | Already briefed |
| `time_badge_evening` (bespoke) | Medallion completeness |

**P3 — polish tail:** seasonal turf, `light_key_e`/`_w`, aurora strip, storm sky strip variant.

---

## 3. Hybrid render pipeline (canvas + WebGL composite)

### 3.1 Architecture

The existing `MapView` canvas keeps doing what it's good at — painter's-algorithm scene
assembly (plates, sprites, people, boats) with its camera, hit-testing, and 32 ms frame cap.
The new **WebGL2 compositor** sits on a second `<canvas>` stacked above it and owns everything
photometric:

```
canvas 2D (existing)             WebGL2 compositor (new)
─────────────────────            ─────────────────────────────────────────────
scene assembly            ──►    scene texture (uploaded on dirty, not per frame)
  sprites, camera,               + mask textures (emissive, depth — static uploads)
  hit-testing, people            + uniforms from EnvironmentState v2
                                 passes:
                                   1. sky: gradient × painted strip, sun/moon disc, stars
                                   2. clouds: 2–3 scrolling noise-warped layers + shadow
                                      projection onto scene (multiply, wind-driven)
                                   3. grade: colour matrix or 16³ LUT per mood/phase
                                   4. sun-key: blend 2 nearest light_key overlays (screen)
                                   5. emissive: mask × warm glow × per-building phase offset,
                                      threshold → half-res bloom (2-tap separable blur)
                                   6. god rays: radial blur from real sun screen-position,
                                      golden-hour gated, occluded by cloud cover
                                   7. weather particles: instanced quads from atlases
                                      (rain 3 depth layers, snow sine-drift, leaves, embers)
                                   8. fog: depth-mask-weighted fog colour + mist banks
                                   9. water: shimmer + moon/lantern reflection smear on the
                                      sea region (sea mask reused from today's masks())
                                  10. finish: vignette, ~1.5% film grain, wet-lens droplets
                                      (storm only), subtle parallax from device tilt/drag
```

- **Scene texture uploads on dirty, not per frame.** The 2D canvas re-composites only when the
  town changes (event-driven, as today); the WebGL pass animates at frame rate on a static
  texture. This is the trick that makes the hybrid cheap: per-frame cost is a handful of
  full-screen quads, not a scene redraw + `texImage2D` every frame.
- **Camera sync:** pan/zoom transforms are passed as uniforms so the composite layers
  (cloud shadows, fog, particles) track the world, while sky/vignette stay screen-space.
- **Zero dependencies — hand-rolled WebGL2.** Recommendation over PixiJS: the repo is
  deliberately zero-runtime-dep; the compositor needs ~10 shaders, one quad VAO, and one
  instanced particle buffer — under ~1500 lines. PixiJS (~450 KB) buys nothing we use.
  Decision is encapsulated: `src/render/compositor.ts` exposes `Compositor.render(env, camera)`
  and could be swapped later.

### 3.2 Renderer tiers

| Tier | Devices | Pipeline | Target |
|---|---|---|---|
| **A — Cinematic** | Modern desktop, flagship mobile | All passes; bloom at half-res; DPR ≤ 2 | 60 fps interacting, 30 idle |
| **B — Standard** | Mid-range mobile, weak GPUs | No bloom/god rays/reflections; single cloud layer; particle cap ÷ 4; DPR ≤ 1.25 | 30 fps |
| **C — Fallback** | No WebGL2 / context-loss / opt-out | **Today's shipped 2D pipeline unchanged** (time plates + `maskedGrade` + procedural FX) | as today |

- Startup capability probe: create context, compile the grade shader, render one frame,
  measure. Failure at any step → next tier down. `webglcontextlost` → Tier C, attempt restore.
- **Dynamic quality controller:** rolling frame-time average; `>24 ms for 2 s` → drop one
  quality notch (render scale → particles → bloom off → tier down); `<14 ms for 10 s` →
  restore one notch. Notches, not oscillation.
- Frame-loop policy extends today's: interacting 60, visible-idle 30, static-weather 20,
  hidden/offscreen fully paused, reduce-motion **no loop at all** (one composed static frame
  per state change, same `draw(0)` contract as today).

### 3.3 Reduced-motion contract (per pass)

Grade, sun-key, emissive glow, fog, vignette: **kept** (static per state). Cloud motion →
frozen mid-drift frame. Particles → static sparse texture overlay. God rays → static at low
opacity. Parallax, droplets, grain animation, lightning: **off**. Every shader takes its
animated inputs as uniforms, so "static" is just "stop advancing time" — no branching.

---

## 4. Environment State v2 + transition engine

### 4.1 Extended state

```ts
// src/core/environment.ts (extended, stays pure)
export interface WorldEnvironment {
  // — existing fields survive unchanged —
  phase: TimeOfDay; weights: PhaseWeights;
  daylight: number; nightAmount: number; goldenHour: number;
  warmth: number; moonAmount: number; light: string; ambient: string; cloudFlat: number;
  // — v2 additions —
  sunAltitude: number; sunAzimuth: number;    // from sunPosition(), for god rays & keys
  windSpeed: number; windAngle: number;        // already fetched, now first-class
  humidity: number; visibility: number;        // fog/haze drivers
  precip: number; precipIntensity: number;     // 0–1 continuous curve, not binary
  thunderRisk: number;
  mood: WeatherMood;
  wetness: number; snowDepth: number; frost: number;  // lifted from accumulation
  season: Season; seasonProgress: number;
}
```

### 4.2 The transition engine — weather breathes

Raw refreshes (weather every 30 min, solar every 60 s) set **targets**; a damper advances
**current** values every frame the compositor runs:

```ts
// src/core/environment-damper.ts (new, pure, unit-tested)
current += (target - current) * (1 - Math.exp(-dt / tau));
```

Per-channel time constants (τ), tuned from the resonance spec:

| Channel | τ / behaviour |
|---|---|
| Colour grade / LUT blend | 45 s |
| Cloud cover | 60 s |
| Wind speed/angle | 30 s (angle via shortest arc) |
| Rain **starting** | 12 s ramp-in |
| Rain **stopping** | 25 s ramp-out (drips linger) |
| Fog / visibility | 90 s |
| Thunder risk | 8 s in, 60 s out |
| Day/night | continuous (solar-driven, no damping needed) |
| Mood switch | gated by resolver hysteresis (§1.2), then channels damp individually |

**One consumer contract:** the damped state is the *only* thing downstream systems see —
WebGL uniforms, canvas Tier-C washes, `--env-*` CSS vars, audio stem levels, activity
scheduler. Published on the existing `hearth:environment` DOM event (now at damper cadence
when visible, 60 s when idle). No system ever reads raw API data.

Testing: pure functions, injected `now`/`dt` — extends `tests/environment.test.ts`; new
`tests/environment-damper.test.ts` (convergence, shortest-arc wind, ramp asymmetry) and
`tests/weather-mood.test.ts` (resolver ladder + hysteresis table cases).

---

## 5. Hero weather states — full definitions

The states that carry 90% of felt experience. Long-tail states are one-liners in Part B.
Format: **Sky/light · Particles · World · Audio · Feeling.**

### 5.1 Clear — golden hour (`golden-calm`)
- **Sky/light:** amber-rose gradient low zones; grade LUT warms +12%, lifts shadows toward
  dusk-blue; sun-key SW/W at full; god rays on (cloud-occluded); long water reflection smear
  toward the real sun azimuth.
- **Particles:** drifting pollen motes catching light (Tier A), none Tier B.
- **World:** boats turning home; first windows warming (emissive ramp begins at sun < 6°,
  per-building offset); gulls thinning; laundry stilling.
- **Audio:** birds fading down, crickets fading in, surf softening; brass-warm calmPad.
- **Feeling:** nostalgic warmth — the screenshot moment. This state is the marketing clip.

### 5.2 Clear — midday (`bright-day`)
- Neutral-bright grade, saturation 1.0; short reflections, strong water sparkle; crisp cloud
  shadows if any cloud. Butterflies, gulls, market chatter stem up. Feeling: hopeful energy.

### 5.3 Clear — night (`moonlit-clear`)
- Navy grade (exposure ~0.5), moon disc with correct phase (existing `moon.ts`), **moon path
  shimmer** on sea toward moon azimuth; stars full (cloud-dimmed); fireflies near shore;
  lighthouse active with subtle beam bloom; windows at ember warmth. Owl + crickets + soft
  surf; lighthouse mechanism tick barely audible. Feeling: peaceful reflection.

### 5.4 Partly cloudy
- 1–2 cloud layers at 30–50% coverage; **travelling cloud shadows** (multiply projection,
  moving with real wind vector) are the hero effect — sunlight visibly comes and goes across
  rooftops, dimming god rays and sparkle in sync. Feeling: living, changeable, awake.

### 5.5 Overcast (`soft-overcast`)
- Flat light: contrast −20%, saturation −15%, shadows lifted; no sun-key, no rays; sky a soft
  luminous grey-lavender (never dead grey — storybook law); water pewter, low sparkle.
  Audio hushed: wind low, birds sparse, chatter muted. Feeling: gentle calm.

### 5.6 Drizzle → light rain → heavy rain (`cosy-rain`, continuous intensity)
Rain is a **single system with a 0–1 intensity curve**, not three binaries:
- **Sky/light:** grade cools and darkens with intensity; *interior warmth rises to
  compensate* — emissive glow gain × (1 + 0.5·intensity). The cosy contract: the wetter it
  gets outside, the warmer the windows. Wet sheen overlay on roofs/paths ramps with `wetness`.
- **Particles:** 3 GPU depth layers (far short/faint, mid, near long/fast), slant = wind
  angle, count/length/speed scale with intensity. Splash rings in `GROUND_BANDS.puddles`;
  puddles grow with accumulation and reflect sky colour + nearby emissives.
- **World:** villagers indoors at high intensity (more lit windows); chimneys up; gulls gone;
  boats moored. After rain: rainbow logic survives (bows away from real sun), petrichor beat —
  birds surge for 2 min.
- **Audio:** rain stem intensity-curved with a roof-patter band-pass layer at > 0.4;
  surf up; chatter down; frog stem after dusk post-rain.
- **Feeling:** sheltered cosiness — Hearth's second-best state after golden hour.

### 5.7 Storm (`storm-watch`)
- **Sky/light:** darkest daytime grade (exposure 0.65, cool shift); heavy low cloud layer
  scrolling fast; **lightning = internal cloud illumination** — a 2-frame brightening *inside*
  the cloud layer with a soft ground bounce, never a full-screen flash (photosensitivity +
  taste). Rate-limited: ≥ 20 s between events, ≤ 3/min, disabled under reduce-motion.
- **Particles:** rain at max intensity + wind-torn angle variance; leaves/debris streaks;
  storm droplets on the "lens" (finish pass, Tier A only).
- **World:** lighthouse storm mode (brighter beam, faster sweep); shutters lit; nobody out;
  sea state up (wave amplitude uniform).
- **Audio:** existing `rollThunder()` distance model driven by `thunderRisk` (far rumbles at
  low risk, closer cracks at high); wind gusts; rain max; interior-muffle EQ tilt.
- **Feeling:** safe drama — storm outside, ember inside. The Hearth Test's showcase.

### 5.8 Mist / Fog (`misty`)
- **Depth-mask fog is the hero:** far band dissolves into fog colour, mid softens, near stays
  crisp; visibility uniform maps to fog density. Lighthouse beam becomes a visible volumetric
  cone (screen-space cone × fog density — fog makes the lighthouse matter).
- Dawn mist auto-burns-off over ~20 real minutes after sunrise. Audio muffled (low-pass tilt
  on all stems), foghorn note at heavy fog (rare, gentle). Feeling: mystery, quiet.

### 5.9 Snow (`snow-glow`)
- Bounced-light grade (exposure +10% under overcast — snow brightens), fat flakes in 3 layers
  with sine drift, `snowcap_*`/`snow_island` overlays ramp with `snowDepth`; chimneys all
  active; snow-hush audio (all stems −30%, crunch accents). Feeling: wonder.

### 5.10 Wind (`wind-swept`, modifier + state)
- Wind is primarily a **modifier** (slants rain, speeds clouds/shadows, bends trees via a
  2–4° skew shear on tree sprites, animates flags/laundry) and a full state when dry + strong:
  fast shadows, leaf gusts, choppy sea, whistling wind stem with gust envelope. Feeling:
  adventurous.

---

## 6. Living world behaviour

All behaviour reads the damped EnvironmentState — never raw data, never its own clock.

| System | Behaviour |
|---|---|
| **Windows** | Emissive ramp starts sun < 6° alt; per-building `hash(id) × 0.18` phase offset — the village lights one window at a time. Late night (> 23:00 local): 60% dim to ember. Rain/cold: glow gain up (§5.6) |
| **Chimneys** | Smoke = f(cold + morning + evening + occupied). Storm: smoke torn horizontal by wind vector |
| **Lighthouse** | `off` (sun > 4°) → `warming` (4°…−3°: lamp glows, no beam) → `active` (rotating beam, bloom) → `storm` (brighter, faster, fog-cone). Beam reflects on sea |
| **Boats** | Depart after dawn, return through golden hour, sheltered/moored in storm+fog. Lantern emissives at night |
| **Wildlife** | Gulls (day, clear/partly), butterflies (warm clear day, existing mood field), fireflies (calm mild nights near shore), moths (around lanterns at night), owl (audio, deep night), frogs (audio, post-rain dusk), birds surge at dawn + post-rain |
| **NPC presence** | `villagersOut` (existing) now also drives sprite density: market bustles bright days, empties in rain/storm/night. Never blocks gameplay — visual only |
| **Flags/laundry** | Sway amplitude + frequency from windSpeed; laundry only on dry days |
| **Puddles/snow** | Formation + drying/melt from `weather-history` accumulation, as today, now rendered as reflective decals (§5.6) |

**Ambient activity scheduler:** the existing pool concept, formalised — every few seconds roll
against probability pools weighted by phase weights × mood (dawn: birds-depart, chimney-start,
boat-depart · day: market-walk, gulls, butterflies · dusk: boats-return, lantern-light ·
night: fireflies, moths, owl, window-dim). One scheduled vignette at a time; reduce-motion
schedules none.

---

## 7. Adaptive audio v2

All procedural WebAudio through the existing `stemLevels()` → `buildStems()` → `applyStem()`
pipeline. **New stems** (add to `StemLevels`, one node-graph each in `feedback.ts`):

| Stem | Recipe sketch | Driven by |
|---|---|---|
| `frogs` | Pulsed band-passed noise chirps, irregular grouping | post-rain × dusk/night × warm |
| `bell` | Struck-tone synthesis (detuned partials + long decay), hour marks 08–20 local only, ≤ 1 strike sequence/hr | local clock; skipped in storm |
| `fireplace` | Existing hearth crackle voice promoted to a stem | cold nights, rain, `saunaWarm` |
| `roofRain` | Band-passed rain layer, more percussive than the wash | precipIntensity > 0.4 |

**Mix design:** per-mood stem tables (12 moods × 11 stems, levels 0–1) live in
`stem-levels.ts` as data; `stemLevels(env)` returns mood table × phase weights × intensity
curves. Crossfade ramps match the visual damper (rain audio ramps with the same τ as rain
visuals — sight and sound agree). Thunder stays event-based (`rollThunder`), now with
`thunderRisk`-scaled distance delay. Muffle tilt: fog and heavy rain apply a gentle global
low-pass — the world sounds closer.

Optional later upgrade path (Part B): recorded ambience loops per mood, crossfaded — only if
procedural quality caps out; keeps zero-asset default.

---

## 8. Mirror / Interpret / Sanctuary

Generalises the shipped `SkyPref` (`real|clear|rain|snow`) into three player modes:

| Mode | Behaviour | Settings copy |
|---|---|---|
| **Mirror** | Literal local weather (today's `real`) | "Emberhollow shares your sky, exactly as it is." |
| **Interpret** *(new default)* | Real weather as inspiration, softened: after 3 consecutive gloom days (overcast/rain dominant), guarantee interludes — a golden-hour break each day regardless of clouds; storm caps at storm-watch drama without oppressive darkness; extreme heat/cold render as beauty (haze shimmer, crisp frost), not discomfort | "Emberhollow feels your weather, and always finds the beauty in it." |
| **Sanctuary** | Player picks a fixed atmosphere (existing presets, extended to any mood + phase); real solar clock still drives time of day unless they also pin a phase | "Choose the sky that feels like home. Emberhollow will keep it for you." |

Rule: **reality informs; the player directs.** Migration: `real → Interpret` (better default;
one-time toast explains), presets → Sanctuary. Existing `effectiveWeather()` /
`presetAccumulation()` seams extend naturally. High-contrast + reduce-motion unaffected.

---

## 9. UI environment integration

- **Widen `--env-*` consumption** (zero-JS-risk: defaults identical, high-contrast pins):
  panel gradients, parchment warmth (a ±3% hue-rotate/brightness on `--parch` decorative uses
  only), brass/gold edge highlights tracking `warmth`, nav chrome, app-background vignette
  depth tracking `nightAmount`. Add 3 new vars: `--env-glass-tint`, `--env-wet` (0–1),
  `--env-mood` (name, for CSS state hooks like `[data-mood="storm-watch"]`).
- **Frosted glass panels:** overlay panels (settings, orders) get a glass treatment —
  `backdrop-filter: blur() saturate()` + `--env-glass-tint` + a subtle painted rim from the UI
  kit. In rain at Tier A, the compositor's finish pass renders faint droplet refraction on the
  glass *border zones only* — text-centre zones stay untouched (readability law). CSS-only at
  Tier B/C.
- **The live medallion:** the HUD time badge (`home.ts renderHud`) upgrades from swapped PNGs
  to a layered mini-viewport (~70 px): cross-faded painted badges (phase weights as opacities)
  + live sun/moon dot on its arc (real altitude/azimuth) + micro weather overlay (rain
  streaks/snow/fog wisp) + lighthouse pixel glowing when active. Tap → mood caption + today's
  sun times (existing almanac). It is the whole system in miniature — the first thing that
  says "Hearth knows".

---

## 10. Performance, accessibility & QA

**Budgets:**

| Metric | Tier A | Tier B | Tier C |
|---|---|---|---|
| GPU frame time | < 8 ms | < 16 ms | n/a |
| Compositor JS/frame | < 2 ms | < 2 ms | as today |
| Added texture memory | < 48 MB | < 24 MB | 0 |
| Added JS payload (compositor + shaders) | < 40 KB gz | same | 0 (lazy module, never fetched) |
| Particle count | ≤ 900 | ≤ 220 | procedural as today |
| Lighthouse perf score (Phase-0 gate) | ≥ 90 | ≥ 90 | ≥ 90 |

- Compositor is a **lazy-loaded module** — Tier C never downloads it.
- New art is not precached by the PWA (existing `globPatterns` exclusion stands); layered
  masks load progressively, compositor activates per-layer as textures arrive (`artUrl`
  gating: code ships dormant, art activates it).
- No thermal creep: idle 30 fps cap + static-weather 20 fps + dirty-only scene uploads.
- **Accessibility:** reduce-motion per-pass contract (§3.3); high-contrast pins env vars and
  forces Tier C grading to neutral; lightning rate-limits (§5.7) and never full-screen;
  weather never gates gameplay; screen-reader mood caption on the medallion
  (`aria-label = caption + temperature`).
- **QA:** Playwright screenshot matrix — 12 moods × 5 phases × Tier A/C via extended debug
  scrubber: `hearthSky(phase)` grows into `hearthEnv({ mood?, phase?, hour?, wind?, intensity?,
  tier? })` setting a full override state (session-only, like today's override). Golden-image
  diffs on the ~30 highest-traffic combos; the rest smoke-render for absence of errors.
  Unit tests: mood resolver table, damper maths, tier controller notch logic.

---

## 11. Implementation roadmap

> **Status (2026-07-28):** W1, W2 and W4 are implemented and live; W5's no-art
> scope (live medallion, mood captions, QA scrubber) is in. **W3 + all art-
> gated work is deliberately deferred to the art session** — and note the art
> plan has grown: the v3 island plate will be **larger than the current map**,
> making room for the quarry and a new **animal shelter** building (both also
> entering the story), so §2.2's geography freeze is superseded by a planned
> layout migration (`town-layout.ts` anchors + collision tests + story content).

| Phase | Scope | Success criterion |
|---|---|---|
| **W1 — Environment core** | EnvironmentState v2, mood resolver + hysteresis, damper, `hearthEnv` scrubber, tests. No visual change | All moods resolvable + damped in tests; scrubber drives existing pipeline |
| **W2 — Compositor MVP** | WebGL2 compositor over *existing* art: grade LUT, sky gradient, cloud shadows, emissive+bloom from P0 derived masks, god rays. Tier probe + fallback | *Light visibly moves across the island and windows warm one-by-one at dusk.* Tier C pixel-identical to today |
| **W3 — Art wave 1** | Sky strip, island plate v3, depth mask, 3 hero buildings + masks, sun-key ×3, via ComfyUI pipeline doc | The island reads as the portrait style; fog-by-depth works; recipe documented and repeatable |
| **W4 — Weather + audio** | Hero states (§5) on GPU particles, transition engine wired end-to-end, audio v2 stems + mood mixes, Interpret/Sanctuary modes | Rain arrives over 12 s with matching sound; storm demo lands "safe drama"; a stranger identifies the weather with the HUD hidden |
| **W5 — Full catalogue + living village** | Remaining buildings v3, material overlays, particle atlas 2, behaviour tables, live medallion, QA matrix | Full mood × phase matrix green; Lighthouse ≥ 90; the golden-hour clip makes strangers say "oh, that's lovely" |

Each phase lands green (`tsc` + tests + build) and is independently shippable; art-gated
features ship dormant behind `artUrl()`.

---

# PART B — NOTED FOR LATER (scoped, not specified)

**B1. Real-World Resonance system.** The full consent-based personal layer from the resonance
doc: `PlayerRhythmState` (energy/restfulness/consistency from HealthKit/Health Connect),
personal-baseline learning (never population targets), world memory & anniversaries ("it was
raining the evening you repaired the lighthouse"), calendar `DayShape` (busy/free only),
manual emotional check-ins, and the "What Hearth Notices" privacy dashboard. Deserves its own
spec cycle — it is a privacy/product design problem more than a rendering one. **Five locked
principles carry forward:** reflect never judge · personal baseline over universal targets ·
granular consent · reality informs, player directs · reward living, not grinding.

**B2. "Look outside" moments.** Rare, optional prompts at real sunset/moonrise/rain-arrival
("The moon is over Emberhollow — and perhaps where you are too"). Needs notification design +
rarity tuning; rewards narrative, never currency.

**B3. Standalone weather card.** The "enchanted window" showpiece (frosted glass, droplet
refraction, parallax) from the resonance doc — once the shared compositor exists it is a
weekend build reusing the same environment state, and the natural source of the roadmap's
"10-second clip" marketing asset.

**B4. Seasonal events & hemisphere-true ecology.** Solstice/equinox lantern nights, meteor
showers, Brisbane-style humid-summer cicadas + afternoon storms translated into Emberhollow's
fictional ecology. `seasonForMonth` already hemisphere-aware.

**B5. Long-tail atmospherics.** Heat haze (screen-space shimmer, hot clear days), hail (brief,
dramatic, rare), pollen/air-quality (clear-air nights → stronger stars), tide state, aurora
(high-latitude players, `art_aurora_strip`), shooting stars (clear nights, Nimbus-style
detach-and-streak).

**B6. Recorded-audio upgrade path.** Per-mood ambience loops replacing procedural stems if
quality caps out; crossfade architecture already mood-keyed so it's a drop-in.

---

## Appendix — research notes distilled

- **Nimbus Weather Card** (canvas/SVG/CSS, no WebGL): 7-zone elevation sky gradients, ~3-min
  background cross-fades, procedural cloud variation in shape/timing/opacity/spacing,
  wind-skewed rain, 3-layer sine snow, feathered fog veils, branching lightning, glass
  droplets, continuous moon terminator. Proof that layered discipline beats raw tech; we adopt
  its gradient zoning, its patience (long crossfades), and its layer independence.
- **Animal Crossing:** real-clock loyalty — the game trusts the player's actual day; hourly
  music changes create time-anchored memory. → our phase-weighted stems + bell.
- **Dreamlight Valley / Palia / Infinity Nikki:** biome-tinted weather; Palia's soft
  golden-hour bloom; Nikki's premium sky gradients on mobile budgets. → grade-LUT-first
  approach.
- **Ghost of Tsushima / RDR2:** wind as an emotional actor, not a stat; weather fronts arrive
  visibly (you *see* rain coming across the water — our far-band rain-fade does this). →
  wind-as-modifier design, arrival choreography.
- **Zelda (BotW/TotK):** weather changes gameplay *texture* without punishing; distant
  visibility as drama. → depth-mask fog investment.
- **Flight Simulator / Apple Weather:** live-data trust + restraint — data renders beautifully
  but never gimmicky. → the "weather is an input, not a timeline" rule.
- **Colour psychology:** warm-amber ≈ safety/nostalgia (our emissive-vs-rain contrast); low
  contrast ≈ calm (overcast design); high-frequency motion ≈ energy (bright-day sparkle);
  desaturation + softness ≈ mystery (mist). The mood matrix (§1.3) encodes these directly.
