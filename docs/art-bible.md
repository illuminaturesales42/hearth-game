# Hearth — Art Bible & Asset Generation List

Everything the game renders, with a shared style guide and per-category prompt recipes for an SDXL / ComfyUI pipeline (RealVisXL V5 / Juggernaut XL v9 + IPAdapter for consistency). Filenames match the code IDs so finished assets drop straight in.

---

## 1. Master Style Guide

**One line:** cozy coastal storybook — hand-painted, warm evening light, a village worth coming home to. Think *Alto's Odyssey* warmth × *Gossip Harbor*/*Merge Mansion* readability × a painted children's-book cover.

### Rendering
- **Technique:** hand-painted digital illustration, soft painterly brushwork, gentle rim light, subtle canvas/paper texture. NOT flat vector, NOT 3D render, NOT cel-shaded anime, NOT photoreal.
- **Edges:** soft but readable silhouettes; icons read clearly at 96 px.
- **Lighting:** warm key light (amber/gold) from upper-left, cool fill (dusk blue). Every asset feels lit by a hearth or a low sun. Soft ambient occlusion, gentle glow on light sources.
- **Depth:** shallow, storybook staging; slight top-down-front ¾ angle for buildings and props.

### Palette (lock these — one family across the whole app)
| Role | Hex | Use |
|------|-----|-----|
| Night navy | `#0f1626` / `#16203a` | app ground, sky tops |
| Warm panel | `#1b2138` / `#232a45` | cards, sheets |
| Parchment | `#ecdcb6` / `#d9c496` | order cards, paper |
| Wood frame | `#6b4a2a` | card borders, timber |
| Ember gold (accent) | `#f4a63b` / `#ffd27a` | light, highlights, CTAs |
| Ember deep | `#e5761e` | flame cores |
| Sea teal (secondary) | `#4f8698` | water, cool accents |
| Cream ink | `#f4ecd8` | light text on dark |
| Ink brown | `#3a2817` | text on parchment |
| Leaf green | `#3a5a34` / `#7fbf6a` | gardens, growth |

Warm/gold dominant; teal is a supporting cool, never a second accent. Keep saturation moderate — painted, not neon.

### Universal negative prompt
`flat vector, sterile, 3d render, cgi, plastic, neon, oversaturated, harsh contrast, anime, manga, cel shaded, photograph, text, watermark, signature, ui frame, drop shadow box, low detail, blurry, jpeg artifacts, extra fingers, deformed`

### Consistency workflow (important)
- Generate one **hero reference** per category first (e.g. the "A Place to Call Home" cottage, the Bran portrait). Approve it, then use **IPAdapter (plus) + a fixed style prompt** to keep every sibling on-model.
- Keep a **fixed seed per category** for silhouette consistency; vary only the subject clause.
- For icon sets, use **ControlNet (canny/lineart)** off a rough silhouette so all N levels share footprint and scale.
- Prefer **transparent PNG** for props/icons/characters (generate on flat `#151b2e`, then background-remove) and **opaque** for scenes/banners.

### Export specs
- **Merge item icons:** 512×512 source → ship 192×192 @2x, transparent PNG, subject centered with ~12% padding, consistent ground-shadow ellipse.
- **Character portraits:** 512×512, transparent, head-and-shoulders, same crop line.
- **Scene / banner art:** see per-asset dimensions; opaque, safe-area aware.
- **Naming:** kebab-case matching code, e.g. `item-wood-3.png`, `char-bran-neutral.png`, `stage-2.png`, `icon-steps.png`.

---

## 2. Merge Item Icons  (18 base — highest priority)

512×512 transparent, painted prop on a soft warm ground-shadow. Same light direction and scale across a chain. **Prompt skeleton:**
> painted storybook game icon, {SUBJECT}, cozy coastal village craft, warm amber rim light on dusk-blue fill, soft brushwork, subtle paper texture, centered, clean silhouette, transparent background --neg {universal}

### Timberline chain (`item-wood-0..6`)
| ID | File | Subject |
|----|------|---------|
| 0 | item-wood-0 | a small green sapling in dark soil |
| 1 | item-wood-1 | a stack of two cut timber logs, bark texture |
| 2 | item-wood-2 | a smooth sawn wooden plank |
| 3 | item-wood-3 | a carpenter's wooden mallet/hammer, worn handle |
| 4 | item-wood-4 | a simple hand-made wooden chair |
| 5 | item-wood-5 | a rustic wooden cottage door with iron hinges |
| 6 | item-wood-6 | a tiny complete fisherman's cottage, warm lit window |

