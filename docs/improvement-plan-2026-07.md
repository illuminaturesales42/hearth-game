# HEARTH — Improvement Plan

*Derived from `docs/audit-2026-07.md` (2026-07-13). This is the executable build plan: milestones, dependency order, PR-sized batches, and a detailed card per task (goal · current state · approach · files · tests · acceptance · rollback · size · deps). Prepared against branch `docs/production-audit`.*

## Guiding principles

1. **Preserve working systems.** The core, save chain, sync seam, and content are production-grade. Every task below is additive or a contained edit — nothing is a rewrite.
2. **Land green.** Each task ends with `tsc --noEmit` clean + `pnpm test` green + `pnpm build` clean before the next begins. That is already the repo's discipline.
3. **The Hearth Test.** No task may compromise the pillars: energy is never sold; coins buy beauty, never power; streaks are never punished; anti-compulsion holds.
4. **PR-sized batches.** Group tasks into small PRs (below) so each is reviewable and independently revertable. Branch off `main` per batch: `chore/*`, `fix/*`, `feat/*` per the repo convention.
5. **Telemetry before tuning.** Balance changes (economy, health rules) wait for real friends-and-family data — don't guess.

## Milestone overview

| Milestone | Theme | Batches | Blocks the next? |
|---|---|---|---|
| **M-A** | Stabilise & tooling | B1, B2 | Yes — lint/typed-safety foundation |
| **M-B** | Harden the seams | B3, B4 | No (parallel with M-C) |
| **M-C** | Close design gaps | B5 | No |
| **M-D** | UX & accessibility | B6, B7 | No |
| **M-E** | Content & art | B8 (art pipeline) | No (runs continuously) |
| **M-F** | Testing & release prep | B9 | Gates deploy |
| **M-G** | Native + post-launch | (future) | Phase B/D of roadmap |

Recommended order: **B1 → B2** (foundation), then **B3, B5, B6** in parallel-ish (independent), then **B4, B7**, then **B9**. Art (B8) runs continuously alongside. Native (M-G) is a separate phase per `roadmap-to-market.md`.

---

## Batch B1 — Tooling foundation *(chore, ~½ day)*

### Task 1.1 — ESLint + Prettier + CI lint gate
- **Goal:** catch floating promises, unused code, and style drift automatically; gate them in CI.
- **Current:** devDeps are only `typescript`, `vite`, `vitest`, `playwright`, `wrangler`, capacitor CLI (`package.json:13-21`). CI runs test + build only (`.github/workflows/ci.yml`).
- **Approach:** add `eslint`, `typescript-eslint`, `eslint-config-prettier`, `prettier`. Config: typescript-eslint recommended + `@typescript-eslint/no-floating-promises`, `no-explicit-any`, `no-unused-vars`. Add `lint`/`format` scripts. Add a `lint` job to `ci.yml` before `test-build`. The codebase already avoids `any` and handles promises with `void` — expect few fixes, all minimal.
- **Files:** `package.json`, new `eslint.config.js`, `.prettierrc`, `.github/workflows/ci.yml`, plus any warning fixes.
- **Tests:** `pnpm lint && pnpm test && pnpm build` all green.
- **Acceptance:** `pnpm lint` clean; CI fails on a planted lint error.
- **Rollback:** remove the config + CI job; no runtime impact.
- **Size:** S · **Deps:** none.

