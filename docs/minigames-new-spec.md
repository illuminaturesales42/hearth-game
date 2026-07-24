# Track D — New Minigames

**Goal:** give more of Emberhollow's buildings a door that opens.

**Honest framing:** this is the **most expensive track per unit** in the roadmap. Each game is bespoke interactive logic — not a data entry. The seven existing games are all substantial (seeded pegfields, rhythm lanes, fog-of-war grids); a new one must meet that bar or it will feel like filler.

---

## What exists today

**Engine** `src/core/minigames.ts` — deterministic/seeded, **no-fail**, daily attempt token + ember cap. **Catalogue** `src/data/minigames.ts` (`MinigameDef`). **UI** `src/ui/minigames.ts` — each game is a self-contained interactive with a reduced-motion fallback.

| Game | Building | Mechanic |
|---|---|---|
| The Wishing Well | `prop_well` | 3-pebble ring multiplier |
| Beacon Drop | `prop_lighthouse` | Aimed plinko, seeded symmetric pegfield |
| Strike While Hot | `town_blacksmith` | Forge whack-a-mole, 3 waves |
| Joss's Catch | `town_fisherhut` | Bobber timing + reel stage |
| Foraging Expedition | `town_garden` | 5×5 fog dig, Chebyshev "warmth" |
| Sorting the Stacks | `town_library` | Memory pairs, hidden ramp |
| The Saw Song | `town_sawmill` | 5-lane rhythm, holds/chords/finale |

**Buildings with no game:** `town_bakery`, `town_market`, `town_tailor`, `town_farm`, `town_dock`, `town_postoffice`, `town_cottage`, `town_townhall`, `town_workshop`.

**Housekeeping:** the header of `src/data/minigames.ts` says *"Wave 1 ships three; the rest follow"* — **stale**, all seven are implemented. Fix when touching the file.

---

## Design rules (match the existing seven)
1. **No-fail.** A poor round still yields a reward; never punish.
2. **Seeded/deterministic.** Same seed → same layout, so runs are testable and fair.
3. **Daily token + ember cap.** Reuse the existing gating; never a grind faucet.
4. **One clear verb.** Each game is one idea a player understands in three seconds.
5. **Reduced-motion path.** A static/tap-driven fallback that is still *playable* — never a dead screen. (The reduced-motion regression that broke every minigame is why save v18 exists — do not repeat it.)
6. **Thematic reward.** The reward chain should be what that building would actually produce.

---

## Recommended first two

### D1 — **The Proving** (Bakery, `town_bakery`)
**Verb:** "Mind the oven" · **Reward:** harvest/bread resources

**Concept:** three loaves prove and bake at their own seeded rates. Each has a rising "doneness" meter; tap to pull a loaf at its peak. Pull early → underdone (small reward), pull late → dark (still rewarded — no-fail, and a wry line from Bran). The tension is watching three meters at once, not reflexes.

**Why it fits:** timing-based but *gentle and forgiving*; thematically perfect; distinct from every existing game (no aiming, no rhythm, no memory).

**Reduced motion:** meters advance in discrete labelled steps on tap/tick rather than a continuous animation.

**Assets:** `mg_bg_bakery` (oven interior), `mg_bakery_loaf_raw`, `_proving`, `_golden`, `_dark`, `mg_bakery_peel` (the paddle).

### D2 — **The Sorting Room** (Post Office, `town_postoffice`)
**Verb:** "Sort the post" · **Reward:** keepsakes / coins

**Concept:** letters slide in bearing a destination mark (a fish = Joss's hut, a loaf = the bakery, a book = the library…). Drag/tap each into the matching pigeonhole. Speed is optional; accuracy is rewarded; unsorted letters simply return tomorrow. Later rounds add letters addressed to villagers by *name*, so the game quietly teaches the cast.

**Why it fits:** Wren is the postmistress and the story literally opens with a letter; it is a *categorisation* mechanic — a genuinely new verb for the set. It also strengthens villager recognition.

**Reduced motion:** letters queue statically; tap letter → tap pigeonhole, no sliding.

**Assets:** `mg_bg_sorting` (sorting room), `mg_post_letter_<mark>` (one per destination mark, ~6), `mg_post_pigeonhole`.

### D3 (thematic tie-in) — **The Pattern Table** (Tailor, `town_tailor`)
**Verb:** "Cut the cloth" · **Reward:** cloth / a portrait unlock token

Match a printed pattern by choosing fabric swatches in the right arrangement — a colour/shape matching puzzle. **Directly feeds the wardrobe** (see the avatar system): a good run can grant a festival/earnable portrait. Worth doing *after* the Tailor's Cottage art lands, since that building is already wired and art-gated.

**Assets:** `mg_bg_tailor`, `mg_tailor_swatch_<n>`, `mg_tailor_pattern_<n>`.

---

## Remaining buildings — one-line concepts
- **`town_market`** — *Market Day*: haggle/stock balancing; set prices against seeded demand.
- **`town_farm`** — *Sowing*: plan a planting grid against seeded soil/sun; harvest resolves.
- **`town_dock`** — *Tide and Tackle*: load crates onto a boat within a stability/balance limit.
- **`town_workshop`** — *The Commission*: assemble a piece from parts under a seeded blueprint.
- **`town_townhall`** — *The Ledger*: reconcile village records (number/matching puzzle).
- **`town_cottage`** — probably **leave alone**; it's Marta's home and story-sacred.

---

## Asset spec (per game)

| Field | Value |
|---|---|
| Background | `mg_bg_<game>.png` — matches the existing 7 `mg_bg_*` (same canvas/aspect as e.g. `mg_bg_forge`) |
| Tokens | `mg_<game>_<token>.png`, transparent, sized to the existing token art (cf. `mg_forge_hammer`, `mg_forage_leaf`, `mg_peg_gold`) |
| Style | Painterly storybook, matching the existing minigame art exactly |
| Building card art | **None needed** — the building sprite already exists |
| Fallback | Tokens fall back to emoji via the existing helpers; a missing `mg_bg_*` should leave a plain warm panel, never a broken screen |

---

## Code sketch (per game)

1. **Catalogue** — add a `MinigameDef` to `src/data/minigames.ts`:
   ```ts
   { id: 'proving', buildingArt: 'town_bakery', title: 'The Proving',
     verb: 'Mind the oven', blurb: '…', unlock: 'l2' }
   ```
2. **Engine** — reward wiring in `src/core/minigames.ts`: map the outcome to a resource chain, respect the daily token + ember cap, keep it seeded and pure.
3. **UI** — a self-contained interactive in `src/ui/minigames.ts` following the existing games' structure, **including the reduced-motion branch**.
4. **Tests** — deterministic seeded runs in the style of `tests/minigames.test.ts`: same seed → same layout; no-fail invariant (reward > 0 for a worst-case run); cap respected.
5. **Gating** — `unlock: 'story' | 'l2'` (`'l2'` asks the building be cared for first).

---

## Acceptance checklist (per game)
- [ ] Playable from its building card once unlocked
- [ ] Seeded: same seed → identical layout (unit-tested)
- [ ] No-fail: a worst-case run still rewards
- [ ] Daily token + ember cap respected
- [ ] **Reduced-motion mode is playable**, not a dead screen
- [ ] Art-gated: missing `mg_*` degrades gracefully
- [ ] Stale "Wave 1 ships three" header corrected
- [ ] `npx tsc --noEmit`, `npx vitest run` green
