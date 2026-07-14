# HEARTH — Repository screen + Map rework

*Spec v1.0 · 2026-07-14 · repo `F:\Mastermind launch\hearth` · author: Claude (opus-4-8) for Teddy*

Two user-reported gaps from Village Life play-testing:

1. **"Won items don't go anywhere."** Mini-game (and duel) rewards bank into a shared `repository`, but there is no screen to *see* it — the only consumer is a silent auto-check against the current story order. Post-story that order is usually an endless town-need, so the loot feels like it vanishes.
2. **"Map needs to be much larger… Wishing Well should be its own feature page."** The town is a single small always-on canvas; small props (the well) are hard to find and tap, and there's no way to focus on one building.

These are independent and shippable separately. **Repository first** (smaller, unblocks the loot loop and the "never-sold" economy pillar), **Map rework second** (larger, mostly presentation).

---

## Current state (verified in code)

- `GameState.repository: readonly RepositoryItem[]` — `{ chain: ChainId, level: number, count: number }` (`core/types.ts:173`).
- Written by `finishMinigame()` and `resolveDuel()` via `addToRepository()` (`core/game.ts:1041,1194`).
- Consumed ONLY by `canDeliverFromRepository()` / `deliverFromRepository()` (`core/game.ts:1024–1065`), which match against `currentOrder().need` (chain+level). Duel results screen surfaces a "Deliver" button when it matches (`ui/duel.ts:36,187`); nothing else shows the contents.
- Endless orders (`data/endless.ts`) only ask for `POOL = ['wood','harvest','keepsake','hearthfire']` — deliberately NOT the mini-game chains (fish/copper/honey/books/seeds/flowers), so mini-game loot is **collectible reward**, not order fodder. This is by design ("mini-game chains are collectible rewards").
- The **"Collect" nav tab already exists** → `#screen-shop`, rendered by `renderShop()` (`ui/screens.ts:158`). It currently shows Market (skins/beautify/decor) + Collections (achievements). **It does not show the repository** — the tab is literally named "Collect" but never displays what you've collected. This is the natural home.
- Home map: single `#map-canvas`, sized to container, always-on rAF loop (`ui/map-view.ts`), hit-tested via `this.hitboxes` in `draw()`. Buildings open `showBuilding(art, unlockAt)` → `#bldg-modal` (with the Village Life "Play" CTA). We just padded small hitboxes and added overflow fixes (PR #17).

---

## Part A — Repository screen ("Your Collection")

### Intent
Give the banked loot a home that reads as a **cabinet of keepsakes**, not an inventory grid — on-brand with the cosy, keep-everything pillar. Make each mini-game's output visibly accumulate, so a run *feels* like it added to something. No selling, no power (economy pillars hold).

### Placement
Fold into the existing **Collect** tab (`renderShop`), as a new **first** section above Market, titled **"Your Repository"** (or "The Keeping Room" — pick during build for voice). Rationale: the tab is already called Collect, already the achievements/collections home, and needs no new nav slot (nav is full at 5).

### What it shows
- **Grouped by chain** (fish, copper, honey, books, seeds/keepsake, flowers, wood, harvest, hearthfire — whatever `repository` actually contains). One soft "shelf" card per chain that has ≥1 item.
- Per chain: the painted tile art (`tileMarkup(chain, level)`), the level-name (`chainDef(chain).levelNames[level]`), and a **count badge** (`×N`).
- A gentle empty state when `repository` is empty: *"Nothing kept yet. Play a building's game, or win a Bonfire Duel, and what you gather rests here."*
- A one-line provenance/purpose note: *"Kept safe for the village. When someone asks for what you hold, you can hand it over from here."*

### What it does (interaction)
- **Deliver-from-here when it matches the current need.** If `canDeliverFromRepository()` is true, show a warm "Give to \<who\>" button on the matching shelf that calls `deliverFromRepository()` — the same path duels already use. This is the honest fix for "items go nowhere": when the town asks for something you're holding, you can give it without rebuilding it on the board.
- **No sell, no discard.** Keep-everything pillar. (If clutter ever becomes a problem, that's a later "gift to a villager" mechanic, not this spec.)
- Re-render on the `state` event (already how `renderShop` refreshes).

### Making loot matter beyond delivery (the real "goes nowhere" root cause)
Delivery only helps when the need happens to match. Two low-risk options to make *every* chain useful — **recommend option 1 for this pass**, note option 2 as a follow-up:

1. **Endless orders occasionally ask for a held mini-game chain (preferred).** Add a second, opt-in endless variant: if the repository holds a mini-game chain, ~1-in-4 endless orders asks for *that* chain/level instead of the POOL, tagged so it's deliverable **only** from the Repository (not board-buildable). This closes the loop — the fish you catch become fish the harbour asks for — without breaking the "always board-buildable" guarantee for the default POOL orders. Pure change in `data/endless.ts` + a guard so it only fires when the player actually holds something. Fully testable deterministically.
2. **Collections/sets (follow-up, not this pass).** "Bring the well 5 wishes", "a full shelf of books" → Chronicle entry + cosmetic token. Bigger; defer.

### Data / engine work
- **None required for the view** — `repository`, `canDeliverFromRepository()`, `deliverFromRepository()` all exist.
- For the option-1 loop: extend `endlessOrderFor(n, heldChains?)` (keep the old signature working; add an optional arg) + an `isRepositoryOnly(order)` flag on `OrderDef` (or a naming convention like `endless-repo-<n>`). Add `Game` plumbing to pass held chains in. Save-safe (endless orders are derived, not stored).

### Files
- `ui/screens.ts` — `renderRepository()` section inside/above `renderShop()`, or a small `renderRepository()` called from `renderShop()`.
- `ui/art.ts` — reuse `tileMarkup`.
- `styles.css` — `.repo-shelf`, `.repo-count`, empty state. Reuse `.shop-grid`/badge styling for consistency.
- (option 1) `data/endless.ts`, `core/game.ts`, `tests/endless.test.ts`.
- Save version: **no bump** for the view; the option-1 loop needs none either (derived).

### Tests
- `renderRepository` is DOM; cover the engine instead: `addToRepository` accumulation (exists), `deliverFromRepository` decrement/prune (exists — extend if needed), and for option 1: determinism + "only asks for a chain the player holds" + "repo-only order is not board-deliverable".

### Acceptance
- After `hearthTestGames()` + playing a game, the Collect tab shows the caught item with a count, and playing again increments it.
- When the current town-need matches a held item, a "Give to \<who\>" button delivers it and advances the order.
- Empty state reads warmly; no sell/discard anywhere.

### Effort: ~0.5–1 day (view + delivery). +0.5 day for the option-1 endless loop with tests.

---

## Part B — Map rework (larger town + building focus)

### Intent
Make Emberhollow feel like a **place you can look around**, and make every building — the well included — easy to find and open. The user asked for "much larger" and "Wishing Well its own feature page." Interpret as: **a larger, pannable map** + **a per-building focus view** (the "feature page"), not literally a separate route per game.

### Two parts, shippable in order

**B1 — Bigger, pannable/zoomable canvas (presentation).**
- The map currently fits the whole island to the container. Give it an intrinsic size larger than the viewport and allow **pan** (drag) and a **2-step zoom** (fit ↔ close-up), clamped to the island bounds. Keep the always-on rAF but only when `visible` (already gated) and pause on hidden (already gated).
- Hitboxes already computed in canvas space — pan/zoom just needs a transform applied consistently to both `draw()` and the click hit-test (single `worldToScreen`/`screenToWorld` pair). This is the core of the work; do it once, carefully, with the existing `hitboxes` rectangles.
- Add a subtle "tap a building to visit it" affordance on first entry (dismissable), since discovery is the reported pain.
- Accessibility/reduced-motion: keep the static `draw(0)` path; pan/zoom via buttons as well as drag so it's not drag-only.

**B2 — Building focus view (the "feature page").**
- Tapping a building already opens `#bldg-modal` with story + upgrade + Play CTA. **Upgrade that modal into a fuller focus panel**: larger building art, its Village Life game front-and-centre (big "Play \<game\>" button when unlocked, with the token/energy status already computed by `minigameStatus`), the building's villager(s), and its restoration blurb. This *is* the "well its own page" ask — a focused view per building — without a nav/route change.
- For the well specifically: because it's a tiny prop, ALSO keep it reachable from (a) the padded hitbox (done, PR #17), (b) the Home location list (done, PR #17 for lighthouse/pier — extend the same pattern to the well by giving it a `MAP_LOCATIONS`/`locBuilding` entry), and (c) a possible "Village Life" index (B3).

**B3 — Optional: a "Village Life" index card (defer unless wanted).**
- A single list of all unlocked building games with big Play buttons — the fastest possible access, independent of finding the building on the map. Cheap to build on top of `minigameStatus` for each `MINIGAMES` entry. Good for discoverability; note as a fast-follow.

### Files
- `ui/map-view.ts` — pan/zoom transform + hit-test update (B1); expand `showBuilding`/`renderMinigameCta` into the focus panel (B2).
- `index.html` — `#bldg-modal` markup expansion (B2); zoom buttons in `.map-actions` (B1).
- `styles.css` — focus-panel styling, zoom controls.
- Save version: **no bump** (pure view state; pan/zoom is ephemeral, not persisted — or persist last zoom in a UI-prefs slot if desired, which WOULD need care but is optional).

### Risks / callouts
- **Pan/zoom hit-test drift is the one real trap** — the current bug class (needle-thin hitboxes, overflow) shows how easy it is to desync draw-space and hit-space. Mitigate with a single shared transform and a quick manual verify at each zoom step. Worth a couple of determinism-free but manual test passes on the deployed preview.
- Don't touch `generatePioneerBandPeaks`-style tuned constants — N/A here, but the same "don't casually retune magic numbers" caution applies to the island bounds and building coordinates in `town-layout.ts`.
- Keep it **touch-first** (this is a mobile PWA): drag-pan and pinch-zoom must feel native; buttons are the fallback.

### Effort: B1 ~1–1.5 days (transform + hit-test is the bulk), B2 ~0.5–1 day, B3 ~0.5 day.

---

## Suggested sequence
1. **Repository view + deliver-from-here** (Part A core) — smallest, highest "it went somewhere" payoff. One PR.
2. **Endless repo-chain loop** (Part A option 1) — makes all chains matter. Fold into the same PR or a fast-follow.
3. **Map B2 focus view** — turns the existing modal into the "feature page" the user asked for; low risk, high perceived value. One PR.
4. **Map B1 pan/zoom** — the "much larger map"; most engineering, do it deliberately. One PR.
5. **B3 Village Life index** — optional discoverability fast-follow.

All on `feature/*` branches off `dev`, PR per numbered item, verify (tsc/eslint/vitest/vite build) + deploy to `hearth-5q8.pages.dev` before PR, no merge until user has tested (per workflow rules).

## Open questions for Teddy
- Repository home: fold into **Collect** tab (recommended, no new nav) vs its own screen (nav is full — would displace something)?
- Endless repo-chain loop (Part A opt 1): want the town to start asking for your caught fish/copper/etc., or keep mini-game loot purely as a kept collection for now?
- Map: is "much larger" → **pannable/zoomable same island** (recommended) or a genuinely bigger multi-district town (much larger art + content effort)?
