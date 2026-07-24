# Track C — Festivals & Seasonal Events

**Goal:** give Emberhollow a calendar — moments that arrive with the real world's seasons, moons and weather, and that the village visibly dresses for.

**Why this is the strongest new system:** Hearth already computes **real** season/daylight (`src/ui/weather.ts`, from geolocation), **true lunar phase and illumination** (`src/data/moon.ts`), and a **day-spanning weather memory** (`src/core/weather-history.ts`, wetness/snow accumulation). All of that plumbing exists and is currently under-used. Festivals can be genuinely authentic — the village celebrates the solstice because it *is* the solstice where the player is standing.

---

## What exists today

`src/data/world.ts:302-316` defines the whole event system:
```ts
export const EVENTS: readonly WorldEvent[] = [
  { id: 'daily',  name: 'Daily quests', timing: 'Refresh each morning', kind: 'daily' },
  { id: 'weekly', name: 'Your week in Emberhollow', timing: 'A reflection each Sunday', kind: 'weekly' },
];
```
With this design note (`:309`), which the new system **must** respect:

> Honest rhythms only — no fabricated countdowns. Everything here is a true statement about how the game actually unfolds… A fake "Starts in 2d 14h" erodes trust for nothing.

There is **no festival, holiday, solstice or seasonal-event system** of any kind.

---

## Design rules (non-negotiable)

1. **Real triggers only.** A festival is active because a real astronomical/seasonal condition holds — never a fabricated timer.
2. **No countdowns to manufactured urgency.** Honest, factual framing only.
3. **Everything returns.** Every festival recurs annually; nothing is ever permanently missable (matches the avatar anti-FOMO rule).
4. **A "Returning soon" calendar.** Because real triggers are infrequent, show an honest, factual list of what's coming and roughly when ("Midwinter — at the solstice"). This gives anticipation *without* lying, and prevents the system feeling empty between events.
5. **Rewards are cosmetic only.** Never energy-for-attendance, never power. Missing one costs nothing but the moment.

---

## Proposed festivals

| Festival | Real trigger | Feeling |
|---|---|---|
| **Blossomtide** | Spring equinox (± a few days) | The village greens; first warmth |
| **Longlight** | Summer solstice | Longest day, lanterns unlit, sea calm |
| **Harvest Home** | Autumn equinox | Bunting, produce, gratitude |
| **Midwinter Hearth** | Winter solstice | Deep dark, every window lit — the game's namesake moment |
| **Full Moon Tide** | Lunar illumination ≥ ~98% (`src/data/moon.ts`) | Monthly, quiet, silver; ties to Stargaze |
| **First Snow** *(optional)* | `weather-history` snow depth crosses 0 | Rare, emergent, delightful |

Hemisphere is already derived in `weather.ts` — **solstice/equinox must respect it** so southern players get the right season.

---

## New assets

### C1 — Festival banners (primary)
| Field | Value |
|---|---|
| Files | `festival_blossomtide_banner.png`, `festival_longlight_banner.png`, `festival_harvest_banner.png`, `festival_midwinter_banner.png`, `festival_fullmoon_banner.png` |
| Canvas | **1024 × 512** landscape, PNG (opaque or soft-edged) |
| Style | A painted scene of Emberhollow dressed for that festival — same hand as the map plates and building art |
| Use | Home-screen festival card while active; also the source for a share stamp (Track B) |

### C2 — Town dressing overlays (optional, high charm)
| Field | Value |
|---|---|
| Files | `dressing_<festival>_<motif>.png` — e.g. `dressing_harvest_bunting`, `dressing_midwinter_wreath`, `dressing_blossomtide_garland` |
| Canvas | Match the `prop_*` convention; supply `_dawn/_dusk/_night` variants so they live the day cycle like every other town sprite |
| Use | Drawn over/next to buildings while the festival is active — the village visibly dresses up |
| Fallback | Absent → banner only, no dressing (system still works) |

### C3 — Festival keepsake badges
| Field | Value |
|---|---|
| Files | `badge_festival_<name>.png` |
| Spec | Match existing `badge_*` art (11 exist) |
| Use | A permanent record of attending — the "I was there" memento |

### C4 — Festival portraits (ties to the wardrobe)
| Field | Value |
|---|---|
| Files | `avatar_portrait_19+.png` (festival looks) |
| Spec | Exactly per [`avatar-portrait-art-spec.md`](./avatar-portrait-art-spec.md) |
| Use | Returning earnable cosmetics — the avatar system's progression layer. Each becomes a one-line entry in `src/data/avatar-portraits.ts` |

---

## Code sketch

**`src/data/festivals.ts`** — pure defs:
```ts
export interface FestivalDef {
  id: string; name: string; blurb: string;
  art: string;                 // festival_<id>_banner
  when: 'spring-equinox' | 'summer-solstice' | 'autumn-equinox' | 'winter-solstice' | 'full-moon';
  windowDays?: number;         // e.g. ±2 days around the astronomical date
  reward?: { badge?: string; portrait?: string };
}
```

**`src/core/festivals.ts`** — pure, deterministic, **takes `now` as a parameter** (repo convention — no `Date.now()` in core):
```ts
export function activeFestival(now: number, lat: number | null, moonIllum: number): FestivalDef | null
export function upcomingFestivals(now: number, lat: number | null): { def: FestivalDef; approx: string }[]
```
- Solstice/equinox dates computed (or table-driven per year) and **hemisphere-flipped by latitude sign**.
- Full moon from the existing `src/data/moon.ts` illumination value.
- No side effects; fully unit-testable at fixed timestamps.

**UI:** a Home festival card (banner + name + blurb + the honest "returning soon" list), and art-gated dressing in `map-view.ts`'s draw loop alongside the existing prop rendering.

**Game wiring:** optional `{ type: 'festival'; id: string }` event when a keepsake is first granted; store attended festival ids on the save (a small optional array — follow the `discovered?: readonly string[]` precedent so no presence-guard change and no forced migration break).

**Reduced motion:** any banner shimmer or dressing sway must check `body.reduce-motion` and render static.

---

## Acceptance checklist
- [ ] `activeFestival()` unit-tested at known solstice/equinox/full-moon timestamps, **both hemispheres**
- [ ] Home shows the festival card only while genuinely active; "returning soon" list is factual
- [ ] Town dressing appears when art exists, absent cleanly when it doesn't
- [ ] Keepsake badge granted once, recorded on the save; nothing is ever permanently missable
- [ ] No countdown timer anywhere; no energy/power reward
- [ ] Reduced-motion renders static
- [ ] `npx tsc --noEmit`, `npx vitest run` green
