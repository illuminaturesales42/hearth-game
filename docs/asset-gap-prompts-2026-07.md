# HEARTH — Additional Assets Needing Transparent Backgrounds

*2026-07-13 · Verified against `public/art` (383 sliced files) + `…\Core\Final Assets\Merge Slice\` + `Transparent\`. Every asset below is genuinely **absent** from the game today. Prompts are paste-ready — prepend the STYLE BLOCK to each. Naming matches what the code will look up so slices wire in with the existing `artUrl()` seam.*

## First — what is NOT a gap (already done & integrated)

To avoid regenerating work: the following are **complete** in `public/art` and wired in, despite older docs (`CLAUDE.md`, the audit) calling them "pending":

- **All 20 merge chains** — sliced from `Merge Slice\` (wood, harvest, hearthfire, keepsake, stone, clay, seeds, flowers, water, copper, fish, honey, herbs, wool, books, music, homestead, greenhouse, smithy, apothecary).
- **All 14 town buildings** + **every L2/L3 upgrade** + ruins (`town_ruin_0..7`) + scaffolds (`town_wip_0..7`).
- **8 walker sprites** (`npc_bran/wren/sorin/marta/joss/child/woman/man`).
- **6 character busts** (`char_bran/wren/sorin/marta/joss/mayor_bust`).
- **All 18 wellness medallions** (`action_walk/water/sleep/meditate/…`).
- **Energy states** (`energy_full/med/low/empty/heart`), **6 chapter splashes** (`chapter_1..6`), `fx_flame_beacon`, `reward_chest`, UI panels.

> The audit/plan line "deliver Batch 8/10 portraits + medallions + L2/L3" is therefore already satisfied — I'll correct that note. The real remaining art is below.

---

## STYLE BLOCK — prepend to every prompt

```
HEARTH art style (the law — match exactly, do not invent a new style):
Hand-painted warm storybook illustration. Soft painterly brushwork, gentle
rim light, cosy golden-hour warmth. Palette: #EAD7B5 #C79A6B #8FBF8F #6A8CA7
#8E7CC3 #D46B6B #F4F0E6. 45° isometric for world/buildings/props; 3/4 view
for characters. TRANSPARENT background PNG, single subject centred, 6–8%
padding, soft contact shadow only (no ground plane, no scene box). No text,
labels, letters, numbers, watermarks, or UI frames inside the image. Never
draw gems or premium currency; game energy is an ember-heart flame, never a
lightning bolt. Consistent scale and lighting with the delivered Batch 2–8
sheets. Deliver as lowercase snake_case PNG named exactly as specified.
```

---

## Group A — Late-game restoration (Chapters 3–6) · **highest priority**

*These unlock Batch B5 of the improvement plan: the town must keep visibly rebuilding from order 24 → 72. Buildings are 45° iso, ~512×512 (docks wider). Wire into `data/town-layout.ts` `TOWN_BUILDINGS` with the given art id.*

### A1 · `town_beacon_south.png` — second lighthouse (c6-10)
```
Paint: town_beacon_south — a second, smaller stone lighthouse/beacon tower for
the south headland of a coastal village. Weathered pale stone with a warm-lit
lamp room at the top, a low rocky base. Slightly humbler than a grand
lighthouse — a companion light. 45° iso, ~512×512. (A separate flame overlay
fx_flame_beacon already sits atop it — leave the lamp room glassed and empty.)
```

### A2 · `town_school.png` — the schoolhouse (c5-04)
```
Paint: town_school — a small warm village schoolhouse: timber-and-plaster walls,
a little bell in a rooftop cupola, a bright new door, one big window with warm
light. Cosy, welcoming, storybook. 45° iso, ~512×512.
```

### A3 · `town_cottage_wed.png` — the newlyweds' cottage (c6-07)
```
Paint: town_cottage_wed — a pretty seaside cottage on a rise, freshly built for
newlyweds: whitewashed walls, flower boxes at the windows, a garland of spring
blossom over the door, a wisp of chimney smoke. Joyful, hopeful. 45° iso,
~512×512. (Variant of the existing town_cottage — same roofline, dressed for a
wedding.)
```

### A4 · Winter dressing (town stage 5 — "The Long Winter", Ch 5)
*Props/nature, ~256×256, transparent, keyed to `stage` in `TOWN_NATURE`.*
```
tree_pine_snow.png    — a pine with soft snow on its boughs. 45° iso, ~256×256.
tree_oak_snow.png     — a bare/frosted oak dusted with snow. ~256×256.
prop_snowman.png      — a small friendly snowman with a scarf. ~200×256.
prop_brazier.png      — a lit iron street brazier glowing warm against the cold. ~200×256.
prop_wreath.png       — a winter door wreath of holly and berries. ~180×180.
terrain_snow_patch.png— a soft patch of settled snow for the ground layer. flat, ~256×160.
prop_icicles.png      — a small row of icicles (roof-edge dressing). ~160×120.
```

### A5 · Spring / wedding & fair dressing (town stage 6–7 — "Spring Tides", Ch 6)
*Props/nature, transparent, keyed to `stage`.*
```
tree_blossom.png       — a tree in full pink-white spring blossom. 45° iso, ~256×280.
terrain_snowdrops.png  — a little cluster of snowdrops/spring flowers, ground layer. flat, ~200×140.
prop_wedding_arch.png  — a flower-wound wedding arch. ~256×300.
prop_bunting.png       — a string of warm festival bunting/flags (single swag). ~320×120.
prop_flower_garland.png— a hanging garland of spring flowers. ~280×120.
prop_maypole.png       — a beribboned fair maypole (the Beacon Fair). ~200×320.
prop_market_stall.png  — a small festive fair stall with striped awning. 45° iso, ~256×256.
```

### A6 · Returning cast — map walkers (256×512, 3/4-ish tiny full body)
*Wire into `TOWN_WALKERS`. Match the existing `npc_*` scale exactly.*
```
npc_child_grown.png  — the sea-child a season older, now toddling/walking. ~256×512.
npc_elder_keeper.png — the old keeper from before Sorin (returns Ch 4), stooped,
                       kind, a walking stick. ~256×512.
