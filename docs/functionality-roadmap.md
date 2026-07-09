# HEARTH — Functionality Roadmap (post-art pass)

*v1 · 2026-07-09 · repo `F:\Mastermind launch\hearth`. Deepens the game loop across four interlocking workstreams: Board quality-of-life, Activating the resource library, Energy & economy depth, and Progression & retention. All presentation + logic, no backend; keep 181 tests green and add coverage per workstream.*

## Design guardrails (non-negotiable, from GDD + code)

- **Energy is never sold.** Coins never convert to energy. (`ftue.ts:53`, `main.ts:49`.)
- **Coins buy beauty, comfort, and convenience — never power.** No pay-to-win; no board advantage bought with coins. (`game.ts:506` header.)
- **Data-driven.** New content lives as plain serialisable data in `src/data/*` (remote-config shaped), logic in `src/core/*`, DOM in `src/ui/*`.
- **British spelling**, ember-not-lightning, reduced-motion aware.

## Current-state facts (verified this pass)

- Core loop solid: `tapProducer` (1 energy) → `drop`/merge → `deliver`; plus one-step `undoLastMerge`, optional `auto-merge`, long-press discard (2-tap). `game.ts`.
- **Offline energy already works** — `accrueRegen` is timestamp-based (`energy.ts:18`), accrues while closed, cap 30, life-energy can exceed. *No work needed; do NOT re-plan it.*
- **SPAWN_TABLE** = only `wood/harvest/hearthfire/keepsake`. The **12 resource chains** (stone, clay, seeds, flowers, water, copper, fish, honey, herbs, wool, books, music) are defined in `CHAINS` but **unused** — dead content.
- **Coins**: earned (orders/duels/chests) with only two sinks — `placeDecor` + `upgradeBuilding`. No shop-tab spend, no item sell.
- **Daily quests**: fixed pool of 6 (`data/daily-quests.ts`), coins only, repeats every 2 days.
- **Achievements** (10) + **collections** (4): display only, **no payoff**.
- **Streak**: energy bonus `2+min(streak,10)`, chest every 3 days; no milestone ceremony/reward.
- **Villager gifts**: only level-0 starters of the current order chain; no villager requests, no resource trading.
- **What's next**: ephemeral dawn tease only (`tease.ts`); no persistent tracker.

---

## Workstream A — Board quality-of-life *(first; lowest risk, highest daily feel)*

No balance change; pure interaction polish on the core toy.

- **A1 Tap-to-merge.** Tap an item → highlights its nearest same-chain/level twin; tap the twin (or tap again) merges. Complements drag, big mobile-ergonomics win. `board-view.ts` pointer handler + a `selected` state; reuse `game.drop(from,to)`.
- **A2 Tidy board.** A "Tidy" button that compacts items to the top-left and groups by chain then level (stable, animated). Pure view→`game` reorder method `tidyBoard()` on `board.ts` (returns new board; producer stays at `PRODUCER_INDEX`). Add test.
- **A3 Item lock/pin.** Long-press card gains a "Lock" toggle; locked items can't be dragged, auto-merged, or bulk-discarded (anti-fat-finger for near-max items). Add `locked?: boolean` to `Item`; honour in `drop`, auto-merge, trash. Persist.
- **A4 Bulk discard.** In the item card, "Discard all level ≤ N of this chain" for clearing low-tier clutter (locked items exempt). `game.trashMatching(chain, maxLevel)`.
- **A5 Board-full guidance.** When `tapProducer` rejects on a full board, surface a clear toast + pulse the lowest-tier tiles + offer Tidy — instead of a silent reject. Wire the existing `reject` reason `'full'`.

Verify: unit tests for `tidyBoard`/`trashMatching`/lock rules; Playwright shot of tap-merge + tidy.

---

## Workstream B — Activate the resource library *(turn 12 dead chains into play)*

Introduce resources as an **optional side-economy** that never disturbs the Chapter 1–2 story pacing (which stays wood/harvest/hearthfire/keepsake only).

- **B1 Town Requests (side quests).** A rotating board of **villager resource requests** in the Villagers/Shop tab: e.g. *"Marta needs 3× Flowers L2 → 40 coins + a decor token."* Data in `data/town-requests.ts` (chain, level, qty, coin/decor reward), deterministic daily rotation like daily-quests. Fulfilled from board items via a new `game.fulfilRequest(id)`. This is the demand sink that makes resources worth merging.
- **B2 Second producer / resource spawns.** Add resource chains to play **without** diluting story spawns: a **separate "Workshop crate"** unlocked at a mid-story beat (e.g. order ≥ 6) that spawns only from a `RESOURCE_SPAWN_TABLE` (stone/clay/seeds/flowers/water/…). Keeps the main producer pure for story orders. Board already has spare cells; the second crate occupies one fixed slot post-unlock.
- **B3 Resource → shop feedstock.** Surplus resources can be **sold for coins** (a real coin *source* + board-clear convenience) and used as **currency for the coin shop's cosmetic decor** (Workstream C), so the loop closes: merge resources → requests/coins → decor/upgrades.
- **B4 Collection tie-in.** Point the existing collection crests at resource chains so completing a chain (reach its top tier) grants a **payoff** (coins + a decor unlock) — see D3.

