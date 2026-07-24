# Hearth — Player Avatar Portrait Art Spec (generation brief)

**Purpose:** the painted portrait set players choose from to become a villager of Emberhollow. These must sit convincingly beside the existing villager busts (`char_bran_bust`, `char_sorin_bust`, `char_wren_bust`, `char_marta_bust`, `char_joss_bust`, `char_mayor_bust`) and the framed friend portraits (`avatar_1`–`avatar_6`). **The avatar picker in-game reads these straight from `public/art/`** — drop the finished PNGs in, regenerate the manifest, done.

---

## 1. Style target (match the existing art exactly)

Look at `public/art/char_*_bust.png` and `public/art/avatar_1..6.png` — that *is* the target. Reproduce their register:

- **Hand-painted storybook illustration.** Soft digital brushwork, visible painterly texture, gentle linework — **not** vector-flat, **not** photorealistic, **not** anime, **not** 3D render.
- **Warm, cosy, old-seaside palette:** weathered browns, driftwood, cream, sage/moss green, muted teal, rust/clay, soft burgundy. Low saturation, warm key light from the upper-left, soft rim light.
- **Rounded, friendly, lightly-stylised proportions.** Characterful and warm — a touch caricatured like Bran/Sorin — never uncanny or fashion-model.
- **Emberhollow-appropriate wardrobe:** linen, wool knits, canvas, oilskin, aprons, flat caps, headscarves, scarves, suspenders. Working coastal folk. No modern/streetwear, no logos, no neon, no fantasy armour.
- **Expression:** warm, welcoming, kind, hopeful. A soft smile or gentle neutral.

**Consistency across the whole set is the #1 requirement** — same illustrator's hand, same lighting direction, same rendering level, same framing/scale/eye-line. Generate the set with one locked base prompt + seed discipline (or one reference image via IP-Adapter) and vary only the subject tokens.

---

## 2. Technical spec (so the game crops them cleanly)

| Property | Value |
|---|---|
| **Canvas** | 512 × 512 px, square |
| **Background** | **Transparent** (preferred) — the app supplies parchment/frame/circle. If a painted bg is unavoidable, use a soft cream parchment vignette like the `char_*_bust` files, kept plain (no scene clutter). |
| **Framing** | Chest-up bust, single figure, centred |
| **Face position** | Eyes at ~35–40% from the top, head in the **upper third** — the UI circular-crops (`border-radius:50%`, `background-position:center top`), so the face must sit high and centred |
| **Scale consistency** | Same head size & vertical eye-line in **every** portrait (so the circular crop frames each one identically) |
| **No baked frame** | Do **not** paint the carved-wood/botanical frame from `avatar_1..6` — the app adds framing. Frameless bust only. |
| **Format** | PNG, RGBA |
| **File names** | `avatar_portrait_01.png` … through the full set (zero-padded, sequential) |
| **Location** | `public/art/` |

Negative prompt starter: `photorealistic, photograph, 3d render, anime, manga, harsh outlines, cel shaded, high saturation, neon, modern streetwear, logos, text, watermark, frame, border, busy background, extra limbs, deformed, uncanny`.

---

## 3. The set to generate (inclusive + seaside)

Aim for **~18 portraits** giving a genuinely inclusive spread — this is the identity layer, so representation is the whole point. Vary skin tone, age, gender presentation, hair texture, and coastal role across the set. Include assistive representation as normal (glasses, hearing aid) — never as a "special" portrait.

| # | File | Suggested subject (vary freely, keep the style) |
|---|---|---|
| 01 | avatar_portrait_01 | Young woman, fair skin, red curly updo, green pinafore — gardener |
| 02 | avatar_portrait_02 | Young man, olive skin, dark wavy hair, canvas shirt + suspenders — dockhand |
| 03 | avatar_portrait_03 | Middle-aged woman, deep brown skin, box braids, apron — baker |
| 04 | avatar_portrait_04 | Older man, tan skin, grey beard, flat cap, wool jumper — fisher |
| 05 | avatar_portrait_05 | Young person, medium skin, short black crop, **round glasses**, cardigan — librarian |
| 06 | avatar_portrait_06 | Woman, rich dark skin, headscarf, herb-green shawl — herbalist |
| 07 | avatar_portrait_07 | Young man, fair freckled skin, sandy tousled hair, oilskin coat — boatswain |
| 08 | avatar_portrait_08 | Older woman, warm skin, silver bun, shawl — keeper/elder |
| 09 | avatar_portrait_09 | Young woman, bronze skin, long dark braid, striped fisher tunic — trader |
| 10 | avatar_portrait_10 | Man, deep skin, short locs, knit jumper — carpenter |
| 11 | avatar_portrait_11 | Young person, pale skin, ash-blond bob, **hearing aid**, linen shirt |
| 12 | avatar_portrait_12 | Middle-aged man, olive skin, moustache, waistcoat — postmaster |
| 13 | avatar_portrait_13 | Woman, tan skin, auburn loose waves, rain jacket |
| 14 | avatar_portrait_14 | Young man, medium-deep skin, tight curls, apron over tee — cook |
| 15 | avatar_portrait_15 | Older person, fair skin, weathered face, sou'wester hat — old salt |
| 16 | avatar_portrait_16 | Woman, deep skin, afro, floral shirt — florist |
| 17 | avatar_portrait_17 | Young man, warm skin, straight black hair, scarf — newcomer |
| 18 | avatar_portrait_18 | Woman, olive skin, grey-streaked plait, gardening smock — matron |

(Order/subjects are a guide — the hard requirements are **style match, consistency, inclusive spread, technical spec.** Add more than 18 if you like; the picker shows whatever exists.)

---

## 4. Base prompt (starting point — tune to your model)

> *cosy storybook character portrait, hand-painted digital illustration, chest-up bust of {SUBJECT}, warm friendly rounded features, soft painterly brushwork, gentle warm rim light from upper left, muted earthy old-seaside colour palette (driftwood brown, cream, sage, muted teal, rust), Emberhollow fishing village resident, transparent background, single figure centred, face in upper third, consistent lighting, children's book illustration style, warm and welcoming expression*

Lock seed/reference for consistency; swap only `{SUBJECT}` from the table.

---

## 5. Hand-off checklist

- [ ] ~18 PNGs, `avatar_portrait_01.png`… in `public/art/`
- [ ] All 512×512, transparent, frameless, face upper-third, consistent scale
- [ ] Style reads identical to `char_*_bust` when circle-cropped at 40px
- [ ] Inclusive spread (skin/age/gender/hair/role + ≥2 assistive)
- [ ] Run the art manifest regen (Python slicer / `slice_generated.py`) so `ART_IDS` picks them up
- [ ] Tell me they're in — the picker catalogue (`src/data/avatar-portraits.ts`) already lists these ids and they'll light up automatically

Until your set lands, the picker falls back to the existing `avatar_1..6` so it's testable today.
