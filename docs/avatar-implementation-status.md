# Hearth Avatar System — Implementation Status & Remaining Scope

Living checklist for the player avatar/identity system. Companion to the design
GDD (`OneDrive/…/00-Hearth-Avatar-and-Identity-System-GDD.md`) and the art brief
(`docs/avatar-portrait-art-spec.md`). Branch: `feature/avatar-system`.

---

## ✅ Done (built, tsc+eslint clean, 421+11 tests green)

| Area | What | Files |
|---|---|---|
| **Data model** | `AvatarConfig { created, name?, pronouns?, portrait }`, optional on `GameState` | `core/types.ts` |
| **Portrait catalogue** | 18 bespoke ids + 6 fallbacks; art-gated so entries appear only when art exists | `data/avatar-portraits.ts` |
| **Model logic** | `defaultAvatar`, `normalizeAvatar` (coerces unknown → present portrait) | `core/avatar.ts` |
| **Save** | v18→**v19** migration, seeds neutral (created:false); no forced interruption | `core/save.ts` |
| **Game API** | `game.avatar` (normalised getter), `game.setAvatar(cfg)` + `{type:'avatar'}` event | `core/game.ts` |
| **Renderer** | Painted bust as circular background-image (matches villager busts), optional frame | `ui/avatar-render.ts` |
| **Picker** | Calm portrait grid + name; accessible modal (role=dialog, Esc, focus return) | `ui/avatar-creator.ts` |
| **Onboarding** | FTUE "Choose your look" beat after Welcome (Bran-framed); opens picker | `ui/ftue.ts` |
| **Retrofit** | Once-only gentle nudge for existing saves without an avatar | `ui/avatar-creator.ts` + `ui/app-shell.ts` |
| **Profile surface** | "You" identity card on the Villagers screen (portrait + name, tappable) | `ui/social-screen.ts` |
| **Home cameo** | Player-face medallion on the home map overlay, tap to change | `ui/home.ts` + `index.html` |
| **Settings surface** | "Your look" row (mirror access) shows live bust, opens picker | `ui/settings.ts` |
| **Arrival art hook** | Welcome step uses painted `ftue_arrival` backdrop if present (drop-in) | `ui/ftue.ts` |
| **Tests** | model, normalization, catalogue, migration, persistence, event | `tests/avatar.test.ts` |

**Wardrobe decision (locked):** portrait-only. "Cosmetics/progression" = additional
earnable *painted portraits*, not clothing layers — so **no per-garment art is ever
needed**, and the Tailor's Cottage unlocks portraits. See `avatar-assets-to-generate.md`.

**Test now:** `pnpm dev` → new game shows the "Choose your look" step; or ⚙ Settings / Villagers "You" card. Persists across reload. Falls back to `avatar_1..6` until the painted set lands.

---

## 🎨 Drop-in graphics — everything is manifest-gated

**The golden rule:** every avatar art reference goes through `artUrl(id)` and degrades gracefully when the PNG is absent. To add art: drop the PNG in `public/art/`, regenerate the manifest (Python slicer), done — **no code change**.

### Art the system consumes

| Art id(s) | Used by | Spec | If missing |
|---|---|---|---|
| `avatar_portrait_01` … `avatar_portrait_18` | The picker (primary set) | 512² transparent frameless painted bust; face upper-third (see `avatar-portrait-art-spec.md`) | Falls back to `avatar_1..6` |
| `avatar_1` … `avatar_6` (existing) | Fallback portraits | already in repo | — |

### Art hooks reserved for upcoming work (generate later, they'll slot in)

| Art id | For | Notes |
|---|---|---|
| `char_pell_bust` (or chosen name) | Tailor villager bust | Same style as `char_*_bust`, 90²+ |
| `town_tailor` + `_ruin/_wip/_l1/_l2/_l3` + `_dawn/_dusk/_night` | Tailor's Cottage building | Follows the building matrix sheet convention (see `tools/import_map_v2.py`) |
| `avatar_frame` (optional) | Painted frame overlay for profile/cards | Enhancement; CSS ring is the fallback |
| `ftue_arrival` (optional) | Painted harbour-arrival backdrop for the welcome | Enhancement; current welcome uses `splash_emblem` |
| `cosmetic_*` / item sheets | Wardrobe cosmetics (later phase) | Only if/when layered cosmetics ship |

---

## ⬜ Remaining scope (ordered; each independently shippable)

### 1. Painted portrait set  — **BLOCKED ON ART (you)**
Generate `avatar_portrait_01..18` per `avatar-portrait-art-spec.md`, drop in `public/art/`, regen manifest. Picker + all surfaces upgrade automatically. *No code work.*

### 2. Player bust in more surfaces — ✅ DONE (home cameo + You card + Settings)
Remaining optional: reward/achievement cards could show your face when *you*
earned it (low value; deferred). Player has no spoken dialogue line, so no
map-view dialogue bust.

### 3. Tailor's Cottage — ✅ CODE DONE (art-gated; drop in the sprite to activate)
- Building `town_tailor` added to `data/town-layout.ts`, **art-gated** — it joins the
  town only when its sprite exists, so nothing breaks meanwhile (tests stay green).
- Restores at **order 14**; `BUILDING_INFO` + `returnsAt` (via `SPECIAL_RETURNS`) registered.
- Building card shows a **"Choose your look" / "Change your look"** button that opens the
  picker (`map-view.ts` `showBuilding` + `#bldg-wardrobe` in `index.html`).
- **To activate:** generate `town_tailor` matrix sheet (+ optional `char_pell_bust` villager)
  per `avatar-assets-to-generate.md` §P2, drop in, regen manifest. Then validate the anchor
  (x 0.235 / y 0.60) against `tests/town-layout.test.ts` spacing and nudge if needed.

### 3b. Older deferred note (superseded by #3 above)
- New restorable building `town_tailor` in `data/town-layout.ts` (`unlockAt`, ruin→L1..3), `BUILDING_INFO` entry.
- Its card opens the picker/wardrobe (map-view building-card hook ~`map-view.ts:1042`).
- New tailor villager `VillagerDef` + friendship gift.
Depends on: building art (matrix sheet). Risk: art volume + balancing where it slots in the order.

### 4. Cosmetic merge chains + dyes — large (needs #3 + cosmetics system)
- Fabric/dye/trim chains producing deterministic garment/swatch/accessory tokens.
- Requires a cosmetics/wardrobe layer beyond single-portrait (the layered model, deferred in the GDD). **Decide portrait-only vs layered before starting.**

### 5. FTUE arrival cinematic — small/medium (polish)
- Scripted map-camera pan over the storm-broken harbour before/around the Welcome step; reduced-motion → crossfade of static framings (`body.reduce-motion`, never the OS query).
- Optional `ftue_arrival` backdrop art.

### 6. Social/viral (post-core) — medium
- Profile/friend cards, photo mode, share (GDD §10). Portrait renderer already the primitive.

---

## Guardrails (don't regress)
- Reduced motion = `document.body.classList.contains('reduce-motion')` **only**, never the OS media query (migration scrubs OS-seeded values).
- Art cache `maxEntries: 500` with ~680 ids — if shipping many cosmetic PNGs, prefer atlas sheets and/or a dedicated cache (`vite.config.ts`).
- Cosmetics are **never** power; identity options are **never** gated; nothing FOMO.
- `exactOptionalPropertyTypes` — never assign explicit `undefined` to optional fields.
