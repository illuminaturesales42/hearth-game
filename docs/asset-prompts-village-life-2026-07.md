# HEARTH — Remaining Asset Prompt Library (Village Life)

*2026-07-16 · hand this whole file to ChatGPT/DALL-E (or any image model) to generate the last graphics HEARTH needs.*

## What this is

HEARTH already ships **300+ finished art assets**. The Village Life production pass (mini-games, Repository, reactive world) added its images **fallback-guarded** — the code asks `artUrl(id)` for each one, and until the file exists it quietly shows an emoji or a flat panel. A full code audit found **exactly 12 images still missing**. This document is the complete, paste-ready brief for those 12 (plus one optional refresh). Produce them to the sizes/names below, drop them in (see §7), and the slots light up with **no code change**.

**The 12:** 6 mini-game backdrops · 4 foraging tokens · 2 section-header banners. That's the whole remaining set.

---

## §1 — THE STYLE BLOCK  *(paste this at the top of EVERY prompt)*

> **Style:** cosy coastal storybook — hand-painted digital illustration, soft painterly brushwork, gentle rim light, a subtle paper/canvas texture. Warm amber-gold key light from the upper-left, cool dusk-blue fill. Every asset feels lit by a hearth or a low evening sun — "coming home after a good day." Moderate saturation, painted not neon. British storybook mood; the village is **Emberhollow**, a warm restored coastal island.
> **Palette (stick to these):** night navy `#0d1322` / `#16203a`, warm panel `#1b2138`, parchment `#ecdcb6`, ember-gold accent `#f4a63b` (highlight `#ffd27a`, deep `#e5761e`), sea-teal secondary `#4f8698`, cream `#f4ecd8`, leaf-green `#3a5a34`. Warm gold dominant; teal is a *supporting* cool, never a second accent.
> **Technique, hard:** NOT flat vector, NOT 3D/CGI render, NOT cel-shaded anime, NOT photoreal.

## §2 — UNIVERSAL NEGATIVE  *(append to EVERY prompt)*

```
flat vector, sterile, 3d render, cgi, plastic, neon, oversaturated, harsh contrast,
anime, manga, cel shaded, photograph, text, letters, numbers, watermark, signature,
logo, ui frame, drop-shadow box, low detail, blurry, jpeg artifacts, deformed
```

## §3 — HARD RULES  *(non-negotiable — the game's identity depends on these)*

1. **No gems, diamonds, or premium-currency iconography, ever.** HEARTH never sells power. Currency is a plain **coin** only.
2. **Energy is a glowing ember-heart** — a warm coal shaped like a heart. **Never a lightning bolt**, never electricity, never a literal campfire flame standing in for energy.
3. **No text, labels, numbers, or watermarks inside the image.** UI text is drawn by the app.
4. **Transparency:** foraging tokens = **transparent-background PNG**, single centred object. Backdrops & banners = **opaque** full-bleed scenes.
5. British spelling in any notes ("cosy", "colour", "harbour").

---

## §4 — GROUP A · Mini-game backdrops  ·  6 images

**Shared spec for all six:** `public/art/<id>.png` · **880 × 1120 px, portrait (11:14)** · **opaque** · fills the entire game card (`background-size: cover`, centred).
**Critical placement note — design for the scrim:** the app lays a **dark navy scrim over the backdrop** so gameplay and text stay readable (radial: ~35% dark at the centre → ~74% dark at the edges, plus an overall ~50% navy wash). So:
- Keep the **focal scene in the centre third**, mid-toned and warm — it must still read through a 35% darken.
- Let the **edges fall naturally dark** (dusk shadow, deep navy) — they'll be ~75% obscured anyway.
- **No small important detail** — the play pieces (rings, pegs, anvils, cards) sit on top. This is *atmosphere behind glass*, not a busy illustration. Soft depth, low contrast, no hard focal object dead-centre where the game piece lands.

| id | Scene |
|---|---|
| `mg_bg_well` | A mossy old stone **wishing-well** in a quiet dusk courtyard; warm lantern glow, a few coins' shimmer on dark water, soft cobbles fading to shadow at the edges. |
| `mg_bg_beacon` | The **lighthouse balcony** at twilight, looking out over a calm teal-blue bay; the beam's warm glow behind, stars just appearing, deep navy sea below. |
| `mg_bg_forge` | A cosy **blacksmith's interior**, glowing orange coals in the hearth, warm sparks, dark timber walls, tools in soft shadow around the edges. |
| `mg_bg_catch` | A quiet **harbour jetty at golden hour**, still water, a moored rowboat, gentle ripples, warm reflections dissolving into dark water at the frame edges. |
| `mg_bg_forage` | A **fog-touched woodland edge** where forest meets shore; soft mist, dappled amber light through leaves, mushrooms and ferns hinted in the gloom. |
| `mg_bg_stacks` | A **cosy library nook**, warm lamplight on old bookshelves, a reading chair, dust motes in a golden beam, corners falling to shadow. |

**Paste-ready prompt (example — `mg_bg_well`; swap the middle sentence per row):**
> `[STYLE BLOCK from §1]` A mossy old stone wishing-well in a quiet dusk courtyard, warm lantern glow catching the wet cobbles, faint shimmer of coins on dark water. Atmospheric background scene, focal interest in the centre and mid-toned so it reads under a dark overlay, edges falling into deep navy dusk shadow, soft depth, low contrast, no single hard object dead-centre. Portrait composition, 880×1120. `[NEGATIVE from §2]`

---

## §5 — GROUP B · Foraging tokens  ·  4 images

**Shared spec:** `public/art/<id>.png` · **128 × 128 px, square** · **transparent background** · a **single object, centred, ~8% padding**, no baked cast shadow (the app adds its own). Rendered small (~40 px) in a 5×5 uncover grid, so keep it a **bold, simple, instantly-readable painted icon**.

