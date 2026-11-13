# Hearth — Upgrade Roadmap

Index of the six upgrade tracks scoped for Hearth beyond the avatar/identity system.
Each track has its own spec document with concrete asset lists and a code sketch.
**Status: partially built** — see the status column and "Built so far" below. Everything built is art-gated, so it works today and upgrades when art lands.

---

## How to read this

Every track follows the pattern proven by the avatar work:

- **Art-gated & drop-in.** Every asset resolves through `artUrl(id)` (`src/art-manifest.ts:682`) and falls back gracefully. Nothing breaks before an asset lands; the moment the PNG is in `public/art/` and the manifest is regenerated, it appears. No code change.
- **Style.** Painterly storybook, warm old-seaside palette. Match `char_*_bust`, `avatar_1..6`, `item_*`, `town_*`.
- **Reduced motion.** Gate on `document.body.classList.contains('reduce-motion')` — **never** the OS media query (Windows reports it by default; migration v17→18 actively scrubs OS-seeded values).
- **No FOMO, no fake countdowns, cosmetics never grant power.** Matches the design note in `src/data/world.ts:309` and the avatar GDD.
- **Pure core.** Deterministic modules take `now` as a parameter — no `Date.now()` inside `src/core`.

---

## The tracks

| # | Track | Doc | Impact | Effort | New assets | Status |
|---|---|---|---|---|---|---|
| **A** | Visual polish (M2 art pass) | [`art-m2-pass-spec.md`](./art-m2-pass-spec.md) | High (consistency) | **Low** | Few (much is wiring only) | 🟡 **Part 1 DONE** (currency wired); rest art-blocked |
| **B** | Photo / Share upgrade | [`photo-share-spec.md`](./photo-share-spec.md) | High (growth) | Low–Med | Frames/backdrops | ⬜ Waits on avatar branch + frame art |
| **C** | Festivals & seasons | [`festivals-spec.md`](./festivals-spec.md) | High | Medium | Banners, dressing | 🟢 **CORE DONE** (art-gated); banners/dressing pending |
| **D** | New minigames | [`minigames-new-spec.md`](./minigames-new-spec.md) | Medium–High | **High** | Per-game art | 🟡 **1 of 2 built** (Bakery); Post Office pending |
| **E** | Audio (M2 audio pass) | [`audio-m2-spec.md`](./audio-m2-spec.md) | Medium–High | Medium | **All audio** | ⬜ Spec only |
| **F** | Real multiplayer/social | [`multiplayer-spec.md`](./multiplayer-spec.md) | Highest | **Highest** | Few | ⬜ Spec only (do last) |

### Built so far (branch `feature/hearth-upgrades`)

- **Track A Part 1** — `currencyIcon()` / `uiIcon()` in `src/ui/art.ts`; painted `res_coin`/`res_energy` now render at 10 innerHTML sites. Toast and `.textContent` sites deliberately keep emoji (HTML would leak as literal text there). Chrome icons intentionally left until `icon_decorate`/`icon_workshop` exist, so the app doesn't end up half-painted.
- **Track D — The Proving (bakery)** — the 8th minigame, first for a building that had none. Seeded, no-fail, reduced-motion-playable, 15 tests. Emoji fallback today; `mg_bg_bakery`/`mg_bake_loaf` slot in later.
- **Track C core** — `src/data/festivals.ts` + `src/core/festivals.ts` (pure, hemisphere-aware, 14 tests) and the festival card + "returning soon" list on the Collect screen. **Fully working with no art**; banners slot in when painted.

### Recommended order

```
[Avatar portraits land + PR merged]      ← do this FIRST, it is code-complete and waiting
   ↓
A  Visual polish        — fast, safe, immediately visible
   ↓
B  Photo / Share        — builds directly on the avatar work
   ↓
★  Analytics sink       — cheap prerequisite (see below)
   ↓
C  Festivals            ‖  E  Audio  (can run in parallel — different disciplines)
   ↓
D  New minigames        — heaviest per unit
   ↓
F  Multiplayer          — largest; needs a backend
```

---

## ★ Prerequisite worth doing before the growth tracks

**Analytics is a no-op stub.** `src/platform/metrics.ts:5` logs a single event per session; there is no real sink wired. Tracks **B, C and F are growth/engagement features whose success is unmeasurable** without it. Wiring a real sink (PostHog / Amplitude / Firebase) is cheap and should come before heavy investment in those tracks.

**Related:** minigame tuning constants are described as "remote-config shaped" but are hardcoded (`src/core/minigames.ts:14`). A live-ops config surface is a natural companion to the analytics work and would let balance be tuned without a release.

---

## Current state of the codebase (honest summary)

What the surveys found, so future sessions don't re-research it:

**Real and well-built:** villager bonds/memories/greetings, town requests, the minigames (8 now, all substantial, seeded, no-fail), true lunar phase (`src/data/moon.ts`), real geolocation-derived season/daylight (`src/ui/weather.ts`), day-spanning weather memory with wetness/snow accumulation (`src/core/weather-history.ts`), the Bonfire Duel (practice vs Old Joss, plus async friend challenges), and the share-card composer.

**Stubbed / simulated (labelled as such in-code):**
- Multiplayer/social — client-side simulation; "They joined" is a tester-gated free-energy faucet (`src/core/social.ts:2`, `src/ui/social-screen.ts:47`).
- Meditation narration — awaiting the M2 audio pass (`src/ui/meditation.ts:4`).
- Motion/rep sensing — honest placeholder, player self-reports (`src/ui/motion-action.ts:4`).
- Analytics sink (above).
- Some item art still emoji (`src/core/types.ts:31`).

**Was missing entirely, now built:** the festival/seasonal-event system — `src/data/world.ts:313` still holds only the daily + weekly rhythms, with festivals living in `src/data/festivals.ts` + `src/core/festivals.ts`.

**Not a gap (verified):** decor pieces and shop skins are intentional — all 11 decor entries map to existing `prop_*`/`tree_*`/`terrain_*` art, and board/town skins are deliberate CSS colour washes, not missing sprites.

---

## Notes on the avatar system (context)

The avatar/identity system is **code-complete** on `feature/avatar-system` (7 commits) and art-gated. It needs only its painted portraits — see [`avatar-assets-to-generate.md`](./avatar-assets-to-generate.md), [`avatar-portrait-art-spec.md`](./avatar-portrait-art-spec.md) and [`avatar-implementation-status.md`](./avatar-implementation-status.md). Landing that first is the recommended next action; several tracks here (B, C) build on it.
