# Animation art spec — waves & atmosphere

Generation spec for the map's water and effect art. Every call site is **art-gated**: if the
PNG isn't present the engine falls back to its procedural look, so assets can land one at a
time, in any order, with no code changes.

**There are two kinds of asset here, and they have very different rules:**

| | What it is | Rules |
|---|---|---|
| **The sea** — `fx_sea_tile` | ONE still square painting of water. No frames, no alpha, no loop. The engine tiles and scrolls it. | **§5a** — short and forgiving. **Start here.** |
| **Effects** — flames, foam wash, lanterns | Animated sprite strips (N frames in a row). | §0–§3 — strict. |

If you only make one thing, make `fx_sea_tile` (§5a): it's the one that changes how the game
looks, and it's by far the easiest to produce.

---

## 0. READ THIS FIRST — the five rules that get broken

**These apply to the animated STRIP assets (§5c).** The sea tile in §5a is a still image and
is exempt from the alpha/frames/loop rules — but rules 1 and 2 (no furniture, top-down) apply
to *everything*.

These are in order of how badly they break the asset. A strip that fails any of them is
unusable.

1. **Output the ASSET, not a picture OF the asset.** No title text, no frame numbers, no
   labels, no captions, no borders, no drop-shadows, no contact sheet, no "spec card"
   layout, no multiple variants stacked in one file. The PNG must contain *only* the frames,
   edge to edge. If it looks like a slide, it's wrong.
2. **Top-down aerial view. No horizon, no sky, no side-on view.** See §1 — this is the one
   that silently ruins otherwise-good art.
3. **Real alpha channel — do NOT draw a checkerboard.** Save as RGBA PNG with genuinely
   empty pixels. A grey/white checker pattern *painted into the image* is *not*
   transparency; neither is a white or black fill. If in doubt, the background pixels must
   have alpha = 0.
4. **Frames must butt directly against each other — no gaps, no separators, equal widths.**
   Every frame exactly the same size, tiled edge to edge, with no margin around the strip.
   Total width must equal `frames × frameWidth` precisely.
5. **It must loop.** Frame N flows back into frame 1 with no jump. See §3.