| id | Object |
|---|---|
| `mg_forage_coin` | A single **ember-gold coin**, warm painted metal, a soft highlight — plain currency coin (no symbols stamped on it). |
| `mg_forage_ember` | A small **glowing ember-heart** — a warm coal shaped like a heart, gentle amber glow. This is the energy motif. **Not a flame, not a bolt.** |
| `mg_forage_honeycomb` | A piece of **amber honeycomb**, glistening, a golden droplet of honey. |
| `mg_forage_leaf` | A single **painted leaf or fern frond**, autumnal green-gold, gently curled. |

**Paste-ready prompt (example — `mg_forage_ember`):**
> `[STYLE BLOCK from §1]` A single small glowing ember-heart — a warm coal shaped like a heart with a soft amber glow — hand-painted game token, centred on a transparent background, ~8% padding, bold and readable at small size, no cast shadow. Square 128×128. `[NEGATIVE from §2]`, flame, fire, lightning bolt

---

## §6 — GROUP C · Section-header banners  ·  2 images

**Shared spec:** `public/art/<id>.png` · **1200 × 300 px, wide 4:1 strip** · **opaque** · sits as a full-width band behind a section title (cover-cropped, max-height ~120px on screen). **Keep the centre calm and the tone even** — a title in cream text sits over it, so avoid busy detail or bright spots in the middle band; let warm interest drift to the left and right thirds. Painterly, atmospheric, low contrast.

| id | Scene |
|---|---|
| `ui_repository_header` | "Your Repository" — warm **shelves and baskets of kept goods** (jars, folded wool, seeds, small crates) in soft hearth light; a cosy storeroom feel, calm centre for the title. |
| `ui_villagelife_header` | "Village Life" — a **lived-in Emberhollow square** vignette at golden hour: cottage rooftops, a lantern, a wisp of chimney smoke, gentle bunting — welcoming, warm, centre kept quiet. |

**Paste-ready prompt (example — `ui_repository_header`):**
> `[STYLE BLOCK from §1]` A warm storeroom of kept goods — shelves and baskets of jars, folded wool, seeds and small wooden crates in soft hearth light. Wide banner vignette, atmospheric and low-contrast, the centre kept calm and even for an overlaid title, warm interest drifting to the left and right thirds. Wide 4:1 strip, 1200×300, opaque. `[NEGATIVE from §2]`

---

## §7 — Getting the finished images into the game

The app never hard-codes image paths — it asks `artUrl(id)`, so adding art is just: put the PNG where the slicer can see it, register it, run the slicer.

1. **Name each file exactly its id** (e.g. `mg_bg_well.png`) and save it to:
   `C:\Users\illum\OneDrive\Desktop\Hearth\Graphics and UI\Core\Final Assets\Generated\`
2. **Register them** — add these lines inside `define()` in `tools/slice_assets.py` (just before the final `define()` call). `opaque=True` keeps the full rectangle (backdrops/banners); omit it for transparent cut-outs (tokens):

```python
# Village Life — 2026-07 asset drop
register_whole("mg_bg_well",    "mg_bg_well.png",    opaque=True)
register_whole("mg_bg_beacon",  "mg_bg_beacon.png",  opaque=True)
register_whole("mg_bg_forge",   "mg_bg_forge.png",   opaque=True)
register_whole("mg_bg_catch",   "mg_bg_catch.png",   opaque=True)
register_whole("mg_bg_forage",  "mg_bg_forage.png",  opaque=True)
register_whole("mg_bg_stacks",  "mg_bg_stacks.png",  opaque=True)
register_whole("ui_repository_header", "ui_repository_header.png", opaque=True)
register_whole("ui_villagelife_header","ui_villagelife_header.png", opaque=True)
register_whole("mg_forage_coin",      "mg_forage_coin.png")       # transparent
register_whole("mg_forage_ember",     "mg_forage_ember.png")      # transparent
register_whole("mg_forage_honeycomb", "mg_forage_honeycomb.png")  # transparent
register_whole("mg_forage_leaf",      "mg_forage_leaf.png")       # transparent
```

3. **Run the slicer:** `python tools/slice_assets.py` — it writes `public/art/<id>.png` and regenerates `src/art-manifest.ts` so `artUrl()` resolves.
4. **Rebuild/deploy** — the mini-game cards now show their backdrops, the forage grid shows painted tokens, and the Repository / Village Life sections gain their header bands. Nothing else to wire.

*(You don't have to do any of §7 yourself — hand the generated PNGs back and I'll register, slice, deploy, and verify.)*

---

## §8 — Optional refresh (not one of the 12)

- `prop_well` — the well already has art but it read small/weak in play-testing. If you fancy a stronger hero: **transparent PNG, ~360 × 360**, a characterful mossy stone wishing-well seen at a slight 3/4 angle, its base flat (it's anchored bottom-centre; the app adds the ground shadow). Used both on the map and inside the well game. Only replace if you want to — it's not blocking anything.

---

## §9 — Per-asset sanity checklist (before you send them back)

- [ ] Filename is **exactly the id** + `.png` (snake_case, no spaces).
- [ ] Backdrops/banners are **opaque**; forage tokens are **transparent**.
- [ ] Correct size: backdrops 880×1120, tokens 128×128, banners 1200×300.
- [ ] **No text, numbers, watermark, or UI frame** anywhere in the image.
- [ ] **No gems, no lightning bolts** — energy is the ember-heart, currency is a coin.
- [ ] On-palette (warm gold dominant, teal only as support), painterly not vector/3D.
- [ ] Backdrops: focal interest **centred & mid-toned**, edges dark (reads under the scrim).
- [ ] Banners: **centre kept calm** for the overlaid title.
</content>