Guardrail check: resources yield coins/decor/energy-*earned-via-actions* only — never purchasable energy, never board power.

---

## Workstream C — Energy & economy depth *(make coins matter)*

- **C1 Real Shop tab.** Convert the cosmetic "Collections" screen into a working **Shop** with a spend UI: a **decor catalogue** (buy cosmetic town pieces with coins → placed via existing `placeDecor`), **building-skin upgrades** surfaced here (not just on the map), and **resource stalls** (buy a starter resource item / sell surplus — B3). Reuse `DECOR_CATALOG`, `upgradeBuilding`. Keep Collections as a sub-tab.
- **C2 Comfort boosts (coins, not power).** Coin-priced *conveniences* that don't buy advantage: "Tidy now" instant, an extra **decor slot**, a **cosmetic board frame/turf skin**, a **name a villager** vanity. Explicitly no energy, no extra spawns, no free merges.
- **C3 Energy sinks & sources clarity.** Surface regen state ("+1 energy in 2:10", cap 30) on the energy panel; make life-action energy (the uncapped, real-world channel) visibly the way past the cap — reinforcing the pillar. Small `energy.ts` selector + panel copy.
- **C4 Coin economy tuning.** With new sinks (shop) + sources (requests/sell), tune reward numbers in `economy.ts` so coins neither starve nor inflate; add a pacing test asserting a reachable curve.

---

## Workstream D — Progression & retention *(why you come back)*

- **D1 Daily-quest variety + scaling.** Expand the pool (12–16 variants incl. resource/tidy/upgrade quests), weight by day so it doesn't repeat within a week, and **scale rewards with streak** (coins ×, occasional decor token). `data/daily-quests.ts` + `core` selector; keep deterministic-by-date.
- **D2 Streak milestones with ceremony.** At 3/7/14/30/100 active days: a **painted milestone modal** + a real reward (coins, a decor unlock, a cosmetic frame). Extend `actions.ts` streak logic + a `milestone` event; reuse the reward modal. Un-cap the visual celebration even if energy bonus stays capped (pillar-safe).
- **D3 Collection & achievement payoffs.** Wire completion rewards: finishing a collection (a resource/story chain) → coins + decor unlock; earning an achievement → coins + a badge that actually unlocks a cosmetic. `achievements.ts` + `world.ts` COLLECTIONS gain a `reward` field; grant on `newlyEarned`.
- **D4 Persistent "What's next" tracker.** A always-visible **goal strip** on Home: current order + the next building it restores + "% of town restored" + next milestone — turning the ephemeral dawn tease into a standing objective. Reuse `tease.ts` + `ZONE_STAGES` + `stageFor`.
- **D5 Chapter-end hook polish.** Ensure each chapter boundary teases the next with a dated, painted beat (already partly there via `chapterComplete`), and gates the resource side-economy unlocks to feel like earned expansion.

---

## Sequencing & interlocks

```
A (board QoL)  ──▶ ships first, standalone, no balance risk
        │
B (resources) ──▶ needs A's item ops; creates demand (requests) + feedstock
        │              │
C (shop/econ) ◀────────┘  spends coins, sells resources, real Shop tab
        │
D (retention) ──▶ consumes B/C (collection payoffs, quest variety, milestones)
```

Recommended order: **A → B → C → D**, each landing as its own green commit + deploy for review. A is immediately felt; B+C convert dead content and coins into a live loop; D compounds retention on top.

## Verification (every workstream)

- `npx tsc --noEmit` clean · `npx vitest run` (181 + new tests) green · `pnpm build` clean.
- New pure-logic gets unit tests (`tidyBoard`, `fulfilRequest`, streak milestones, quest rotation, collection rewards).
- Playwright shots for each UI change (tap-merge, tidy, shop, milestone modal, goal strip); deploy to `hearth-5q8.pages.dev` per workstream for user review.
- Guardrail assertion test: no code path converts coins→energy or grants board power for coins.

## Explicitly out of scope (deferred / backend)

Multiplayer trading (M3 backend), narrated meditation audio (M2 audio), real motion-sensor reps, analytics sink swap — all intentionally stubbed; not touched here.
