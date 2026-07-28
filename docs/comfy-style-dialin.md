# Hearth Buildings — style dial-in rig

*Written 2026-07-28. The buildings generated on 07-26 had good structure but
the wrong look: they don't read as the same world as the 288 avatar portraits.
This rig finds the recipe that does, by rendering one building across every
candidate setting and putting the results side by side.*

---

## What was actually wrong

Structure was **not** the main problem — the Canny-locked workflow in
`comfy-building-worksheet.md` solved that (edge map from the artist's own
reference cell, ControlNet strength 0.95 released at 0.72). Style was, and the
forensics are unambiguous:

| | Avatar portraits (the target look) | Buildings (07-26) |
|---|---|---|
| Checkpoint | `RealVisXL_V5.0` | `Juggernaut-XL_v9` |
| Prompt dialect | *soft painterly brushwork, visible brushstrokes* | *confident visible ink and pencil linework* |
| Palette words | driftwood brown cream sage muted teal rust | seven hex codes |
| Style reference | a real portrait via IPAdapter | a 90×90 bust, or the building's own last output |
| IPAdapter model | `ip-adapter-plus-face` (face-trained) | same face model, on architecture |

Two different recipes were being asked to produce one world.

**The fix under test:** speak the portraits' dialect, on the portraits'
checkpoint, with an IPAdapter that is actually built for general imagery
(`ip-adapter-plus_sdxl_vit-h`, installed 07-28) pointed at a **style board
composited from four real portraits** out of the catalogue.

---

## The sweep

`python tools/comfy_dialin.py` — 16 renders (~4 min each, ~1 hour), subject is
the Forge L1 cell, everything structural held constant.

| Axis | Values |
|---|---|
| Checkpoint | `realvis` · `jugg` |
| Prompt dialect | `paint` (portrait-derived) · `ink` (07-26 control) |
| IPAdapter | `noipa` control · `style055` · `style085` · `strong070` |

Weight types are exactly what this ComfyUI build exposes — `style transfer
precise` does **not** exist here (it 400s the queue); the available strong
option is `strong style transfer`.

Output: `tools/comfy_out/dialin/<recipe>.png` plus **`contact_sheet.png`**, a
labelled grid — the one file to actually look at.

Locked across every cell (from the worksheet §3, do not re-open while judging
style): seed 777777 · 40 steps · cfg 7.0 · dpmpp_2m/karras · denoise 1.0 ·
Canny 100/200/1024 · ControlNet 0.95 strength, end 0.72 · latent matched to
the cell aspect (L1 = 1024×848).

### How to judge

In this order — a cell that fails an earlier test can't be rescued by a later one:

1. **Does it look like the portraits?** Painterly, visible strokes, soft warm
   light. Not inked, not vector, not photographed.
2. **Did the geometry survive?** Compare against `forge_ref_l1.png`: same
   massing, chimney, roofline, door placement.
3. **Palette** — inside the art-bible swatches; warm stone, muted teal, cream.
4. **Cut-out viability** — clean silhouette against the backdrop, nothing
   fading into it.

Known artefact in the first render: the style board carries the portraits'
*cream parchment* background, so scenes can inherit a papery vignette. It cuts
away with the building, but if it dominates, add a plain-backdrop clause or
crop the board tighter to the faces.

---

## The interactive workflow

`python tools/comfy_make_workflow.py` installs **`hearth_building_dialin`** on
the running ComfyUI (Workflow → Browse). Same graph, hand-drivable, with the
three dials titled and an on-canvas README note.

It is *generated from the server's own `/object_info`*, not hand-written, so
slot order always matches the running build — the usual cause of a workflow
that opens with broken links.

Two gotchas it also handles:

- **The live :8188 may be Comfy Desktop**, whose `input/`/`output/` are *not*
  `F:\sandbox\sulphur-2\ComfyUI\…`. Every 07-26 script hardcodes those paths
  and fails silently. Both new tools use the HTTP API instead
  (`POST /upload/image`, `GET /view`, `POST /userdata/...`).
- Reference cells therefore have to be **uploaded** to the server before the
  UI graph can see them. `comfy_dialin.py` does this automatically; all five
  Forge state cells are already up.

---

## Once a recipe wins

1. Re-run it on a second building to confirm it generalises:
   `python tools/comfy_dialin.py --subject bakery --only <recipe-id>`
   (needs `bakery_ref_l1.png` — crop the midday row of its sheet per
   worksheet §3).
2. Fold the winner into the worksheet's §1/§3 as the new locked block.
3. Generate **L1 first** for each building (identity anchor), approve it, then
   the other four states with that L1 as the IPAdapter identity reference —
   the generation order in worksheet §0 still applies.
4. Cut out with `remove_bg_and_crop()` (rembg u2net, in `comfy_dropin_test.py`),
   downscale to 320 px long edge, drop into `public/art/`, then
   `python tools/import_map_v2.py --manifest-only`.

## If the sweep isn't good enough

In escalating order of effort:

- **Tighter style board** — crop to faces/brushwork only, drop the parchment.
- **`controlnet-union-sdxl-promax`** (~2.5 GB) adds depth/lineart/softedge;
  softedge is gentler than Canny on painterly subjects and may free the model
  to paint while still holding massing.
- **Train a style LoRA on the 288 portraits** — the real endgame lock, and the
  only approach that makes style a property of the *model* rather than of a
  prompt. Needs kohya on ROCm (WSL); a session of its own.