### Harvest chain (`item-harvest-0..6`)
| 0 | item-harvest-0 | a golden bundle of wheat |
| 1 | item-harvest-1 | a rustic crusty loaf of bread |
| 2 | item-harvest-2 | a golden-crust fruit pie |
| 3 | item-harvest-3 | a small iced celebration cake |
| 4 | item-harvest-4 | a woven picnic basket of food |
| 5 | item-harvest-5 | a laden feast platter |
| 6 | item-harvest-6 | a golden village-fair prize trophy |

### Hearthfire chain (`item-hearthfire-0..3`)
| 0 | item-hearthfire-0 | a single lit beeswax candle, warm flame glow |
| 1 | item-hearthfire-1 | a warm-glowing hand-lantern |
| 2 | item-hearthfire-2 | a small stone hearth with a live fire |
| 3 | item-hearthfire-3 | a lit coastal beacon brazier, strong golden glow |

> Reserve `item-<newchain>-*` for M2 chains (Sea-goods, Flowers) — same recipe.

---

## 3. Homestead Progression  (5 scenes — Map showpiece)

1024×768 opaque, painted ¾ view of a single coastal cottage plot, dawn→golden-hour sky, headland + sea behind. Same camera and composition across all five; only the build state changes. **File `stage-0..4.png`.**

| Stage | File | Scene |
|-------|------|-------|
| 0 Storm-Wrecked | stage-0 | storm-battered bare timber frame, scattered debris, grey dawn, cold sea |
| 1 Rebuilding Begins | stage-1 | half-built walls, wooden scaffolding, tools, first warm light in sky |
| 2 A Place to Call Home | stage-2 | finished cottage, roof, one lit window, chimney, warmer sky |
| 3 A Flourishing Haven | stage-3 | cottage with flower garden, path, fence, lit windows, chimney smoke, golden light |
| 4 Beacon of Emberhollow | stage-4 | upgraded cottage + a lit lighthouse beacon sweeping, full golden hour, calm glowing sea |

Shared style clause: *painted storybook coastal homestead, warm hand-painted illustration, cozy, cinematic evening light, high detail, no text.*

---

## 4. Character Portraits  (5 cast × 3 expressions ≈ 15)

512×512 transparent, painted head-and-shoulders, storybook realism (like a painted novel cover, not anime), same crop and lighting. **File `char-<id>-<expr>.png`**, expr = `neutral | happy | worried`.

| ID | Who | Look |
|----|-----|------|
| bran | Bran, the baker | warm, gruff older man, flour-dusted apron, kind eyes, greying beard |
| wren | Wren, postmistress | sharp, curious woman 30s, coat, satchel of letters, alert |
| sorin | Sorin, old keeper | weathered elderly lighthouse keeper, bitter but softening, oilskin |
| marta | Marta | woman returned from the sea, windworn, guarded warmth, salt-tangled hair |
| joss | Fisher Joss | stocky fisherman, oilskin coat, sea-roughened, wry |

Prompt skeleton:
> painted storybook character portrait, {LOOK}, coastal fishing village, warm lantern light, soft painterly brushwork, gentle expression ({EXPR}), head and shoulders, transparent background --neg {universal}, anime, cartoon, 3d

---

## 5. Friend Avatars  (6)

256×256 transparent circular-safe, painted friendly villager bust, distinct palette per slot (`av-1..6` map to warm-peach, sky-blue, leaf-green, violet, gold, rose in code). Generic cozy villagers, diverse, storybook. **File `avatar-1..6.png`.**

---

## 6. Energy Action Icons  (16)

192×192 transparent, painted single-object icon with a soft ember glow, readable at small size. **File `icon-<id>.png`.**

