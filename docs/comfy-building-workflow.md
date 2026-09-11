# ComfyUI Building & Map Generation Workflow

> **⚠ Partly superseded (2026-07-26).** For generating a building's **five
> upgrade states**, use **[`comfy-building-worksheet.md`](./comfy-building-worksheet.md)**
> instead — it uses a Canny ControlNet to pin structure to the real reference
> sheet, which fixed the consistency problems the img2img approach below could
> not (states drifting apart, holes appearing in finished roofs, L2/L3 reading
> as swapped).
>
> Also stale below: the driver is now `comfy_generate_buildings.py` (not
> `comfy_buildings.py`); background removal via rembg **is** wired; the scope
> is 170 images (not 344) because `src/ui/map-view.ts` already colour-grades
> buildings at runtime for time of day. Still accurate and worth reading: the
> checkpoint rationale, the prompt-tuning dead-ends, and the matrix-sheet format.

How the town's art (the island map + every building) is generated with
ComfyUI. Style is grounded in Hearth's own **existing, authoritative art
docs** — `docs/art-bible.md` and `docs/time-of-day-art-assets.md`, both of
which call their style block "the law" — not invented fresh. Read those two
first if you're touching the prompt language below.

**Driver script:** `tools/comfy_buildings.py`
**Requires:** ComfyUI running locally at `http://127.0.0.1:8188`, run under its own venv.

```bash
cd "F:/Mastermind launch/hearth"
"F:/sandbox/sulphur-2/ComfyUI/venv/Scripts/python.exe" tools/comfy_buildings.py <command>
```

---

## The technique

**Checkpoint: Juggernaut-XL_v9**, not RealVisXL_V5 (which the avatar-portrait
catalogue used). RealVisXL is a photorealism-biased checkpoint — fine for
character portraits, but for architecture it kept defaulting to "photograph
of a physical craft diorama" regardless of illustration-forcing prompt
language (confirmed by a live test render). Juggernaut-XL follows a stylised/
painterly prompt far more reliably for non-portrait subjects.

**Style + palette:** lifted verbatim from `docs/art-bible.md` §1 and
`docs/time-of-day-art-assets.md`'s "STYLE BLOCK — prepend to every prompt"
(both docs call it "the law"): hand-painted warm storybook illustration, soft
painterly brushwork, gentle rim light, cosy golden-hour warmth, the locked
palette (`#EAD7B5 #C79A6B #8FBF8F #6A8CA7 #8E7CC3 #D46B6B #F4F0E6`), 45°
isometric framing. The negative prompt starts from art-bible.md §1's verbatim
universal negative, extended with terms learned the hard way (below).