npc_visitor_1.png    — a returning sailor of the lost Marigold crew, salt-worn,
                       relieved to be home. ~256×512.
npc_visitor_2.png    — a young woman newcomer arriving by boat. ~256×512.
npc_visitor_3.png    — a bearded fisherman newcomer with a net over his shoulder. ~256×512.
```

---

## Group B — Story clue objects (Journal "Clues" tab) · high priority

*Transparent object icons, 512×512, painterly, single subject. These carry the mystery and currently have no art. Wire into the Journal `story_clue_*` slots (small code hook, plan Batch B9/UX).*
```
story_clue_key.png       — an aged brass door key, ornate bow. 512×512.
story_clue_bolt.png      — a heavy rusted iron shutter-bolt (the one that
                           darkened the lighthouse). 512×512.
story_clue_chart.png     — a rolled/curled sea tide-chart of northern shoals,
                           ink markings, no legible text. 512×512.
story_clue_oilskin.png   — a torn scrap of dark oilskin with faint stitched
                           initials suggested (not legible). 512×512.
story_clue_coin.png      — a rusted old ship's coin, worn face. 512×512.
story_clue_bootprints.png— a set of faint bootprints in wet sand. 512×512.
story_clue_ledger.png    — a waterlogged leather ledger book, clasp broken. 512×512.
story_clue_strongbox.png — a barnacled iron strongbox, chain still attached. 512×512.
story_photo_old.png      — a weathered old photograph, curled worn edges, soft
                           sepia image of a harbour (no legible faces). 512×512.
```

---

## Group C — Expansion cast busts (dialogue portraits) · medium priority

*512×512, head-and-shoulders, 3/4 view, warm and expressive, transparent. Match the six existing `char_*_bust` files exactly. Needs a small hook in `portraitFor()` (`src/ui/art.ts:22`) to recognise the new names.*
```
char_blacksmith_bust.png — the village blacksmith/forge-keeper: broad, soot-smudged,
                           kind-eyed. (ties to town_blacksmith).
char_fisherman_bust.png  — a weathered older fisherman, sou'wester hat.
char_librarian_bust.png  — a gentle bookish librarian, spectacles (ties to town_library).
char_child_bust.png      — the sea-child, bright and curious, for her own dialogue beats.
```

*Optional depth — expression variants per lead (needs a story-beat hook):*
```
char_<name>_bust_happy.png / _worried.png / _surprised.png
   for name in {bran, wren, sorin, marta, joss} — same specs as the busts.
```

---

## Group D — Polish (optional) · low priority

### D1 · Ember-heart animation frames (animated energy pill)
*512×512, transparent, an 8-frame gentle flame-flicker loop of the ember-heart. Static states already exist; these add motion (needs a small frame-cycler).*
```
energy_ember_01.png … energy_ember_08.png — one warm ember-heart flame, each
frame a subtle progression of the flicker (lean left, rise, curl right, settle).
Consistent silhouette so the loop reads smooth. Never a lightning bolt.
```

### D2 · Streak-reward tiers
*512×512, transparent. A warmer, fuller hearth per milestone (`action_streak_reward` + `reward_chest` already exist; these are nicer per-tier art).*
```
reward_streak_3.png  — a small kindled hearth, a few days' glow. 512×512.
reward_streak_7.png  — a fuller, brighter hearth, a week's warmth. 512×512.
reward_streak_30.png — a grand roaring hearth wreathed in ember-light. 512×512.
```

---

## Quantity summary

| Group | Priority | Assets | Transparent bg |
|---|---|---|---|
| A · Late-game restoration | **High** | 3 buildings + 7 winter + 7 spring/fair + 5 NPCs = **22** | Yes (all) |
| B · Story clue objects | High | **9** | Yes |
| C · Expansion busts | Medium | 4 (+15 optional expressions) | Yes |
| D · Polish (ember frames + streak tiers) | Low | 8 + 3 = **11** | Yes |
| **Total (core, excl. optional expressions)** | | **~46** | Yes |

## Delivery & wiring

- Deliver to `…\Core\Final Assets\Batch <n>\` (or a new `Batch 16 — Late-game` folder), then run `python tools/slice_assets.py` — but these are **single-subject transparent PNGs**, so they can drop straight into `public/art/<name>.png` and the generated `art-manifest.ts` picks them up; no slicing needed if named exactly as above.
- Verify each on a **light and dark** background (the game composites keyed sprites on dark navy — check the transparent edges don't fringe).
- Group A art is the only set that **blocks** Batch B5 visuals; B/C/D are additive polish and can land anytime.

*Not needed as transparent (full-bleed illustrations, out of scope here): chapter splash art (exists: `chapter_1..6`), letter/journal-page/memory/loading illustrations — those are opaque background images, not cut-out objects.*