| ID | Subject |
|----|---------|
| steps | painted walking boots mid-stride |
| stairs | a short flight of stone steps |
| sleep | a crescent moon over a soft pillow |
| water | a glass of clear water, light through it |
| photo-outside | a little painted camera |
| squats | a figure mid-squat, dynamic |
| sunrise-photo | a sun cresting the horizon over water |
| sunset-photo | a sun sinking into the sea, warm |
| nature-photo | a green leafy sprig |
| stretch | a figure reaching up, stretching |
| breathe | soft concentric breath rings / breeze |
| meditate | a seated figure in calm meditation |
| cold-plunge | an icy plunge tub / ice cube splash, cool blue |
| sauna | a warm sauna hut with steam, ember tones |
| gratitude | an open journal with a warm quill |
| flashback | a glowing remembered moment / soft sunburst memory |

---

## 7. UI & System Icons  (≈14)

96–128 px transparent, painted but simple; must read in the HUD and bottom nav. **File `ui-<id>.png`.**

- Bottom nav: `ui-shop` (market stall), `ui-map` (rolled map), `ui-home` (hearth flame), `ui-villagers` (two figures), `ui-journal` (book).
- Currency/state: `ui-coin` (gold coin), `ui-energy` (ember flame), `ui-heart` (warm heart), `ui-chest` (treasure chest closed + open variant), `ui-gift` (wrapped parcel).
- Order card: `ui-order-star`, `ui-deliver`, `ui-trash`.
- Misc: `ui-lock` (padlock, for locked map spots), `ui-check` (soft tick).

---

## 8. Scene Backgrounds & Banners  (≈7)

Opaque, painted, safe-area aware.

| File | Size | Content |
|------|------|---------|
| banner-harbour | 880×280 | Emberhollow harbour at sunset (Home top banner) — lighthouse, town, boats, warm sky |
| bg-energy | 880×1200 | soft dark hearth-room backdrop for the Energy sheet, low ember glow |
| bg-meditation | 1080×1920 | calm dusk sea + starfield, very soft, for the meditation player |
| bg-camera-frame | overlay | painted vignette corners for the capture viewfinder |
| bg-story | 720×480 | warm fireside vignette behind story-beat modals |
| card-order-frame | 9-slice | carved wooden frame + parchment fill for the order card |
| tex-parchment | tileable | subtle aged-paper texture for panels |

---

## 9. Map Location Vignettes  (6)

360×240 opaque painted mini-scenes for the location list. **File `loc-<id>.png`.**
`loc-lighthouse`, `loc-bakers-row`, `loc-market`, `loc-pier`, `loc-north-docks`, `loc-quarry` — each a small painted view of that spot, matching the harbour palette, with a "locked" grayscale-fog variant auto-derivable in code.

---

## 10. Collections, Events & Chapters

- **Collection crests (4):** `coll-timberline`, `coll-harvest`, `coll-hearthfire`, `coll-decor` — small painted emblem per set, 128×128.
- **Event banner:** `event-festival-of-lights` — 880×360, lanterns strung over the harbour at night, warm.
- **Chapter thumbnails (8):** `chapter-1..8.png`, 320×200, painted key scene per chapter (letter on notice board, boats, lighthouse, northern shoals, the ninth night, the choice, return of the light) — matches the season-arc board.

---

## 11. App Store & Launch

- `app-icon` 1024×1024 — the hearth flame in a cozy cottage window, warm on dark; instantly readable at 60 px.
- `splash` 1284×2778 — Emberhollow at dusk, title lockup space top third.
- `feature-graphic` 1024×500 (Play) and 6× screenshots framed.

---

## 12. Generation Priority

1. **Merge items (18)** + **homestead stages (5)** — the screens players stare at.
2. **UI/nav + currency icons (14)** — makes the shell feel finished.
3. **Character portraits (15)** + **order-card frame** — story presence.
4. **Action icons (16)** — replaces emoji in the Energy panel.
5. **Backgrounds/banners**, **avatars**, **map vignettes**.
6. **Collections/events/chapters**, then **store assets**.

Total first-playable art pass ≈ **60–70 assets**; full set ≈ **110**.

---

## 13. Handoff to code

Drop finished PNGs into `apps` `public/art/<category>/` and we swap emoji/canvas for `<img>`/sprite lookups keyed by the same IDs (`item-wood-3`, `stage-2`, `char-bran-neutral`…). The homestead stages plug in behind `MapView.stage()`; merge icons behind `chainDef().levels`; action icons behind the `EnergyAction.icon` field. No gameplay changes required — pure asset swap.