### Task 1.2 — Guard dev globals behind `import.meta.env.DEV`
- **Goal:** stop a curious tester skipping/wiping content from the console in prod.
- **Current:** `window.hearthReset/hearthSeeTown/hearthHealthSim/hearthEvents` attached unconditionally (`main.ts:184-206`); `devPreviewStory` callable anytime (`game.ts:762-767`).
- **Approach:** wrap the `window.hearth*` block in `if (import.meta.env.DEV) { … }`. Leave `devPreviewStory` on `Game` (it's harmless without a caller) but ensure no prod UI path reaches it.
- **Files:** `main.ts:176-206`.
- **Tests:** existing suite green; grep a prod build (`dist/`) for `hearthReset` → absent.
- **Acceptance:** dev helpers present in `pnpm dev`, absent in `pnpm build`.
- **Size:** S · **Deps:** none.

---

## Batch B2 — Save & data integrity *(chore/test, ~½ day)*

### Task 2.1 — Migration-guard regression test
- **Goal:** make it impossible to add a `GameState` key without extending the save null-guard.
- **Current:** `migrateState` climbs v8→v13 then validates a hard-coded key list (`save.ts:60-68`). Chain and guard are two manual places that must stay in sync — no test enforces it.
- **Approach:** in `tests/save.test.ts`, build a minimal `version:8` fixture, run `migrateState`, and assert every key the guard checks (`board, energy, actions, social, gratitude, settings, prefs, stats, chronicle, wellbeing, relationships, buildingUpgrades`) is present and non-null. Add a comment linking the test to `CURRENT_VERSION` so the next bump updates both.
- **Files:** `tests/save.test.ts`.
- **Tests:** new test green; temporarily drop a guard key → it fails.
- **Acceptance:** CI fails if a future migration omits a guarded key.
- **Size:** S · **Deps:** none.

### Task 2.2 — Move logic constants into the data layer *(optional, low priority)*
- **Goal:** honour the "remote-config shaped" intent so balancing needs no logic edits.
- **Current:** `Game.UPGRADE_COSTS = [120,320]` (`game.ts:680`), `stageFor` thresholds `[0,5,10,16,22]` (`economy.ts:783-788`), health rules inline (`health-energy.ts:10-23` — already in a const, acceptable).
- **Approach:** relocate `UPGRADE_COSTS` and the stage thresholds into `data/economy.ts` exported consts; import where used. No behaviour change.
- **Files:** `game.ts`, `economy.ts`.
- **Tests:** existing pacing/upgrade tests green.
- **Size:** S · **Deps:** none · **Priority:** P2 (defer if time-boxed).

---

## Batch B3 — Observability *(feat, ~1-2 days)*

### Task 3.1 — Network analytics + crash sink
- **Goal:** see testers' events and crashes during friends-and-family week.
- **Current:** `track()` buffers to memory (cap 500) and logs to console in DEV only (`analytics.ts:18-31`); `window.onerror`/`unhandledrejection` route into the same buffer (`main.ts:60-65`). Nothing leaves the device. The facade already exposes `setSink()` for exactly this swap.
- **Approach:** add `platform/analytics-sink.ts` implementing a network sink (PostHog or Sentry free tier). In `main.ts`, call `setSink(networkSink)` **only** when `import.meta.env.PROD`. Enforce the privacy rule at the sink boundary: a small allowlist/denylist that drops any prop key resembling health data (steps/sleep/flights raw values) — only derived `energy` may pass (the taxonomy in `docs/analytics.md` already respects this; the sink is the belt-and-braces).
- **Files:** `analytics.ts` (no change needed beyond the seam), `main.ts`, new `platform/analytics-sink.ts`, `docs/analytics.md` (note the sink).
- **Tests:** unit-test the sink drops disallowed keys and forwards allowed ones; manual: a prod build delivers a `session_start` + a thrown error to the dashboard.
- **Acceptance:** events + errors visible remotely; no raw health value ever sent.
- **Rollback:** don't call `setSink()` — reverts to the in-memory buffer.
- **Size:** M · **Deps:** none (but pairs naturally with a real retention sink per `retention.ts`).

---

## Batch B4 — Cloud API hardening *(feat, ~1-2 days)*

### Task 4.1 — Rate limiting on the save Function
- **Goal:** stop a device key from hammering PUT/GET.
- **Current:** `functions/v1/save.ts` accepts any well-formed request; rev-gated writes but unmetered request rate.
- **Approach:** add a per-device-key sliding window (KV or a D1 counter table) — e.g. N writes/minute. Keep the write-gate pure (`acceptsWrite`) and add the limiter as a thin guard returning 429 with a `Retry-After`. Unit-test the limiter as a pure counter function.
- **Files:** `functions/v1/save.ts`, `wrangler.toml` (KV binding if used), a test.
- **Tests:** limiter unit test (allow under limit, 429 over); manual against a preview.
- **Acceptance:** over-rate writes get 429; normal play unaffected.
- **Size:** M · **Deps:** none.

### Task 4.2 — Security headers
- **Goal:** ship a CSP + hardening headers on the public build.
- **Current:** no `public/_headers` present (*confirmed absent*).
- **Approach:** add `public/_headers` (Cloudflare Pages honours it): `Content-Security-Policy` (self + `api.open-meteo.com` connect-src + the analytics host + `'unsafe-inline'` only where the current inline styles/scripts require — audit and tighten), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, a sane `Permissions-Policy`.
- **Files:** new `public/_headers`.
- **Tests:** verify headers on a `deploy:preview`; confirm the game, weather fetch, PWA, and analytics still work under the CSP.
- **Acceptance:** headers present; no CSP violations in console during normal play.
- **Size:** M · **Deps:** ideally after 3.1 so the analytics host is known for connect-src.

---

## Batch B5 — Late-game restoration (design gap G1) *(feat, ~1 week)*

### Task 5.1 — Extend town growth through Chapters 3-6
- **Goal:** the town keeps visibly rebuilding to order 72, not just 24 — restoring the strongest reward for the back half of the story.
- **Current:** all 14 buildings unlock by order 23 (`town-layout.ts:27-42`); `stageFor` maxes at stage 4 by order 22 (`economy.ts:783-788`); `RESTORE_ORDERS = 24` caps the progress bar (`economy.ts:811`); `map-view.ts` renders entirely off `stage()` + `orderIndex`, so after ~24 the scene is static apart from time-of-day and weather.
- **Approach (data-first, minimal renderer change):**
  1. Add **new `ZONE_STAGES`** entries past 24 for Ch 3-6 beats (e.g. `{at:36,'The true beacon'}`, `{at:48,'New sails in the harbour'}`, `{at:60,'The town in winter'}`, `{at:72,'Spring tides'}`), and raise `RESTORE_ORDERS` accordingly — but re-frame the bar so early restoration still reads as "town rebuilt" and later stages read as "town flourishing" (avoid making Ch1 feel incomplete). Consider a two-phase bar: *Restored* (to 24) then *Flourishing* (24→72).
  2. Add **stage 5-7** to `stageFor` thresholds and to `map-view.ts` `STAGE_NAMES`, gated on the new order counts; extend the stage-keyed nature/dressing in `town-layout.ts` `TOWN_NATURE` (seasonal layers: winter frost props at stage 5-6, spring blossom at stage 7) using the `untilStage`/`stage` mechanism already present.
  3. Add **new `TOWN_BUILDINGS`/props** for the later chapters (second beacon on the south point per c6-10, schoolhouse per c5-04, newlyweds' cottage per c6-07) with `unlockAt` in the 36-72 range and `ruinVariant` where sheet art exists; otherwise they simply pop in on delivery.
  4. Extend `TOWN_BOATS`/`TOWN_WALKERS` with the returning crews and the sea-child growing up (narratively seeded in Ch4-6).
- **Files:** `data/economy.ts` (ZONE_STAGES, RESTORE_ORDERS, stageFor thresholds), `data/town-layout.ts` (buildings, nature, walkers, boats), `ui/map-view.ts` (STAGE_NAMES + any bar re-frame), `tests/economy-pacing.test.ts` + `tests/progression.test.ts`.
- **Tests:** pacing test asserts restoration/stage is monotonic non-decreasing across orders 0→72 and never regresses; visual smoke via `hearthSeeTown(36/48/60/72)`.
- **Acceptance:** delivering through Ch 3-6 visibly changes the town; progress bar climbs without regressing; reduced-motion still renders.
- **Rollback:** revert the data additions — renderer tolerates absent art (fallbacks) and shorter stage lists.
- **Size:** L · **Deps:** benefits from Batch 8 art (new building sprites) but not blocked — pop-in works without bespoke ruin art.
- **Risk:** re-framing the progress bar could confuse existing testers mid-save; keep the "% restored" semantics stable and add a separate "flourishing" indicator rather than moving the goalposts.

### Task 5.2 — Economy/health balancing from telemetry *(ongoing, after B3)*
- **Goal:** tune reward pacing on real data, not guesses.
- **Approach:** run friends-and-family week with the network sink live; export via `hearthEvents()`/dashboard; adjust `HEALTH_RULES` (`health-energy.ts`), action energies (`data/actions.ts`), and order rewards (`economy.ts`) within the existing pacing-test guardrails.
- **Files:** `data/*`, `economy.ts`, pacing tests.
- **Acceptance:** D1 measurable; no order stalls for lack of energy in playtest logs.
- **Size:** M (ongoing) · **Deps:** B3.

---

## Batch B6 — UX polish *(fix/feat, ~1 day)*

### Task 6.1 — Remove `user-scalable=no`
- **Goal:** restore pinch-zoom (accessibility + store compliance).
- **Current:** `index.html:5` viewport contains `user-scalable=no`.
- **Approach:** delete `user-scalable=no`; keep `viewport-fit=cover`. Sanity-check the board and modals don't break when zoomed; the existing `textScale` pref remains the in-app control.
- **Files:** `index.html:5`.
- **Tests:** manual pinch-zoom; e2e smoke green.
- **Size:** S · **Deps:** none.

### Task 6.2 — In-game save-conflict modal
- **Goal:** replace the native `window.confirm()` with a branded, non-blocking dialog.
- **Current:** `main.ts:167-172` uses `window.confirm()` for the two-device conflict choice.
- **Approach:** add `ui/confirm-modal.ts` — a themed overlay (reuse `#bldg-modal`/toast patterns), `role=dialog`, focus trap, Esc-to-cancel, two clear actions ("Keep the saved village" / "Keep this device"). Wire it into the `sync.start()` conflict branch, preserving the "keep further-along, never silently wipe" logic and the reload-on-adopt.
- **Files:** `main.ts:161-173`, new `ui/confirm-modal.ts`, `index.html` (modal markup) or build it in JS, `styles.css`.
- **Tests:** unit-test the decision wiring (adopt vs keep-local calls the right controller method); manual forced-conflict.
- **Size:** S · **Deps:** none (but shares the modal primitive with Task 7.1 — build it reusable).

### Task 6.3 — Offline / loading / failure states
- **Goal:** graceful degradation instead of silent failure on a flaky phone.
- **Current:** no loading/offline/error UI (grep: 0 in `screens.ts`); weather fetch and sync failures degrade silently.
- **Approach:** add a subtle offline indicator (listen to `online`/`offline`); a first-paint loading state on the map canvas; a quiet "couldn't reach the sky" fallback when `currentWeather()` fails (already returns null — just surface it once, unobtrusively). Keep it cosy, never alarming.
- **Files:** `ui/weather.ts`, `ui/map-view.ts`, `ui/app-shell.ts` or a small `ui/net-status.ts`, `styles.css`.
- **Tests:** manual offline toggle; unit where logic is extractable.
- **Size:** M · **Deps:** none · **Priority:** P2.

---

## Batch B7 — Accessibility & design system *(feat, ~2-3 days)*

### Task 7.1 — Accessibility pass
- **Goal:** the core loop is navigable by keyboard and screen reader; reduced-motion is honoured by default.
- **Current:** only `board-view`, `map-view`, `social-screen` carry any ARIA; the board is an unlabelled `div` grid; nav is buttons without tablist semantics; modals lack focus management; `prefers-reduced-motion` is respected in canvas motion (`map-view.ts:67`) but not as a global CSS default (`forceReducedMotion` is a manual pref).
- **Approach:** (a) board grid → `role=grid`/`gridcell` with `aria-label` per tile (chain + level + locked); (b) bottom nav → `role=tablist`, each button `role=tab`/`aria-selected`; (c) modals (`confirm-modal`, `#bldg-modal`, energy panel, meditation) → `role=dialog`, `aria-modal`, focus trap, Esc, return focus to opener; (d) toasts → an `aria-live=polite` region; (e) add `@media (prefers-reduced-motion: reduce)` to `styles.css` disabling non-essential transitions by default, with the pref as override; (f) visible `:focus-visible` rings everywhere.
- **Files:** `ui/board-view.ts`, `ui/app-shell.ts`, `ui/toast.ts`, modal files, `ui/energy-panel.ts`, `ui/meditation.ts`, `styles.css`.
- **Tests:** axe/Lighthouse a11y ≥90; manual keyboard-only run of spawn→merge→deliver; VoiceOver/NVDA spot-check of the board.
- **Acceptance:** a11y score ≥90; core loop operable without a mouse; OS reduced-motion respected.
- **Size:** M · **Deps:** Task 6.2 (share the dialog primitive).

### Task 7.2 — Extract a DOM-string component kit *(refactor, P2)*
- **Goal:** stop re-declaring card/badge/button/modal markup per screen; one place for interaction states.
- **Current:** markup patterns repeated inline across `screens.ts`, `social-screen.ts`, `map-view.ts`, etc.
- **Approach:** add `ui/kit.ts` with pure string/element builders — `card()`, `btn(kind)`, `modal(opts)` (with the focus-trap from 7.1), `badge()`, `barMeter()`, `pill()`. Formalise CSS tokens in `styles.css` (`--ink/--gold/--ember`, spacing scale, radius, type ramp — several already exist). Migrate screens opportunistically, not in one big-bang.
- **Files:** new `ui/kit.ts`, `styles.css`, incremental screen edits.
- **Tests:** existing UI still renders; no visual regression on migrated screens.
- **Size:** L (incremental) · **Deps:** 7.1 for the modal primitive · **Priority:** P2.

---

## Batch B8 — Art & content *(continuous, art pipeline)*

Runs alongside everything via `tools/slice_assets.py` — content, not code-sequence-blocking. Priority order:
1. **P1 — Villager portraits** (Batch 8): Bran, Wren, Sorin, Joss, Marta, +2. Replaces placeholder faces on order cards and `TOWN_WALKERS`.
2. **P1 — Wellness medallions** (Batch 10): remaining emoji action icons in the energy panel.
3. **P1 — Building L2/L3** slices: probe/slice the upgrade sheets; the renderer already looks for `${art}_l2`/`_l3` (`map-view.ts:919-923`).
4. **P2 — Resource-chain art (G4):** distinct sprites per level for chains that currently repeat one emoji (`economy.ts:38-108`); or pick distinct fallback emoji.
5. **P2 — Ember-heart energy pill:** slice `UI Flame.png` into the topbar (`app-shell.ts:76-81` already swaps `energy_heart`/`res_energy` when present).
- **Tests:** after each slice, verify via the offline PIL composite (per `CLAUDE.md`) — do not eyeball keyed sprites on dark backgrounds.
- **Deps:** Batch 8/9 sheets must be delivered first (currently pending).

---

## Batch B9 — Testing & release prep *(test, ~1-2 days)*

### Task 9.1 — Broaden e2e
- **Goal:** cover more than the single smoke journey.
- **Current:** `tests/e2e/smoke.spec.ts` only (launch→merge→deliver→reload-persists).
- **Approach:** add Playwright specs for (a) FTUE completion (welcome→first merge→first deliver→energy promise→done, then flag persists) and (b) earning energy via a self-report action and spending it. Reuse the config's build+preview `webServer`.
- **Files:** `tests/e2e/*.spec.ts`, maybe `playwright.config.ts`.
- **Tests:** both journeys pass locally and in CI's `e2e` job.
- **Size:** M · **Deps:** B1 (lint) helps but not required.

### Task 9.2 — Release checklist
- **Goal:** confidence before pointing strangers at the URL.
- **Approach:** `pnpm audit`; Lighthouse ≥90 PWA/perf on a mid-range phone (a roadmap Phase 0 gate) — audit the 383-file art lazy-loading if it fails; British-spelling/voice pass over order/chronicle copy; refresh `docs/mvp-status.md` (currently stale: says v10/95 tests, actual **v13/216**).
- **Files:** `docs/mvp-status.md`, possible perf tweaks.
- **Acceptance:** Lighthouse ≥90; docs current; `pnpm audit` clean or triaged.
- **Size:** M · **Deps:** B6/B7 (a11y feeds Lighthouse).

---

## Milestone G (future) — Native + monetization

Per `roadmap-to-market.md` Phases B & D — out of scope for this plan, tracked for continuity:
- `npx cap add android`; HealthKit/Health Connect adapters behind `health-provider` (the pure aggregation core in `health/health-connect.ts` is done + tested).
- Swap in the HTTP `SyncProvider` (`platform/sync-provider.ts`) — a drop-in; the Pages Function already exists.
- Opt-in push notifications (sunrise New Day only, never guilt).
- Store paperwork (privacy policy, Apple 5.1.3, Play Data-Safety).
- Design the **subscription entitlement seam** (cosmetic depth only — never energy/power) so Phase D can hang off it.

---

## Effort roll-up

| Batch | Size | Priority |
|---|---|---|
| B1 Tooling | ~½ day | P1 |
| B2 Save integrity | ~½ day | P1/P2 |
| B3 Observability | 1-2 days | P1 |
| B4 API hardening | 1-2 days | P1 |
| B5 Late-game restoration | ~1 week | P1 |
| B6 UX polish | ~1 day | P1/P2 |
| B7 a11y + design system | 2-3 days | P1/P2 |
| B8 Art | continuous | P1/P2 |
| B9 Testing & release | 1-2 days | P1 |

**Critical path to a friends-and-family web test:** B1 → B3 → B6 (tasks 6.1, 6.2) → B7 (7.1) → B9 (9.1) — roughly a week of focused work, with B5 and art proceeding in parallel.

**The single first task:** Batch B1, Task 1.1 (ESLint + Prettier + CI lint gate). It unblocks quality on every task after it and surfaces latent issues across the whole surface at once.
