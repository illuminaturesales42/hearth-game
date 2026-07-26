# Hearth Avatar Portraits — ComfyUI prompt set

Ready-to-paste positive prompts for `hearth_avatar_portraits.json` in ComfyUI.
Paste one line's `SUBJECT` clause into the Positive Prompt node's `{SUBJECT}`
slot, keep everything else (negative prompt, seed 777, steps 32, cfg 7.0,
dpmpp_2m/karras, 512x512) locked, queue, save as the matching filename.

Base template (already loaded in the workflow — this is the full string that
node 2 sends, shown here for reference):

> cosy storybook character portrait, hand-painted digital illustration,
> chest-up bust of **{SUBJECT}**, warm friendly rounded features, soft
> painterly brushwork, visible brushstrokes, gentle warm rim light from upper
> left, muted earthy old-seaside colour palette, driftwood brown cream sage
> muted teal rust, Emberhollow fishing village resident, plain cream
> parchment background, single figure centred, face in upper third of frame,
> consistent lighting, children's book illustration style, warm and welcoming
> expression, soft smile

Negative (locked): `photorealistic, photograph, 3d render, anime, manga,
harsh outlines, cel shaded, high saturation, neon, modern streetwear, logos,
text, watermark, frame, border, busy background, scene clutter, extra limbs,
deformed, uncanny, low quality, blurry, cropped, multiple people, full body`

---

## The 18 subjects

| # | File | SUBJECT clause to paste in |
|---|---|---|
| 01 | `avatar_portrait_01.png` | young woman, fair skin, red curly updo, green pinafore, gardener |
| 02 | `avatar_portrait_02.png` | young man, olive skin, dark wavy hair, canvas shirt and suspenders, dockhand |
| 03 | `avatar_portrait_03.png` | middle-aged woman, deep brown skin, box braids, apron, baker |
| 04 | `avatar_portrait_04.png` | older man, tan skin, grey beard, flat cap, wool jumper, fisher |
| 05 | `avatar_portrait_05.png` | young person, medium skin, short black crop, round glasses, cardigan, librarian |
| 06 | `avatar_portrait_06.png` | woman, rich dark skin, headscarf, herb-green shawl, herbalist |
| 07 | `avatar_portrait_07.png` | young man, fair freckled skin, sandy tousled hair, oilskin coat, boatswain |
| 08 | `avatar_portrait_08.png` | older woman, warm skin, silver bun, shawl, keeper elder |
| 09 | `avatar_portrait_09.png` | young woman, bronze skin, long dark braid, striped fisher tunic, trader |
| 10 | `avatar_portrait_10.png` | man, deep skin, short locs, knit jumper, carpenter |
| 11 | `avatar_portrait_11.png` | young person, pale skin, ash-blond bob, hearing aid, linen shirt |
| 12 | `avatar_portrait_12.png` | middle-aged man, olive skin, moustache, waistcoat, postmaster |
| 13 | `avatar_portrait_13.png` | woman, tan skin, auburn loose waves, rain jacket |
| 14 | `avatar_portrait_14.png` | young man, medium-deep skin, tight curls, apron over tee, cook |
| 15 | `avatar_portrait_15.png` | older person, fair skin, weathered face, sou'wester hat, old salt |
| 16 | `avatar_portrait_16.png` | woman, deep skin, afro, floral shirt, florist |
| 17 | `avatar_portrait_17.png` | young man, warm skin, straight black hair, scarf, newcomer |
| 18 | `avatar_portrait_18.png` | woman, olive skin, grey-streaked plait, gardening smock, matron |

---

## After generating

1. Save/rename each PNG to `avatar_portrait_NN.png` (zero-padded).
2. Drop them into `F:/Mastermind launch/hearth/public/art/`.
3. Background will be plain cream parchment, not true alpha transparency —
   ComfyUI has no background-removal node installed currently. If you want
   real transparent PNGs, say so and I'll install a rembg/BiRefNet node and
   add a batch post-process step; otherwise the parchment background is an
   explicitly allowed fallback per `avatar-portrait-art-spec.md`.
4. Run the art manifest regen (`tools/slice_generated.py` or the relevant
   slicer) so `src/data/avatar-portraits.ts` picks the new ids up.
5. Spot-check consistency: same head size / eye-line / lighting across all 18,
   and that circle-cropping at 40px still reads clearly next to `char_*_bust`.
