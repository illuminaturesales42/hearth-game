# Hearth Buildings — ComfyUI worksheet (Canny-locked progression)

*Written 2026-07-26, revised same day after fixing two glitches found in the
first pass (a floating sign on L2, a garbled door on L3). Supersedes the
img2img approach described in `comfy-building-workflow.md` for the 5-state
progression.*

Ready-to-paste prompts for generating a building's five upgrade states
(ruin → under construction → level 1 → 2 → 3) so they read as **the same
building growing**, not five different buildings.

---

## §0 — Why this works (read once)

Every earlier attempt controlled structure with **img2img denoise**, which
cannot do the job: low enough to hold the building means too low to change
anything; high enough to change the state means the model reinvents windows,
rooflines and doors. That's what produced holes in finished roofs, L2 and L3
looking swapped, and general drift.

**This workflow doesn't use denoise for structure at all.** It runs full
txt2img (denoise 1.0) and pins the structure with a **Canny ControlNet** edge
map taken from the artist's real reference sheet cell. The reference sheets
already solve the hard problem — in `art-src/Map/Full Building Final/Forge.png`
the same forge genuinely grows across five states, with correct relative size
and correct roof integrity. Canny inherits all of that for free.

**Consequence for the prompts: the state clauses describe _material and
condition only_ — never size, layout, or completeness.** Those are the edge
map's job now. This is why the clauses in §4 are short and carry no `(…:1.3)`
weights: the old weighted comparatives ("visibly bigger than level 1", "fully
intact roof, no holes") existed only to fight problems that no longer exist,
and they interfered with each other.

### Generation order — this matters

**Level 1 is the identity anchor and must be generated first.** It has no
IPAdapter input; it is Canny + prompt + seed only, and it defines what the
building is made of. Once you're happy with it, its output becomes the
IPAdapter reference for the other four, which is what carries stone colour,
roof material and palette across the set.

1. **L1** — run `canny_progression_1_anchor.json`. Review. Re-roll the seed
   until you like the building itself.
2. Save that approved image into ComfyUI's `input/` folder as
   `blacksmith_identity_l1.png` (or your own name — just match node 14).
3. **ruin, wip, L2, L3** — run `canny_progression_2_state.json` four times,
   swapping three things per run (§3).

Running them out of order silently reproduces the old inconsistency.

---

## §1 — The style block (locked — do not reword)

This is the full positive string. Only **`{SUBJECT}`** changes; it gets
`<building clause from §5> -- <state clause from §4>`.

> game asset, warm hand-drawn storybook illustration, confident visible ink
> and pencil linework over soft painted colour, clearly hand-illustrated NOT a
> digital render, NOT photoreal, NOT a 3D game asset render, NOT CGI, gentle
> rim light, palette #EAD7B5 #C79A6B #8FBF8F #6A8CA7 #8E7CC3 #D46B6B #F4F0E6,
> 45-degree isometric view, **{SUBJECT}**, standing on its own small
> cobblestone plinth with a thin edge of moss and grass, (a plain uncluttered
> neutral grey backdrop, no ground plane beyond the plinth, no other
> buildings, no street, no sky, no scenery:1.3), (single subject, small and
> centred with an even ~10% empty margin on all four sides, not a close-up,
> not filling the frame, no part of the building touching the frame
> edge:1.35)

Source of truth: `tools/comfy_style_lock.py` → `POSITIVE_TEMPLATE`. If you
change it there, change it here too.

### §1b — Append these three clauses too (added after the first pass found glitches)

The first Canny run produced a floating sign on L2 and a garbled/mismatched
door on L3. Root causes and fixes, in order:

1. **Doors and signs need to be described, not just conditioned.** Canny only
   pins the *outline* it's given — and the reference cells are small (~250px)
   source art upscaled 3-4×, so fine detail like a door's actual construction
   is genuinely ambiguous in the edge map. The model was filling that
   ambiguity with mush. Fix: describe hardware explicitly.
2. **Physical plausibility isn't implied by "hand-drawn illustration."** Say
   it directly.
3. **Releasing the ControlNet too late (0.85) left no room for the model to
   resolve the ambiguous detail; releasing it too early (0.60) fixed the
   detail but broke the style** (regressed to the "photographed miniature on
   a table" failure mode from earlier this session — visible depth of field,
   a real background surface). **0.72 is the sweet spot** — see §3.

Append all three to the §1 template, after `{SUBJECT}`:

> (clearly defined wooden doors and windows with visible planks, iron hinges
> and simple frames, set squarely inside their stone openings:1.35), (structurally
> sound, every part properly joined and supported, signs and brackets firmly
> bolted, nothing floating or detached:1.3), (hand-drawn illustrated 2D game
> asset, flat isolated icon, NOT a photograph, NOT a physical object, NOT a
> miniature, NOT sitting on a real surface, no depth of field, no blur:1.4)

---

## §2 — Negative (locked)

```
flat vector, sterile, 3d render, cgi render, plastic, oversaturated,
photograph, product photography, studio photography, diorama, physical model,
miniature model, toy, real wood grain, real material, macro photography,
unreal engine, octane render, modern architecture, photoreal, hyperrealistic,
people, characters, extra structures, multiple buildings, village street,
town square, cropped, low quality, sky, clouds, background scenery, landscape,
checkerboard, gradient background, vignette, ground plane, grass field,
meadow, terrain, drop shadow, close-up, zoomed in, cut off, touching edge of
frame, filling the frame, off-centre, text, watermark, signature, flat
cel-shaded anime, manga
```

**Append (added after the first pass, see §1b):**

```
floating objects, levitating, detached, disconnected, unsupported, hovering
sign, broken geometry, warped, melted, impossible construction, misaligned
door, duplicated door, malformed opening, smeared detail, mushy shapes,
indistinct doorway, photograph, photo, wooden shelf, mantel, table surface,
indoor scene, blurry background, depth of field, bokeh, miniature, diorama,
model, figurine, ornament, tilt-shift
```

---

## §3 — Locked ComfyUI settings

Workflows: `tools/comfy_out/workflows/canny_progression_1_anchor.json` (L1)
and `canny_progression_2_state.json` (the other four). Open via
**Workflow → Open**, or drag onto the canvas.

| Knob | Value | Why |
|---|---|---|
| Checkpoint | `Juggernaut-XL_v9.safetensors` | follows stylised prompts far better than RealVisXL for architecture |
| Seed | **`777777` — identical for all five states** | same latent start ⇒ same material/colour imagination |
| CFG | 7.0 | validated setting |
| Sampler / scheduler | `dpmpp_2m` / `karras` | ditto |
| Denoise | **1.0** (txt2img, `EmptyLatentImage`) | structure is Canny's job, not denoise's |
| ControlNet model | `controlnet-canny-sdxl.safetensors` | the only SDXL structural ControlNet installed |
| ControlNet strength | **0.95** | high — honour the artist's structure (raised from 0.85, see §1b) |
| ControlNet start / end | 0.0 / **0.72** | **the load-bearing fix.** 0.85 left no room to resolve fine detail (garbled L3 door); 0.60 fixed detail but broke the style (looked like a photographed miniature). 0.72 is the point that got both right — see §6 if you need to re-tune it |
| Canny low / high / resolution | 100 / 200 / 1024 | starting point — see §6 |
| Steps | **40** (raised from 30) | extra room for the model to resolve detail once the ControlNet releases at 0.72 |
| IPAdapter weight | **0.5**, `weight_type: style transfer` | carries materials/palette without overriding structure |

**Per-run you change only three things** (state graph):

| Node | What to set |
|---|---|
| **2** `LoadImage` | the state's reference cell, e.g. `forge_ref_ruin.png` |
| **5** `CLIPTextEncode` (positive) | §1 template with the §4 + §5 clauses filled in |
| **8** `EmptyLatentImage` | width/height matching that cell (table below) |

Node **14** `LoadImage` stays on your approved L1 identity image for all four.

### Reference cells and their latent sizes

Pre-extracted into ComfyUI's `input/` folder and mirrored at
`tools/comfy_out/refcells_canny/`. **The latent must match the cell's aspect
or the edge map gets rescaled and the structure lock loosens.**

| State | Reference cell | Latent W×H |
|---|---|---|
| ruin | `forge_ref_ruin.png` | 1024 × 840 |
| wip | `forge_ref_wip.png` | 1024 × 832 |
| l1 | `forge_ref_l1.png` | 1024 × 848 |
| l2 | `forge_ref_l2.png` | 1024 × 808 |
| l3 | `forge_ref_l3.png` | 1024 × 792 |

To make cells for a different building, crop the **midday row** of its sheet
in `art-src/Map/Full Building Final/`, composite onto white, pad by 35%, and
resize so the long edge is 1024 on an /8 grid. The grid detection that finds
the cells is `import_map_v2.sprite_grid()` + `key_bg()` — the same code the
production importer uses.

---

## §4 — The five state clauses

Condition and material only. No size language, no weights — the edge map
already carries size, layout and roof integrity.

| State | Output suffix | Clause to paste |
|---|---|---|
| **ruin** | `_ruin` | derelict and long abandoned, crumbling bare stone, weathered and mossy, weeds growing through the rubble, empty dark openings with no glass |
| **wip** | `_wip` | under active reconstruction, fresh pale new-cut timber scaffolding and ladders, raw unfinished stonework, building materials stacked about |
| **l1** | *(none)* | newly rebuilt, clean plain honest stonework, simple sound roof, one window warmly lit, modest and bare but cared for |
| **l2** | `_l2` | established and well kept, flower boxes and a tidy garden, several windows warmly lit, chimney smoke, lived-in and welcoming |
| **l3** | `_l3` | grand and prosperous, richly finished with fine detailing, festival bunting along the eaves, every window glowing warm, immaculate and thriving |

Naming note: level 1 is the **bare** id (`town_blacksmith.png`), matching
`import_map_v2.STATE_SUFFIX` and what the engine's `artUrl()` expects.

---

## §5 — The 17 building clauses

Paste one of these as the first half of `{SUBJECT}`, then ` -- ` then the §4
state clause.

| Building id | Clause |
|---|---|
| `town_cottage` | a small weathered stone-and-timber cottage with a thatched roof, ivy climbing the walls, a modest cottage garden, one chimney |
| `town_bakery` | a timber-framed village bakery with a round stone oven chimney, warm glowing shop windows, a hanging wooden bread sign, flour sacks by the door |
| `prop_well` | a small round stone well with a peaked wooden shingle roof and a wooden bucket-winch, a cobbled surround, moss on the stones |
| `town_market` | an open-air village market square with striped canvas stall awnings, wooden crates and baskets of produce, cobblestone ground |
| `town_garden` | a white-framed glass greenhouse conservatory with climbing vines and flowerbeds, glass panels catching the light |
| `town_townhall` | a small stone village hall with a modest bell tower and arched doorway, a wooden notice board at its steps |
| `town_postoffice` | a tidy timber postmistress's cottage with a painted wooden sign, a red post box, flower window boxes |
| `town_workshop` | a carpenter's workshop with a sawtooth timber roof, stacked lumber outside, tools hanging by the open door |
| `town_farm` | a timber barn with a hayloft door and a small attached farmhouse, a fenced paddock, a few haystacks |
| `town_fisherhut` | a weathered fisherman's hut on wooden stilts over shallow water, fishing nets drying on racks, a small attached dock |
| `town_sawmill` | a timber sawmill with a wooden waterwheel on its side, stacked cut logs, sawdust scattered about |
| `town_blacksmith` | a stone forge with a tall chimney, a glowing warm light from the furnace opening, an anvil and tools just outside the door |
| `town_dock` | a long wooden jetty running out over the bay on pilings, mooring posts with coiled rope, a small lantern post |
| `town_library` | a small stone library building with tall arched leaded-glass windows, ivy on the stone, a cosy reading-nook window |
| `town_quarry` | a stone quarry cut into rock with a tall wooden crane and hoist, cut stone blocks, a small stone-cutter's shelter |
| `town_tailor` | a cosy timber tailor's cottage with bolts of coloured fabric visible in the window, a hanging tailor's sign with scissors, spools of thread on the sill |
| `prop_lighthouse` | a tall round stone lighthouse on a rocky point, a glass lantern room at the top with a gallery rail, a spiral of windows down the tower |

**`town_tailor` has no reference sheet** — it's the one building with no art in
`art-src/Map/Full Building Final/`. Borrow another building's cells as a
structural donor (Forge works) and accept that its silhouette will echo the
donor, or hand-author cells for it.

Sheet → building mapping is by filename via `import_map_v2.match_building()`,
so `Forge.png` → `town_blacksmith`, `Gardens.png` → `town_garden`,
`Old cottage.png` → `town_cottage`, `MeadowFarm.png` → `town_farm`, etc.
`LibraryA/B` and `lighthouseA/B` are split sheets — the **A** file carries the
midday row you want.

---

## §6 — Tuning guide

| Symptom | Fix |
|---|---|
| Output looks traced / stiff / like a recoloured copy of the reference | Lower ControlNet **strength** to 0.6–0.7, and/or drop **end_percent** to 0.7 |
| Structure drifting from the reference again | Raise strength toward 1.0, raise **end_percent** to 0.95, confirm the latent W×H matches the cell |
| Style not landing (too rendered/photoreal) | Lower **end_percent** — the last steps are where style settles. Also confirm the checkpoint is Juggernaut, not RealVis |
| Fine detail lost (window mullions, roof tiles) | Lower Canny **low_threshold** to ~50 so weaker edges register |
| Edge map too noisy, output cluttered | Raise Canny thresholds to ~150/250 |
| States don't share materials/colour | Confirm **seed is identical** across all five, and that node 14 points at the approved L1 for all four non-anchor runs. Raise IPAdapter weight to 0.65 |
| Building identity overridden / faces appearing | Lower IPAdapter weight to ~0.35, or bypass the IPAdapter branch entirely (see below) |

**IPAdapter caveat, stated honestly:** the only adapter installed is
`ip-adapter-plus-face_sdxl_vit-h` — a *face*-specialised model. It does work
for general material/palette carry, but it is not the right tool for
architecture and it is the weakest link here. **To bypass it:** in the state
graph, repoint node 9 (`KSampler`) `model` from `["15", 0]` back to
`["1", 0]`. You then rely on Canny + fixed seed alone, which is still a far
stronger consistency guarantee than anything the img2img pipeline had.

---

## §7 — After generating

1. **Background removal — mandatory, don't skip it.** Raw outputs land on a
   plain grey backdrop, not alpha — that grey is fine to see mid-generation
   but must never ship. Run every file through the existing rembg step:
   `remove_bg_and_crop()` in `tools/comfy_dropin_test.py` (real U²-Net
   segmentation, not colour-keying — colour-keying was tried earlier this
   session and rejected, it bled into the model's own material choices).
   Autocrops to content with 6px pad, downscales to 320px long edge to match
   the shipped assets' scale. **Verify it actually worked** before moving on —
   don't just eyeball it, check the alpha channel is genuinely 0 at the image
   corners:
   ```python
   from PIL import Image
   import numpy as np
   a = np.asarray(Image.open("your_file.png").convert("RGBA"))
   assert a[0,0,3] == 0 and a[-1,-1,3] == 0, "background not transparent"
   ```
2. **Name them** to the engine's convention —
   `<building_id><state_suffix>.png`, e.g. `town_blacksmith.png` (L1),
   `town_blacksmith_ruin.png`, `_wip`, `_l2`, `_l3`.
3. **Drop into** `F:/Mastermind launch/hearth/public/art/`.
4. **Regenerate the manifest** so `artUrl()` resolves the new ids:
   `python tools/import_map_v2.py --manifest-only`
5. **Check against `docs/asset-generation-brief.md`'s hard rules** — transparent
   background, single subject centred, ~6–8% padding, no text or watermark,
   reads clearly at 64px.
6. **Review the progression as one row**, ruin → wip → L1 → L2 → L3, and check
   specifically:
   - L1 and L3 roofs are unbroken (no hole, no fire glow through the roof)
   - L3 is clearly the grandest, L2 sits between L1 and L3
   - same stone, same door, same chimney placement across all five

   Build the review sheet as a **single row** at ≤260px cells. Tall multi-row
   contact sheets have repeatedly failed to render their lower rows in
   preview, which reads as "the images are blank" when the files are fine.

### Time-of-day variants

Not covered here, and mostly **not needed**: `src/ui/map-view.ts` already
applies a real runtime colour grade over the town (`applyTimeLight()` /
`gradeLand()`, real canvas composite ops keyed to sun position) *after* the
buildings are drawn, so dawn/midday/dusk mood comes for free from one base
image — with perfect consistency, since it's the same pixels. The only thing
the grade can't invent is new light sources, so a `_night` variant with lit
windows is the one genuinely worth generating. See
`docs/comfy-building-workflow.md`.
