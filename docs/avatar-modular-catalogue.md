# Hearth Avatar Modular Catalogue — 12 × 4 × 6

Full-portrait catalogue approach (per locked v1.2 decision — no layered/paper-doll
compositing). Every combination is rendered as one complete painted bust. The
"modularity" the player sees in the picker is: pick a base character (face),
then pick a skin tone and hairstyle, and the app shows the matching
pre-rendered PNG.

**Total: 288 portraits** (12 faces × 4 skin tones × 6 hairstyles).

File naming: `avatar_c{CC}_skin{S}_hair{HH}.png`
e.g. `avatar_c03_skin2_hair05.png` = base character 03, skin tone 2, hairstyle 05.

---

## Axis 1 — 12 base characters (face/identity, LOCKED per character)

Each locked to its own fixed seed so the same face renders consistently across
all 24 skin/hair variants. Hair and skin tone are stripped out of these
descriptions — they're injected separately.

| # | Face description (seed) | Suggested role flavor |
|---|---|---|
| 01 | round face, high cheekbones, warm hazel eyes, soft smile | gardener |
| 02 | angular jaw, straight brows, weathered features, steady gaze | dockhand |
| 03 | soft round face, light freckles, gentle warm eyes | baker |
| 04 | lined weathered face, strong brow, kind tired eyes, grey stubble | fisher elder |
| 05 | narrow face, round glasses, thoughtful expression, high cheekbones | librarian |
| 06 | oval face, high cheekbones, calm warm expression | herbalist |
| 07 | youthful face, light freckles, bright curious eyes | boatswain |
| 08 | lined elder face, soft wrinkles, warm knowing smile | keeper |
| 09 | heart-shaped face, defined cheekbones, warm open smile | trader |
| 10 | square jaw, broad friendly features, steady warm gaze | carpenter |
| 11 | delicate features, hearing aid, gentle soft expression | newcomer |
| 12 | angular face, strong brow, weathered moustache-friendly structure | postmaster |

## Axis 2 — 4 skin tones

| # | Clause |
|---|---|
| 1 | light skin |
| 2 | medium skin |
| 3 | tan skin |
| 4 | deep skin |

## Axis 3 — 6 hairstyles

| # | Clause |
|---|---|
| 01 | curly updo |
| 02 | short cropped hair |
| 03 | long braid |
| 04 | wavy shoulder-length hair |
| 05 | tight coils |
| 06 | flat cap covering hair |

---

## Prompt template

> cosy storybook character portrait, hand-painted digital illustration,
> chest-up bust of a person, **{FACE}**, **{SKIN}**, **{HAIR}**, warm
> painterly brushwork, visible brushstrokes, gentle warm rim light from upper
> left, muted earthy old-seaside colour palette, driftwood brown cream sage
> muted teal rust, Emberhollow fishing village resident, plain cream
> parchment background, single figure centred, face in upper third of frame,
> consistent lighting, children's book illustration style, warm and welcoming
> expression

Negative (locked, same as the 18-portrait set):
`photorealistic, photograph, 3d render, anime, manga, harsh outlines, cel
shaded, high saturation, neon, modern streetwear, logos, text, watermark,
frame, border, busy background, scene clutter, extra limbs, deformed,
uncanny, low quality, blurry, cropped, multiple people, full body`

**Seed rule:** seed = `1000 + (character_number * 10)`, IDENTICAL across all
24 skin/hair variants of that character (so the face stays recognizable),
DIFFERENT between characters (so the 12 faces stay visually distinct).
e.g. character 03 → seed 1030 for all 24 of its variants.

---

## Validation batch (run this first)

Before committing ~3 hours of render time to the full 288, generate all 24
variants of **character 03 only** (4 skin × 6 hair) and check:
- Face reads as the same person across all 24
- Skin tone changes are visible and distinct
- Hairstyle changes are visible and distinct
- Style still matches `char_*_bust.png` register

Driver script: `F:\sandbox\sulphur-2\ComfyUI\tools\batch_avatar_catalogue.py`
(run with `--character 3` for the validation batch, no flag for the full 288).