**Reference image:** IPAdapter (`ip-adapter-plus-face_sdxl_vit-h`, "style
transfer" mode) referencing `char_bran_bust_ref.png` — the same reference the
avatar-portrait catalogue was itself style-transferred from, per art-bible.md
§1's "generate one hero reference, then IPAdapter + fixed style prompt to
keep every sibling on-model."

**Structural consistency across time of day:** a building must be *the same
building* across dawn/midday/dusk/night, just lit differently — confirmed as
the right approach by time-of-day-art-assets.md's own pipeline note ("use the
day asset as an img2img/ControlNet base at low denoise so geometry stays
pixel-aligned"). Independent text-to-image generation per phase was tried
first and rejected: SDXL doesn't reliably reproduce identical structure across
separate generations. Instead, each **(building, state)** generates ONE full
text-to-image **base** at `midday` (denoise 1.0), then the other three phases
are an **img2img "relight" pass** at **denoise 0.42** — low enough to hold
structure, high enough to genuinely repaint the light. Directional lighting
per phase matches the plates' own spec: dawn = rose-gold from the east,
midday = amber-gold from the upper-left, dusk = amber from the west, night =
cool silver-blue from the upper-right with warm glowing windows.

---

## The prompt-tuning story (read this before changing the prompt)

Five iterations to get a working prompt — recorded so nobody re-walks the
same dead ends:

1. **"Isometric miniature diorama... sitting on a plot base"** → the model
   read this as literal instructions to *photograph a physical craft/dollhouse
   model*. Result: a photo-studio product shot, not a painting. The word
   "diorama" (and "miniature", "model") are physical-object words — never use
   them in a 2D-illustration prompt.
2. **Bold cartoon ink outlines** ("vintage cartoon illustration... bold clean
   outlines") → overcorrected. `docs/art-bible.md` explicitly says **NOT
   cel-shaded** — the real target is soft painterly brushwork, not comic
   linework.
3. **Front-loaded, weight-emphasised state clause** (`(storm-wrecked ruin
   ...:1.35)`) fixed a real problem: state description buried after a long
   style preamble was getting drowned out by the surrounding warm/cosy
   language — a "complete storm-wrecked ruin" prompt was producing a pristine,
   tidy cottage. But weighting state alone, with the style clause at implicit
   weight 1.0, wasn't a fair fight — it overshot into a **real drone/insurance
   photo of storm damage**. The model's "storm damage" training association is
   heavily photo-dominated.
4. **Weight the illustration-style anchor as hard as the state content**, both
   in the same leading emphasis group — `(state:1.2), (hand-painted
   storybook illustration... NOT a photograph:1.3)`. This is what actually
   worked: painterly style AND legible ruin content together. But it produced
   a full illustrated **scene** (sky, clouds, background trees) instead of an
   isolated game-sprite icon.
5. **Add explicit "game asset icon, isolated single building... no sky, no
   clouds, no background scenery" framing**, both positive and negative. This
   is the version in the script now — validated on `town_bakery_ruin_midday`:
   painterly, clearly storm-damaged, isolated on a plain background with a
   small grounded plot, no scene clutter.

**Net lesson:** state/content weight and style weight must be balanced in the
*same* emphasis tier, or one wins by default and the other reads as absent.

6. **L3 ("flourishing") broke isolation** even with takes 1-5 otherwise
   solid: "richly finished... pride of the village" pulled the model toward a
   full street scene (a second building/terrace visible alongside the hero
   building), inconsistent with the plot-isolated framing of the other 4
   states. Two fixes together: (a) reworded the `l3` state text itself to say
   "a **single** flourishing building... banners along **its own** eaves
   only... no crowd, no other buildings, no wide street scene" instead of the
   more ambiguous "the pride of the village" alone; (b) weight-emphasised the
   isolation clause in `COMPOSITION` itself
   (`(isolated single building... no other buildings in frame, no street, no
   neighbours:1.25)`) rather than leaving it unweighted — same root lesson as
   #4, extended to the framing/composition clause, not just style/state.
   Also extended `NEGATIVE` with explicit street/terrace/row-house/town-square
   terms. Confirmed fixed on a `town_bakery_l3` regeneration.

---

## Known open issues (as of the town_bakery preview)

- A small text/signature-like mark occasionally appears in a corner despite
  the negative prompt listing `text, watermark, signature` — rare, worth a
  reroll (different seed) rather than a prompt fix if it recurs.
- Palette drifts warmer/cooler than the exact locked hex family depending on
  the subject — acceptable for now, worth a dedicated palette-lock pass
  (e.g. a colour-grade post-process) if it matters once more buildings are
  reviewed side by side.
- Background removal (transparent PNG, per art-bible.md's "generate on flat
  `#151b2e`, then background-remove" convention) is **not yet wired** — the
  `RemoveBackground` / `LoadBackgroundRemovalModel` ComfyUI nodes exist on
  this machine but no bg-removal model is installed (`bg_removal_name` options
  list is empty). Buildings currently generate with a plain flat background
  colour instead of true transparency. Needed before final art replaces the
  game's real transparent-PNG building sprites — install a model (RMBG-2.0 or
  similar) and add a `RemoveBackground` step to `base_workflow`/
  `relight_workflow`, or background-remove as a separate post-process once a
  building's set is approved.

---

## Commands

```bash
# List every planned generation (17 buildings x 5 states x 4 phases + 4 map plates = 344)
python tools/comfy_buildings.py list

# Generate ONE building's full 20-image set, for review before committing to the
# full batch. Resumable — safe to re-run, skips files that already exist.
python tools/comfy_buildings.py preview town_bakery

# Assemble a building's 20 images into one contact-sheet PNG (states as
# columns, phases as rows) for a quick side-by-side review.
python tools/comfy_buildings.py contact-sheet town_bakery

# The full batch (map + all 17 buildings). Resumable; safe to Ctrl+C and
# re-run — already-generated files are skipped. Expect several hours.
python tools/comfy_buildings.py run

# Just one building's full set.
python tools/comfy_buildings.py run --only town_bakery

# Force-regenerate even where a file already exists (e.g. after a prompt edit).
python tools/comfy_buildings.py run --force
```

Output lands in `tools/comfy_out/<building>_<state>_<phase>.png` (and
`tools/comfy_out/map_<phase>.png` for the island plates) — **not** `public/art/`
directly. Nothing touches the live game until a human has reviewed and approved
a building's set.

---

## After generation: composing into sheets

The existing import pipeline (`tools/import_map_v2.py`) expects one **matrix
sheet** per building: a single image, 5 columns (ruin│wip│L1│L2│L3) × 4 rows
(dawn/midday/dusk/night) — see `art-src/Map/Full Building Final/Quarry.png` for
a real example of the target format.

`comfy_buildings.py` currently outputs 20 **individual** PNGs per building
(easier to review one at a time, and easier to regenerate a single bad cell
without redoing the whole sheet). A separate compose step — assembling the 20
approved images into the matrix layout `import_map_v2.py` expects, plus the
background-removal pass above — is the next tool to write once a building's
set is approved, not before.

---

## The content matrix

**17 buildings** (from `src/data/town-layout.ts` `BUILDING_INFO`): cottage,
bakery, well, market, garden, town hall, post office, workshop, farm, fisher
hut, sawmill, blacksmith, dock, library, quarry, tailor, lighthouse. Each has
a one-line visual description in `BUILDINGS` in the script — edit there to
adjust a building's content.

**5 states**, worded to match `docs/art-bible.md` §3 "Homestead Progression"
(the proven prior art for exactly this problem — 5 staged scenes of the same
building, concrete physical detail rather than abstract mood adjectives):
ruin (roof caved in, broken timber frame, rubble) → wip (scaffolding, open
walls) → l1 (freshly restored, one lit window) → l2 (tended garden, chimney
smoke) → l3 (banners and bunting, the pride of the village).

**4 phases:** dawn, midday (the structural base), dusk, night — directional
lighting per `docs/time-of-day-art-assets.md`'s plate spec.

**The map:** one base (midday) + 3 relit phases, same technique, matching
`map_island_plate` / `_dawn` / `_dusk` / `_night`.

---

## Tuning

- `RELIGHT_DENOISE` (0.42) — raise if the phases don't look different enough
  from the base; lower if a building's structure drifts between phases.
- `BUILDINGS` dict — per-building content description.
- `STATES` / `PHASES` dicts — the shared prompt language for every building.
- `STYLE_LAW` — the locked style/palette string, sourced from the art docs.
  Don't drift this without updating the source docs too.
- Aspect ratio: buildings default to landscape 1216×896; `PORTRAIT_BUILDINGS`
  (currently just `prop_lighthouse`) get 896×1216 instead, matching how tall
  the real sliced art already is.
