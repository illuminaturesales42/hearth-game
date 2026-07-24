# Hearth Avatar — Assets to Generate (master list)

Single source of truth for **every graphic the avatar/identity system needs**. The
code is already wired to consume all of these through `artUrl(id)` with graceful
fallback, so each asset is **drop-in**: generate → put PNG in `public/art/` →
regenerate the manifest (Python slicer, e.g. `tools/slice_generated.py`) → it
appears in-game, no code change.

**House style (all assets):** hand-painted storybook illustration matching
`public/art/char_*_bust.png` and `avatar_1..6.png` — soft painterly brushwork,
warm earthy old-seaside palette (driftwood, cream, sage, muted teal, rust, clay),
rounded friendly proportions, gentle warm rim light. **Not** flat-vector,
photoreal, anime, or 3D. Consistency across a set is the top requirement (lock a
seed / use one reference image).

Priority: **P1 = needed for the core avatar to look right; P2 = next features;
P3 = polish/optional.**

---

## P1 — Player portrait set (the picker)  ⟵ do this first

**This is the one asset that makes the whole feature look right.** Full brief with
per-portrait subjects, prompt, and technical spec: **`docs/avatar-portrait-art-spec.md`**.

| Field | Value |
|---|---|
| Files | `avatar_portrait_01.png` … `avatar_portrait_18.png` |
| Canvas | 512 × 512, **transparent**, **frameless** |
| Framing | Chest-up bust, single figure, **face in the upper third** (UI circle-crops top-centre) |
| Consistency | Identical head-size / eye-line / lighting across all 18 |
| Content | Inclusive spread: skin tone, age, gender presentation, hair texture, coastal role; **≥2 with assistive devices** (glasses, hearing aid) as normal |
| Slots into | The picker, home cameo, "You" card, Settings preview — all automatically |
| Acceptance | Reads identically to `char_*_bust` when circle-cropped at 40px; no baked frame |

You can generate **more than 18** — `avatar_portrait_19+` just add catalogue
entries the same way (one line each in `src/data/avatar-portraits.ts`).

---

## P2 — Tailor's Cottage (merge-native wardrobe home)

The building that diegetically hosts the picker/wardrobe on the map. **Decision
locked: wardrobe is portrait-only** (no layered paper-doll), so the Tailor unlocks
*additional earnable portraits*, not clothing layers — no per-garment art needed.

### P2a — Building sprite set — `town_tailor`
Follow the existing **building matrix sheet** convention (see `tools/import_map_v2.py`):

| Field | Value |
|---|---|
| Source sheet | `art-src/buildings/town_tailor.png` (one grid image) |
| Grid | **Columns:** `ruin | wip | L1 | L2 | L3`  ·  **Rows:** `dawn | midday | dusk | night` |
| Style | A small coastal tailor/weaver's cottage — timber, a hanging sign, bolts of cloth in the window; storm-ruined in the `ruin` column |
| Output ids (after slice) | `town_tailor_ruin`, `town_tailor_wip`, `town_tailor_l1..l3`, each × `_dawn/_dusk/_night` |
| Slots into | Map building system once added to `data/town-layout.ts` (see status doc §3) |
| Note | Adding it to the restoration order affects pacing — coordinate the `unlockAt` slot with Teddy before wiring |

### P2b — Tailor villager bust — `char_pell_bust` (or chosen name)
| Field | Value |
|---|---|
| File | `char_pell_bust.png` |
| Canvas | ≥ 90 × 90 (match other `char_*_bust`), painterly bust on soft parchment |
| Style | An Emberhollow tailor — warm, a tape measure or thimble, cloth tones |
| Slots into | `portraitFor()` once the villager is added to `data/villagers.ts` |

---

## P3 — Polish / optional (nice, not blocking)

### `ftue_arrival` — welcome-screen arrival scene  *(hook already live)*
| Field | Value |
|---|---|
| File | `ftue_arrival.png` |
| Canvas | ~1200 × 800 landscape, painted |
| Content | The storm-broken harbour of Emberhollow at dawn — the jetty in disrepair, dark lighthouse on the headland, one lit window; **ruined, hopeful, no player figure** |
| Slots into | FTUE welcome step (`ftue.ts`) — used automatically if present, else the current `splash_emblem` |

### `avatar_frame` — carved-wood portrait frame overlay  *(optional enhancement)*
| Field | Value |
|---|---|
| File | `avatar_frame.png` |
| Canvas | 512 × 512, **transparent centre**, decorative ring only (like the `avatar_1..6` botanical frame) |
| Use | If you want framed profile/card portraits to use a *painted* frame instead of the current CSS ring. **Needs a tiny code hook** (overlay in `avatar-render.ts`) — ask when the art exists and I'll add it |

### Additional / seasonal portraits — `avatar_portrait_19+`
Earnable painted busts (seasonal roles, festival looks) for the progression layer.
Same spec as P1. Each becomes a catalogue entry; can be flagged as unlockable
later without new code beyond the entry.

---

## Pipeline (every asset)
1. Generate in-style (lock seed / reference for consistency).
2. Export PNG at the spec'd size/format.
3. Drop in `public/art/` (busts/portraits/scenes) or `art-src/buildings/` (matrix sheets).
4. Run the relevant slicer in `tools/` (or `slice_generated.py`) to regenerate `src/art-manifest.ts`.
5. Reload — it appears. For portraits beyond the pre-listed ids, add a one-line entry in `src/data/avatar-portraits.ts`.

## What is NOT needed (by design)
- **No per-garment / clothing-layer art** — wardrobe is portrait-only.
- **No gacha/loot art, no currency icons** — monetisation model forbids them.
- **No separate reduced-motion assets** — everything is static-friendly.