> **Failures so far** (so they aren't repeated):
>
> - *Attempt 1* — a 1774×887 RGB **presentation sheet**: title, frame-number labels, two
>   strip rows, black background, and **side-on seascape** waves with a horizon. All five
>   rules broken.
> - *Attempt 2 (`WaveTest`)* — camera angle **fixed** (proper top-down water, good palette
>   and style), but still 1774×887 RGB with: a **painted checkerboard** standing in for
>   transparency, frame-number labels, **2–3px gaps** between frames, **unequal** frame
>   widths (163–175px), large empty margins, and a **loop jump** (frame 10→1 differed
>   twice as much as the average step).
>
> The lesson: the *painting* is fine. It's the **packaging** that keeps failing — alpha,
> exact geometry, no furniture, closed loop.

---

## 1. Camera / viewing angle — the critical one

The map is a **top-down isometric island seen from above**. The sea is a *surface* viewed
from the air.

**Correct** — the water as seen looking down at it:
- Long, low swell lines drifting across a flat water surface
- Foam and crests seen from above, as bright streaks lying *on* the surface
- No vanishing point, no horizon line, no sky, no distance haze
- The frame reads like an aerial photograph of open ocean

**Wrong** — anything with a viewpoint standing in or beside the water:
- A wave face rising toward the viewer / a barrel or breaker seen side-on
- A horizon line, sky, clouds, sun, or anything above the waterline
- A beach seen from the shore, or a seascape "view"
- Perspective depth (waves getting smaller toward a horizon)

If you can tell which way is "up" in the world from the image, it's the wrong angle. These
composite **over** a painted sea; a side-on wave will look like a wall of water standing up
off the map.

---

## 2. The strip contract

One PNG per asset, containing N equal-width frames laid out left → right.

- Frame width = `imageWidth / N`, so **total width must be exactly `N × frameWidth`**.
- Full height in every frame; height = `frameHeight` exactly.
- **No padding, gutters, separators, or trailing blank frame** — a blank frame shows as a
  visible stutter.
- **Transparent (RGBA).** Edges must fade to full alpha 0 — these sit over painted art, so a
  hard rectangular edge reads as a pasted box.
- No baked shadows, no background fill, no vignette.

Reference implementation: `drawStrip()` in `src/ui/map-view.ts`; `playStrip()` in
`src/ui/sprite-strip.ts`. Existing strips that follow this correctly and are good visual
references: `public/art/fx_flame_lantern.png`, `fx_flame_forge.png`, `fx_flame_fireplace.png`.

---

## 3. Making it actually loop

The most common failure is drawing N *independent illustrations* of a wave. That doesn't
loop — the shape jumps on every cycle.

Think of one continuous motion sampled N times:

- **Keep the silhouette in the same place.** Only the surface detail advances between frames.
  The overall shape, mass and position must not drift, rescale, or re-compose.
- **Advance by exactly one full cycle across the whole strip**, so frame N + 1 step = frame 1.
  For a drifting swell that means the pattern shifts by exactly `frameWidth / N` per frame, or
  the wave phase advances by exactly `360° / N` per frame.
- Test it: play frames 1→N→1 in a loop. Any pop, jump, or "restart" feeling means it fails.

---

## 4. Palette

Pull colours from the painted island so effects sit *in* the world rather than on top of it.

| Use | Hex |
|-----|-----|
| Sea, mid | `#2e9cc3` |
| Sea, deep | `#1c5f9e` |
| Foam / spray (warm white — **not** pure white) | `#f4efe2` |
| Night water | `#1a2a4e` |
| Moonlight silver | `#96b2e0` |
| Ember / hearth warm | `#ffc474` → `#f4a63b` |

Style: painted storybook, soft edges, gentle warm outlines — matching
`public/art/map_island_plate*.png`. Not flat vector, not photoreal, not pixel-art dithering.

**Night assets** (`fx_sea_tile_night`, `fx_flame_hearth`) must be painted already-dim — the
renderer adds glow on top, so pre-brightened art blows out.

---

## 5. The assets

Deliver each to `public/art/<id>.png`.

### 5a. The open water — ONE still tile, no animation

**This is the important one, and it is much easier than it sounds.** The sea is a *scrolling
texture*, not a frame-by-frame animation: the engine tiles one image across the water and
drifts it, with a second slower layer behind for parallax. Motion, speed and direction come
from the weather at runtime.

That means, for the water, you do **not** need:
- ❌ frames, a sprite sheet, or a loop (scrolling can't jump — it loops by construction)
- ❌ an alpha channel or transparency (the engine controls the blend — **opaque is correct**)
- ❌ exact pixel dimensions (any large square works; it gets resized)
- ❌ perfect seamless edges (`tools/make_sea_tile.py` guarantees the wrap — see §5b)

What you **do** need is just: **one square painting of open water seen from directly above.**

| id | image | content |
|----|-------|---------|
| `fx_sea_tile` | one square PNG, **1024×1024** ideal (512 min), opaque | Open ocean surface from straight above — long low swells with soft warm-white foam crests. The main water layer. |
| `fx_sea_tile_b` *(optional)* | same, 1024×1024 | A calmer, darker, foam-light version for the slow parallax layer beneath. Nice to have, not required. |
| `fx_sea_tile_night` *(optional)* | same, 1024×1024 | Same water painted for night — deep navy with sparse silver glints. Otherwise the engine just tints the day tile. |

Rules that still apply: **top-down only** (§1 — no horizon, no wave faces), **no text, labels,
frame numbers, borders, grid lines or margins** — one continuous painting, edge to edge. Fill
the whole square with water.

### 5b. Make it tile (one command)

Don't fight for seamless edges — the tool does it:

```bash
python tools/make_sea_tile.py "path/to/your-water.png" public/art/fx_sea_tile.png --size 512
```

It auto-finds the painted region (ignoring any label furniture), takes a centre square,
cross-blends the wrap so opposite edges continue, writes the tile, and drops a
`*_tiled_proof.png` beside it showing a 3×2 repeat so you can eyeball for seams. If a seam
survives, re-run with `--blend 0.4`.

### 5c. The remaining effect assets (still sprite strips)

These are small overlays and still use the frame-strip contract in §2.

| id | frames | frame px | **total px** | content |
|----|--------|----------|--------------|---------|
| `fx_wave_foam_wash` | 10 | 192 × 56 | **1920 × 56** | Foam washing up a shoreline waterline then retreating; lacy edge, transparent behind. |
| `fx_wave_lap` | 8 | 128 × 40 | **1024 × 40** | Small lapping wavelet + foam collar, sized to ring pier stilts and rock bases. |
| `fx_wave_cap` | 6 | 64 × 32 | **384 × 32** | One whitecap breaking and dissolving to nothing. |
| `fx_flame_hearth` | 7 | 48 × 64 | **336 × 64** | Low warm hearth fire through a doorway; ember tones, lazy flicker. Side-on is correct *for flames*. |
| `fx_lantern_string` | 7 | 96 × 32 | **672 × 32** | 3–4 small hanging lanterns on a string, swaying gently, lit warm. |

> `fx_wave_swell_a` / `_swell_b` / `fx_moon_shimmer` are **retired** as sprite strips — the
> scrolling `fx_sea_tile` above replaces them, and it's both easier to produce and better
> looking. Three attempts at a clean 10-frame water cycle failed on packaging and loop
> closure; a scrolling tile sidesteps both problems entirely.

If you produce a different frame count than listed, that's fine — **tell me the number** and
I'll wire it (`drawStrip` takes the count as a parameter). Everything else must match exactly.

---

## 6. Copy-paste prompts

Each prompt is self-contained. Paste it as-is; don't summarise it.

**`fx_sea_tile`** — the main one. A single still image; no frames, no animation, no transparency.
> A single square painting of open ocean water, 1024×1024 pixels, filling the entire square edge to edge. TOP-DOWN AERIAL VIEW looking straight down at the water surface — absolutely no horizon, no sky, no shoreline, no boats, no land, no side view, no perspective, no wave faces. It should look like an aerial photograph of the open sea, painted in a warm storybook illustration style with soft edges. Long low swell lines with soft warm-white foam crests lying flat on the surface. Sea colours teal #2e9cc3 through deep blue #1c5f9e, foam warm-white #f4efe2. Even, natural distribution across the whole square — no single dominant feature, no vignette, no darkening at the edges. Output ONE continuous painting only: no text, no title, no labels, no frame numbers, no grid, no panels, no borders, no margin, no checkerboard. Opaque is correct — do not add transparency.

**`fx_sea_tile_b`** *(optional — the slow parallax layer)*
> A single square painting of calm open ocean water, 1024×1024 pixels, filling the entire square. TOP-DOWN AERIAL VIEW looking straight down — no horizon, no sky, no land, no side view. Calmer and darker than open swell: gentle ripples, very little foam, deep blue #1c5f9e with soft teal #2e9cc3 variation. Painted storybook style, soft edges, even across the whole square, no vignette. ONE continuous painting only: no text, no labels, no frame numbers, no grid, no borders, no margin. Opaque, no transparency.

**`fx_sea_tile_night`** *(optional)*
> A single square painting of open ocean water at night, 1024×1024 pixels, filling the entire square. TOP-DOWN AERIAL VIEW looking straight down — no horizon, no sky, no moon, no land. Dark navy water #1a2a4e with sparse broken silver #96b2e0 glints scattered on the surface. Painted storybook style, subtle and already dim — do not over-brighten. Even across the square, no vignette. ONE continuous painting: no text, no labels, no grid, no borders, no margin. Opaque, no transparency.

**`fx_wave_foam_wash`**
> A single seamless looping sprite-strip image, 10 frames side by side horizontally in ONE image. Each frame exactly 192×56 pixels, total exactly 1920×56 pixels. Transparent background, PNG with alpha. TOP-DOWN AERIAL VIEW looking straight down at a shoreline waterline — no horizon, no sky. A tongue of white foam washes up across the frame over frames 1–5 and retreats over frames 6–10, with a lacy broken leading edge. Fully transparent behind and around the foam. Warm-white foam #f4efe2 over shallow teal water #2e9cc3. Frame 10 returns to the frame 1 state for a seamless loop. Output ONLY the raw frames — no text, no numbers, no labels, no borders, no background.

**`fx_wave_lap`**
> A single seamless looping sprite-strip image, 8 frames side by side horizontally in ONE image. Each frame exactly 128×40 pixels, total exactly 1024×40 pixels. Transparent background, PNG with alpha. TOP-DOWN AERIAL VIEW of a small wavelet lapping, seen from directly above — no horizon, no side view. A small ring/collar of soft foam pulses gently outward and settles, as water lapping around a pier post. Warm-white foam #f4efe2, water teal #2e9cc3, fading to full transparency at the edges. Frame 8 loops seamlessly back to frame 1. Output ONLY the raw frames — no text, no labels, no borders, no background.

**`fx_wave_cap`**
> A single seamless looping sprite-strip image, 6 frames side by side horizontally in ONE image. Each frame exactly 64×32 pixels, total exactly 384×32 pixels. Transparent background, PNG with alpha. TOP-DOWN AERIAL VIEW of a single small whitecap on open water, seen from straight above — no horizon, no side view. It appears, breaks into scattered foam, and dissolves to nothing across the 6 frames, so it loops cleanly. Warm-white foam #f4efe2 on deep blue #1c5f9e, edges fading to transparent. Output ONLY the raw frames — no text, no labels, no borders, no background.

**`fx_flame_hearth`**
> A single seamless looping sprite-strip image, 7 frames side by side horizontally in ONE image. Each frame exactly 48×64 pixels, total exactly 336×64 pixels. Transparent background, PNG with alpha. A low warm hearth fire glowing as if seen through a cottage doorway, gentle lazy flicker, ember tones #ffc474 to #f4a63b. Painted storybook style. Keep the flame base in exactly the same position in every frame; only the flame detail moves. Frame 7 loops seamlessly to frame 1. Painted already-dim — do not over-brighten. Output ONLY the raw frames — no text, no labels, no borders, no background.

**`fx_lantern_string`**
> A single seamless looping sprite-strip image, 7 frames side by side horizontally in ONE image. Each frame exactly 96×32 pixels, total exactly 672×32 pixels. Transparent background, PNG with alpha. A string of 3–4 small hanging lanterns, lit warm amber #ffc474, swaying gently left and right. The string's anchor points stay fixed in every frame; only the sway moves. Painted storybook style. Frame 7 returns to the frame 1 pose for a seamless loop. Output ONLY the raw frames — no text, no labels, no borders, no background.


---

## 7. Check it before handing it over

A validator ships with the repo. Run it on each file:

```bash
python tools/check_anim_strip.py public/art/fx_wave_swell_a.png
```

It verifies: alpha channel present, background actually transparent, exact expected
dimensions, width divisible by the frame count, no blank frames, and it flags a likely
loop-jump (frame N vs frame 1 mismatch) and likely embedded text/labels. It prints
PASS/FAIL per rule.

Quick manual check if you'd rather eyeball it:
- Open the PNG on a **checkerboard/transparent** background — do you see through it?
- Is the image exactly the "total px" from the table?
- Does it contain any letters or numbers? (It must not.)
- Can you tell which way is "up" in the world? (For the wave assets, you must not.)

## 8. Dropping them in

```bash
# 1. save the PNGs to public/art/<id>.png
# 2. refresh the manifest from disk
python tools/import_map_v2.py --manifest-only
# 3. rebuild
pnpm build
```

`--manifest-only` just re-lists `public/art/*.png` into `src/art-manifest.ts`; it will not
re-slice or touch the building sheets. Each new id activates its call site automatically.

## 9. Already covered — do NOT generate art for these

These atmospherics are procedural and already running:

- Sea swells and shore shimmer (weather-driven, `drawSeaWaves` / `drawShoreShimmer`)
- Whitecaps in rough weather
- Fireflies over the meadow, chimney smoke
- Rain, snow, fog banks, storm flashes
- The lighthouse beacon sweep and lens flash
- Window jewels, lantern pools, hearth glows (these are *light*, not sprites)

The generated strips **upgrade** the first two from procedural lines to painted water; the
rest stay as they are.
