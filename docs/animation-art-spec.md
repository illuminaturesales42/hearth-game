# Animation art spec — waves & atmosphere

Generation spec for the animated sprite strips the map engine is already wired for.
Every call site is **art-gated**: if the PNG isn't present the engine falls back to its
procedural look, so these can land one at a time, in any order, with no code changes.

---

## 1. The strip contract (non-negotiable)

The engine animates a **horizontal sprite strip**: one PNG containing N equal-width frames
laid out left→right.

- **One PNG per asset.** Transparent background (RGBA).
- **N equal-width frames, side by side, full height.** Frame width = `imageWidth / N`, so the
  total width must be exactly `N × frameWidth`.
- **No padding, no gutters, no trailing blank frame.** A blank frame shows as a visible gap.
- **Seamless loop:** frame N must flow back into frame 1.
- **Keep the silhouette still.** Only the surface detail should move between frames — if the
  shape drifts or rescales, the loop pops. Draw the subject at the same position in every
  frame.
- **Edges fade to full transparency.** These composite over a painted plate; hard cut edges
  read as pasted rectangles.
- **No baked drop shadows or background colour.**

Reference implementation: `drawStrip()` in `src/ui/map-view.ts` and `playStrip()` in
`src/ui/sprite-strip.ts` (the DOM twin). Existing strips that already follow this and can be
used as visual reference: `public/art/fx_flame_lantern.png`, `fx_flame_forge.png`,
`fx_flame_fireplace.png` (all 7-frame).

## 2. Palette anchors

Pull colours from the painted island so the effects sit in the world rather than on top of it.

| Use | Hex |
|-----|-----|
| Sea, mid | `#2e9cc3` |
| Sea, deep | `#1c5f9e` |
| Foam / spray (warm white — **not** pure white) | `#f4efe2` |
| Night water | `#1a2a4e` |
| Moonlight silver | `#96b2e0` |
| Ember / hearth warm | `#ffc474` → `#f4a63b` |

Style: painted storybook, soft edges, gentle warm outlines — matching the island plates in
`public/art/map_island_plate*.png`. **Not** flat vector, not photoreal, no hard pixel-art
dithering.

## 3. Assets to generate

Deliver each to `public/art/<id>.png`.

### Waves

| id | frames | frame px | total px | content |
|----|--------|----------|----------|---------|
| `fx_wave_swell_a` | 8 | 256 × 64 | 2048 × 64 | One long, low rolling swell crest with a gentle highlight along its top. Must tile **left↔right** within each frame (the left and right edges join). |
| `fx_wave_swell_b` | 8 | 256 × 48 | 2048 × 48 | A smaller counter-swell, drawn behind `_a` at a different parallax speed. Same left↔right tileability, slightly darker/cooler. |
| `fx_wave_foam_wash` | 10 | 192 × 56 | 1920 × 56 | A foam tongue washing **up** a shore edge and retreating over the 10 frames. Lacy, broken leading edge; fully transparent below the wash line. |
| `fx_wave_lap` | 8 | 128 × 40 | 1024 × 40 | A small lapping wavelet with a foam collar — sized to ring pier stilts and rock bases. Gentle in/out pulse. |
| `fx_wave_cap` | 6 | 64 × 32 | 384 × 32 | A single whitecap breaking and dissolving to nothing. Used scattered during storms. |

### Atmosphere

| id | frames | frame px | total px | content |
|----|--------|----------|----------|---------|
| `fx_flame_hearth` | 7 | 48 × 64 | 336 × 64 | Low, warm hearth fire seen through a doorway/window — ember tones, slow lazy flicker. Matches the `fx_flame_*` family. |
| `fx_lantern_string` | 7 | 96 × 32 | 672 × 32 | 3–4 small hanging lanterns on a string, swaying gently, lit warm. For the market awning. |
| `fx_moon_shimmer` | 8 | 192 × 48 | 1536 × 48 | Broken silver moon-path glints on dark water. Subtle — carries its own dimness (the engine adds glow on top, so don't pre-brighten). |

**Night assets** (`fx_moon_shimmer`, `fx_flame_hearth`) should be painted already-dim. The
renderer re-emits light over the night grade; art that's pre-brightened blows out.

## 4. Dropping them in

```bash
# 1. save the PNGs to public/art/<id>.png
# 2. refresh the manifest from disk
python tools/import_map_v2.py --manifest-only
# 3. rebuild
pnpm build
```

`--manifest-only` just re-lists `public/art/*.png` into `src/art-manifest.ts`; it will not
re-slice or touch the building sheets. Each new id activates its call site automatically.

## 5. Already covered — no art needed

These atmospherics are procedural and already running; don't generate art for them:

- Sea swells and shore shimmer (weather-driven, `drawSeaWaves` / `drawShoreShimmer`)
- Whitecaps in rough weather
- Fireflies over the meadow, chimney smoke
- Rain, snow, fog banks, storm flashes
- The lighthouse beacon sweep and lens flash
- Window jewels, lantern pools, hearth glows (light, not sprites)

The generated strips **upgrade** the first two from procedural lines to painted water; the
rest stay as they are.
