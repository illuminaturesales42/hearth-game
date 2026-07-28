# Hearth Island v3 — ComfyUI prompt set

The painterly island revamp (Living Weather spec §2), style-locked to the
288-portrait catalogue. Sibling of `avatar-portrait-comfy-prompts.md`.

> **Status:** the island-plate driver is not written yet — building style is
> being dialled in first (`docs/comfy-style-dialin.md`), because the plate
> should be generated with the *winning* recipe rather than a guessed one.
> The briefs below are ready to run once that lands.

**Tooling to reuse:** `tools/comfy_dialin.py` (HTTP-API queue/upload/fetch
helpers, server-directory agnostic) and `tools/comfy_make_workflow.py`
(generates a loadable UI graph from the live `/object_info`).

---

## How the style is locked

The portraits' consistency came from a shared vocabulary + identical sampler
settings, not from a magic node. Scenes reuse **exactly** that:

| Setting | Value (identical to the portrait catalogue) |
|---|---|
| Checkpoint | `RealVisXL_V5.0.safetensors` |
| Sampler / scheduler | `dpmpp_2m` / `karras` |
| Steps / CFG | 32 / 7.0 |
| Shared style clause | *hand-painted digital illustration, soft painterly brushwork, visible brushstrokes, muted earthy old-seaside colour palette, driftwood brown cream sage muted teal rust, children's book illustration style* |

**No IPAdapter on scenes.** The only installed adapter is
`ip-adapter-plus-face_sdxl_vit-h` — face-trained, and it degrades badly on
landscapes. The shared prompt vocabulary + fixed sampler is the style lock.

### The one rule that matters most

Every base layer is prompted **`gentle even overcast daylight, soft diffuse
light, no strong shadows, no sunset, no golden hour`**.

The v3 plate and buildings must be *neutral-lit*, because time of day is now a
lighting operation performed by the WebGL compositor (spec §3). Baked-in
sunset light would fight the renderer at every hour of the day. This is the
single most important difference from the art currently on disk.

---

## Negative (locked, all scene jobs)

```
photorealistic, photograph, 3d render, cel shaded, anime, harsh outlines,
high saturation, neon, text, letters, watermark, signature, logo, frame,
border, ui, map legend, compass rose, modern buildings, cars, roads,
power lines, people close-up, crowd, blurry, low quality, jpeg artifacts,
tilt-shift, lens flare, dramatic sunset, golden hour, strong cast shadows,
harsh directional light, night, darkness
```

---

## Batch 1 — exploration (tonight)

The purpose is a **go/no-go on the style across three categories** before
committing render hours: does the portrait look survive on a landscape, on a
brand-new building, and on a rebuild of an existing one?

| Job | Renders | What it answers |
|---|---|---|
| `island_v3_wide` | 4 seeds @ 1216×832 | Does a wider island read well, with room for the quarry cliff + shelter pasture? |
| `island_v3_square` | 4 seeds @ 1024×1024 | Or is more area in both directions better? |
| `animal_shelter` | 3 seeds @ 1024×1024 | The brand-new story building |
| `quarry_v3` | 3 seeds @ 1024×1024 | An existing building, restyled |
| `bakery_v3` | 3 seeds @ 1024×1024 | Style-match control — compare directly against `town_bakery.png` |
| `sky_strip` | 2 seeds @ 832×1216 | The compositor's painted sky layer |

**~19 renders, roughly 15 minutes.**

### The island brief

Buildings are **separate sprites composited on top** — so the plate is
*terrain only*: island shape, water, paths, trees, and clear flat plots where
buildings will sit. Prompting a plate full of buildings produces geometry the
layout engine can't use.

The larger v3 island must open up two new areas (see
`hearth-map-v3-expansion`): a **rocky cliff shoulder** for the quarry and a
**fenced pasture / meadow** for the animal shelter.

---

## Selection criteria (tomorrow morning)

Judge candidates on, in order:

1. **Neutral light** — no baked sunset/shadow direction. Non-negotiable.
2. **Palette** — sits inside the art-bible swatches beside the portraits.
3. **Brushwork** — visible painterly strokes, not airbrushed or vector-flat.
4. **Plot legibility** — clear, flat, buildable ground for ~14 buildings plus
   the two new zones.
5. **Silhouette** — island reads at 360px wide (the real map viewport).

Once a plate wins: freeze it, derive `town-layout.ts` anchors from it, update
the collision test, and only then batch the remaining building sprites.

---

## After generating

1. Review in `output/island_v3/` — pick winners, discard the rest.
2. Winners → `public/art/<id>.png`, then regenerate the manifest with
   `python tools/import_map_v2.py`.
3. Building sprites need background keying: they render on plain cream, and
   `tools/slice_assets.py`'s `KEYED` edge-flood removal cuts them out.
   **Tileable textures (sky strip) must NOT go through `AUTOCROP`** — the
   alpha-bbox trim destroys edge-to-edge tiling.
4. Emissive masks are *derived*, not painted: render the building's lit-night
   variant, difference it against the neutral base, threshold + blur.
