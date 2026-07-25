# Track A — Visual Polish ("M2 art pass")

**Goal:** replace the emoji/CSS fallbacks that are still the *live* visual with painted art, so the game reads as one crafted piece.

**Why this is the best first track:** it is nearly all low-risk, and **a large portion needs no new art at all** — the sprites already exist in the manifest and simply aren't wired up. Verified against `src/art-manifest.ts`.

---

## How the fallback system works

Every UI call is "painted sprite if the id exists, else emoji" — e.g. `tileMarkup()` (`src/ui/art.ts:11`), `itemIconInline()` (`:63`), `actionIcon()` (`:50`). So an upgrade opportunity is any place where **the fallback path is what players actually see**.

---

## Part 1 — Zero new art needed (pure wiring) ⚡ do these first

These sprites **already exist** in `public/art/`. The code just doesn't use them.

| Existing art id | Currently rendered as | Where |
|---|---|---|
| `res_coin` | `🪙` emoji in text | `screens.ts:233,272,292,305,312,343`; `map-view.ts:903,1010`; `minigames.ts:359`; `core/achievements.ts:158` |
| `res_energy` | `🔥` emoji in text | `minigames.ts:361,363,1307`; `core/achievements.ts:158`; `home.ts:158` |
| `icon_close` | `✕` text | `map-view.ts:690` |
| `icon_search` | `🔍` text | `map-view.ts:1220` (zoom control) |
| `icon_check` | `✓` text | `map-view.ts:4090` |
| `icon_quest` | `📜` text | `map-view.ts:4078` |

**Code sketch:**
```ts
// src/ui/art.ts — mirrors the existing itemIconInline() pattern
export function currencyIcon(kind: 'coin' | 'energy', cls = 'inline-ico'): string {
  const url = artUrl(kind === 'coin' ? 'res_coin' : 'res_energy');
  return url ? `<img class="${cls}" src="${url}" alt="" />`
             : `<span class="inline-glyph">${kind === 'coin' ? '🪙' : '🔥'}</span>`;
}
export function uiIcon(id: string, fallback: string, cls = 'ui-ico'): string {
  const url = artUrl(id);
  return url ? `<img class="${cls}" src="${url}" alt="" />` : `<span class="${cls}">${fallback}</span>`;
}
```
Then replace the emoji literals at the sites above. **Highest bang-for-buck in the whole roadmap** — currency appears on nearly every screen.

⚠ Check `res_coin`/`res_energy` legibility at inline text size (~18–22px). If the full-size painted sprite muddies, generate a simplified small variant (see Part 2).

---

## Part 2 — New art required

### 2.1 `item_seaweed_0` … `item_seaweed_3` — **highest visual priority**
The `seaweed` chain (`src/data/economy.ts:83`) is the **only merge chain with no painted art** — confirmed absent from the manifest. It renders raw emoji `🌿 🍃 🌊 🧺` on the board while every other chain shows painted sprites.

| Field | Value |
|---|---|
| Files | `item_seaweed_0.png` … `item_seaweed_3.png` |
| Spec | Match the existing `item_*` merge-tile sheet exactly (same canvas, padding, ground shadow, render weight) |
| Subjects | 0 = a frond of seaweed · 1 = kelp bundle · 2 = long kelp strand/coil · 3 = kelp in a woven basket |
| Palette | Muted sea greens/browns; must sit beside `item_wood_*`, `item_harvest_*` without standing out |
| Code | **None** — `tileMarkup()` picks it up automatically |

### 2.2 Wellness medallions — 2 missing
`ACTION_ART` (`src/ui/art.ts:28`) maps action ids to painted medallions, but two ids **share unrelated art**:
- `stargaze` → currently `action_sleep`
- `gratitude` → currently `action_journal`

| Files | `action_stargaze.png`, `action_gratitude.png` |
|---|---|
| Spec | Match the existing `action_*` medallion set (17 exist) — same shape, framing, palette |
| Subjects | Stargaze: night sky / stars over the headland. Gratitude: a warm open hand / heart motif |
| Code | Update the two entries in `ACTION_ART` |

*(Note: `stairs`→`action_exercise` and `squats`→`action_exercise` also share art. That reuse is defensible — both are exercise — but dedicated art would be a further polish.)*

### 2.3 Progress pips — hearts & stars
Affection and tier indicators are text glyphs:
- `♥`/`♡` — building care (`map-view.ts:1056`), villager trust toast (`core/achievements.ts:125`)
- `★`/`☆` — upgrade tiers (`map-view.ts:1000`)

| Files | `pip_heart_on.png`, `pip_heart_off.png`, `pip_star_on.png`, `pip_star_off.png` |
|---|---|
| Spec | ~32×32, transparent. **Crafted icon art, not AI-painted** (see pipeline warning below) |
| Style | Simple, warm, readable at 14–18px; "off" = soft outline, "on" = filled + gentle glow |

### 2.4 UI chrome — 2 missing icons
| Files | `icon_decorate.png`, `icon_workshop.png` |
|---|---|
| Replaces | `🪴` (`screens.ts:318`, `map-view.ts:917`), `⚒` (`app-shell.ts:140`) |
| Spec | Match the existing `icon_*` set (20 exist — same size, stroke weight, palette) |

### 2.5 Distinct achievement badges
All 14 achievements render painted (`screens.ts:326`), but the 7 `badge_event_*` sprites are **reused across different achievements** — e.g. `badge_event_1` serves both `first-merge` and `ch4-complete`.

| Files | 8 distinct badges for the story/chapter achievements, e.g. `badge_ch1` … `badge_ch5`, `badge_first_merge`, … |
|---|---|
| Spec | Match existing `badge_*` (11 exist, incl. `badge_habit_hero`, `badge_merge_master`) |
| Content | Each should depict *its own* milestone so the collection wall reads as a record, not a repeat |
| Code | Update the `art` field per achievement in `src/core/achievements.ts` |

---

## ⚠ Pipeline warning — small assets need a different process

The portrait pipeline (AI-painted, 512px) is **the wrong tool** for items 2.3 and 2.4. AI generation is unreliable at 16–32px: it produces mush, inconsistent stroke weights, and off-palette edges.

- **Use crafted icon art (vector → PNG export)** for: pips, UI chrome icons, and any simplified inline currency variant. Consistency of stroke weight and silhouette matters far more than painterly texture at this size.
- **The painted-sheet pipeline is right** for: `item_seaweed_*`, `action_*` medallions, and badges — these are larger and belong to existing painted sets.

---

## Acceptance checklist
- [ ] Part 1 wiring done — currency and chrome show painted art, emoji only when an id is absent
- [ ] `item_seaweed_0..3` in `public/art/`, manifest regenerated, board shows painted seaweed
- [ ] `action_stargaze` / `action_gratitude` added + `ACTION_ART` updated
- [ ] Pips and 2 chrome icons in place
- [ ] 8 distinct story badges wired in `achievements.ts`
- [ ] **Delete-art test:** temporarily remove each new PNG → UI falls back to emoji without error
- [ ] `npx tsc --noEmit`, `npx vitest run`, eslint clean on touched files
