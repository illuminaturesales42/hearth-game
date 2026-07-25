# Hearth — Production Audit (2026-07-20)

**Scope:** whole-project review — design docs, planning, content, code, assets, UX, security, performance, economy, and commercial/live-ops readiness.
**Method:** full-codebase exploration + six specialised deep-dives, every headline claim re-verified against a live build (`pnpm lint / tsc / test / build`), the deployed dist (Playwright), and Monte-Carlo economy simulation over the *real* constants. This is the third audit generation; it supersedes `audit-2026-07.md` (GEN-1, 07-13) and `production-audit-2026-07-16.md` (GEN-2).

> **One-line verdict:** The game itself is materially further along than any doc claims — the P0 tranche from the last audit was genuinely fixed and Village-Life shipped — but the project has drifted into a *false-green* state: **CI has been failing on `main` for three days and nobody noticed**, and underneath that sit one security-critical account-takeover path, several economy exploits that violate the game's own "energy is never given free" pillar, and three commercial gaps that would each, on its own, sink the soft-launch plan. None are large; all are fixable in roughly 6–8 focused weeks before a friends-&-family beta.

---

## 1. Executive summary & scores

Hearth is a genuinely differentiated, well-architected cozy-wellness merge game. The core is pure/deterministic and testable (326 passing unit tests), the save system is disciplined (v17 migration chain + strong null-guard), the ethical pillar ("energy comes from living, never sold") is real in code — I could not find a single coins→energy or pay-to-power path. The problem is not the vision or the foundation; it is a **quality-gate collapse** that has let regressions and exploits accumulate unseen, plus a set of pre-launch commercial/compliance items that have not been started.

| Dimension | Score | One-line |
|---|---:|---|
| Architecture & code quality | **8.0 / 10** | Clean layering, deterministic core, good tests — dragged down by a 1,489-LOC god-object and a broken green-gate |
| Feature completeness (web MVP) | **80%** | Story, board, energy, duel, 7 mini-games, retention nudges all shipped; native/cloud-account/monetization layers absent |
| Gameplay & balance | **6.5 / 10** | Loop is satisfying but economy inflates ~6.8× and three faucets are exploitable |
| UX & accessibility | **6.0 / 10** | Strong reduced-motion/safe-area baseline; board is keyboard-unusable and text-scale breaks the frame |
| Security | **4.5 / 10** | One critical stored-XSS→account-takeover path; no CSP; no API rate-limit |
| Performance | **6.5 / 10** | rAF stacking fixed; 60 MB unoptimised art + full-scene 60fps redraw + save-on-every-event remain |
| Production/CI readiness | **3.5 / 10** | **CI red on `main` since 2026-07-17**; deploy dormant; no branch protection |
| Commercial/live-ops readiness | **3.0 / 10** | Retention gates unmeasurable, no account recovery, chapter-pass product already given away free |

**The three things that must be true before soft launch, none of which are true today:** (1) the retention numbers the whole go-to-market plan hinges on can actually be measured; (2) a player who loses their phone does not lose their village; (3) there is something left to sell. Details in §11.

---

## 2. Prior-audit delta (what the docs get wrong)

**Trust code over docs.** Several top-level docs are stale by up to 2×. The new audit's first job is to reset ground truth:

| Metric | CLAUDE.md says | Actual (verified 07-20) |
|---|---|---|
| Unit tests | 155 | **326** (40 files) + 5 e2e |
| Save version | v13 | **v17** |
| Art delivered | "Batches 8+ NOT delivered" | **all 20 chains, 14 buildings + L2/L3, medallions, splashes wired**; ~72 assets still absent (late-game + decor) |
| Capacitor | "not yet built" | config-only seam; still no `ios/`/`android/` dirs (this part accurate) |
| Chapters/orders (README) | 24 orders / 4 chains | **72 orders / 6 chapters / 20 chains** |
| Service worker (DEPLOY.md) | `selfDestroying:true`, flip before launch | already `registerType:'prompt'` + SWR art cache |

**GEN-1 (07-13) findings status:** A1 linter → **FIXED** (ESLint+Prettier now CI-gated — though currently failing, see §5). Still open: no API rate-limit (§7 H2), no CSP/`_headers` (§7 H1), `user-scalable=no` → **FIXED**, reduced-motion default → **FIXED**, native `confirm()` → **PARTIAL** (one `window.prompt` survives at `settings.ts:153`).

**GEN-2 (07-16) findings status:** the **entire P0 tranche is genuinely fixed** (PRs #19–21): C1 PWA stale-cache, C2 rAF stacking (verified — re-entry guard at `map-view.ts:764`), C3 save sanitizer completeness, C4 `beginDay` re-save, C5 SyncController now tested. U1/U2 FTUE + reward-feel fixed. **Still open / newly-nuanced:** G1 coin inflation (claimed 5×→3.5×; **actually still ~6.8× lifetime** — §10), G2 Ch5-6 grind ("fixed" but the real wall moved to **Chapter 2** — §10), art weight (grew 51→60 MB, no WebP), R3 daily variety (~2-week runway), social still simulated.

**Retention-nudges plan:** all 4 checkpoints landed (discovery engine, glow markers, daily notification, dawn digest) — confirmed in code, save at v17.

Full doc-drift corrections in the appendix.

---

## 3. Feature completion matrix

| System | State | Notes |
|---|---|---|
| Merge board (6×7, tap+drag, tidy/lock/undo/auto-merge) | ✅ Complete | Pure `board.ts`; well-tested |
| Energy from real life (11 actions, health tiers, streak/chest/freeze) | ✅ Complete | Health-Connect aggregation core written & tested; **native binding absent** |
| Story (72 orders, 6 chapters, 13 zone stages) | ✅ Complete | Town physically whole at order 24 — orders 25–72 add only seasonal flourish (visible-progress gap, §8) |
| Endless mode (post-72 LCG generator) | ✅ Complete | Clean; only touches 4 of 20 chains |
| Bonfire Duel (real-time vs AI) | ⚠️ Shipped but exploitable | Uncapped coin/item faucet (§10) |
| 7 Village-Life mini-games | ✅ Complete | Healthy economy; double-bank exploit (§9) |
| Retention: streak, chronicle, discovery nudges, daily notification | ✅ Complete | Notification fires app-closed **only on native**; web path no-ops |
| Cloud save (D1 + Pages Function) | ⚠️ Real but fragile | Anonymous device-key = account; silent-clobber bug + no recovery (§9, §11) |
| Social (friends/gifts) | 🟡 Simulated stub | Hardcoded friends; "they joined" is a free-energy faucet in the shipped build (§9) |
| Monetization / entitlements | ❌ Absent | No billing code; no seam; **the planned chapter-pass content is already free** (§11) |
| Native shell (iOS/Android, HealthKit/Health-Connect, push, haptics) | ❌ Absent | Capacitor config-only; all seams resolve to web/self-report/no-op |
| Analytics backend | ❌ Absent | Reaches a server only if `VITE_ANALYTICS_ENDPOINT` set; no vendor SDK |
| Light theme / landscape | ➖ Out of scope by design | Dark-only, portrait-only |

**Abandoned/vestigial:** `storySeen` (write-only, grows unbounded), `flags.windDownShown` (dead — `main.ts` uses a module-local), `xp` magnitude (only read as `>0`), `minigames.lastUnlockDay` (self-documented vestigial), dead exports `beaconPath`/`beaconSlot`, dead `bought` event. Three unmerged remote branches carry 5 commits, all superseded — safe to prune with the other 15 merged branches.

---

## 4. Gameplay systems & balancing

The loop — *live well → earn energy → merge → deliver → watch the village heal* — is sound and the emotional hooks (villager memory, chronicle, real-calendar seasons, reactive weather) are above genre par. Balance is where it frays. Full simulation in §10; headlines:

- **The advertised difficulty curve doesn't match the real one.** The pacing test (`economy-pacing.test.ts`) models each order as `2^level × cost`, ignoring that the producer spawns from a weighted 4-chain table — so a `keepsake` L6 item costs an **expected 356 taps, not 64**. Dilution-aware, the true grind wall is **Chapter 2 (~16 casual days)**, not the Ch5-6 the last patch tuned. The test passes only because its model is ~2.2× cheaper than reality.
- **Coin economy inflates ~6.8× over its lifetime.** Total sink capacity is ~7,525 coins; an engaged player earns ~51,000. "Rich with nothing to buy" arrives around **day 9–11**. Recommendation: add an L4 "prestige" building tier + a repeatable seasonal sink, and trim town-request/late-order coin rewards.
- **Passive regen quietly rivals wellness** (3 check-ins/day ≈ 90 energy vs a realistic healthy day's ~72) — it dilutes the pillar by rewarding app-checking. Slow it (3→6 min, cap 30→20).
- **Post-story novelty runs dry in ~2 weeks** (9 quest defs, 24 request atoms, milestone dead-zone days 30→100). Expand pools; add mid-milestones.

---

## 5. Technical audit

### 5.1 CRITICAL — the green-gate has collapsed
CI (`ci.yml`: install → lint → format → typecheck → test → build) has **failed on every merge to `main` since 2026-07-17** (PRs #25, #27, #29, #31, #33; last green was #13 on 07-14). Verified live on the current tree:

- `pnpm install --frozen-lockfile` **fails** — `pnpm-lock.yaml` is missing `@capacitor/local-notifications@^8.0.0` (added to `package.json`, never locked).
- `pnpm lint` **fails** — 4 errors in `tests/discovery.test.ts` (unused import; 3× unsafe-any).
- `pnpm format:check` **fails** — 5 files unformatted (`src/core/almanac.ts`, `src/core/minigames.ts`, `src/ui/minigames.ts`, `src/ui/settings.ts`, `tests/almanac.test.ts`).
- `tsc --noEmit` passes; 326 tests pass; `build` passes.

This went unnoticed because the deploy workflow is dormant (`CLOUDFLARE_ENABLED` unset) and there is **no branch protection** requiring green CI to merge. The project's own "always land green" rule (CLAUDE.md) has been broken for three days. **This is the single most important thing to fix** — not because the failures are hard (they are ~30 minutes of work) but because a dead gate means every finding below could recur silently. Fix: `pnpm install` to relock, `pnpm lint --fix` + `pnpm format`, fix the 3 unsafe-any casts, then **turn on branch protection** so red can't merge again.

### 5.2 Determinism leak
`game.ts:454-455` — the producer spawn uses live `Math.random` for both chain and cell. This is the only true RNG leak in the "deterministic core," and it leaves the primary spawn path unseedable/untestable. `pickSpawnChain` itself is pure (takes an injected `rand`); thread a seeded RNG through `tapProducer` the same way `duel.ts`/`minigames.ts` already do.

### 5.3 God-object
`game.ts` is 1,489 LOC — one `Game` class with ~90 methods spanning every subsystem, plus a god-`emit()` (`:329-378`) that re-scans quests, achievements, milestones and collections **and re-serialises + persists the entire state on every event**. This is both a maintainability and a performance problem (§6). Recommend extracting per-subsystem controllers behind the same event bus, and moving the progression sweep behind change-detection.

### 5.4 Dead code
~275–390 production-unreachable lines in `map-view.ts` (procedural-town branches, dead when composed art is present — keep only the `!plate` fallback that renders until the 3.5 MB island decodes); dead exports `beaconPath`/`beaconSlot`; dead `bought` event; vestigial `xp`/`flags.windDownShown`/`storySeen`. None urgent; bundle them into a hygiene pass.

### 5.5 Correctness bugs (from QA deep-dive, reproductions confirmed)
See §9 — the notable ones are the cloud-sync silent-clobber (High) and the post-midnight chronicle-loss (Medium).

---

## 6. UI/UX review

Verified against source and the live dist via Playwright.

- **P1 — the merge board is keyboard/screen-reader-unusable.** `board-view.ts:55-66` declares `role="grid"` with `role="gridcell"` cells that have no `tabindex`, no key handlers, no `role="row"`. Live: 42 cells, 0 focusable. A screen reader announces a grid it cannot enter; keyboard users cannot merge, tap the producer, or open item info (long-press only). The duel board is identical. The existing tap-to-merge model maps 1:1 onto select-then-activate, so the fix is contained: roving `tabindex` + Enter/Space + arrow navigation.
- **P1 — Text-size "L" pushes the bottom nav off-screen.** `settings.ts:63` scales via CSS `zoom` on `#app`; at zoom 1.12 the document is 945 px tall in an 844 px viewport, so the entire nav sits below the fold. `zoom` also breaks canvas hit-testing (building tap hitboxes drift up to 12% because `screenToWorld` assumes unzoomed width) and the drag-ghost size. Replace `zoom` with `font-size`/rem scaling (the `--fs-*` tokens are already mostly in place).
- **P2 — 15 of 16 dialogs have no focus management.** Only the dynamic `confirmDialog` moves focus, traps it, restores it, and closes on Esc/backdrop; every other sheet/modal/overlay has role markup only, and `#app` is never `inert`/`aria-hidden` while a dialog is open. One shared `openDialog()` helper (modelled on `confirm-modal.ts`, which already contains all the logic) clears most of this at once.
- **P2 — Toasts drop messages.** `toast.ts` is a single element, last-writer-wins, fixed 2.8 s; because `emit()` dispatches follow-up `questDone`/`achievement`/`milestone` synchronously, a single action that earns three things shows only the last for 2.8 s. Queue or coalesce.
- **Strong baseline (verified clean):** `user-scalable` allowed, OS reduced-motion honoured (~25 gates), safe-area insets applied throughout, British spelling consistent, offline UX graceful, landscape/desktop holds. Emoji still fills the tool-bar chrome (`⚙ 🔍 🪴 📸 ↩ ✦ ⚒ ⚔ 🔒 🪙`) with no art-swap path — add to the asset brief.

---

## 7. Security & API hardening

### C1 — CRITICAL: stored XSS via traded save → device-key theft → account takeover *(confirmed)*
`screens.ts:118` (chronicle text) and `social-screen.ts:63/81/95/107` (villager/gift/friend names) render save-derived strings into `innerHTML` **without escaping** — even though the same file has a working `esc()` used elsewhere (two paths simply missed it). `importSave()` only presence-checks top-level fields (`save.ts:86-108`); it never validates nested strings. Because the game *actively promotes* save export/sharing (`growth.ts`, Settings import), an attacker can craft a save whose chronicle entry is `<img src=x onerror=...>` that exfiltrates `localStorage['hearth:device-key']` on the victim's next Journal render — and **the device key *is* the cloud account** (`functions/v1/save.ts:11`), so the attacker can then read and overwrite the victim's cloud save. Fix (defence in depth): escape at every save-derived sink (promote `esc()` to a shared module), validate/clamp strings in `migrateState`, and ship the CSP below so an inline handler can't execute even if a sink is missed later.

### H1 — HIGH: no CSP / no `public/_headers` *(confirmed)*
No security headers anywhere. Directly amplifies C1 and leaves the app clickjackable. A drafted `_headers` (`script-src 'self'`, `connect-src 'self' https://api.open-meteo.com`, `frame-ancestors 'none'`, `object-src 'none'`, plus `X-Frame-Options`/`X-Content-Type-Options`/`Referrer-Policy`/`Permissions-Policy`) is viable — `index.html` has no inline scripts (verify `grep -c '<script>' dist/index.html` is 0 after build; if not, set `injectRegister:null`). Add `VITE_ANALYTICS_ENDPOINT`'s host to `connect-src` if off-origin.

### H2 — HIGH: no rate-limiting on `/v1/save` *(confirmed)*
`KEY_RE` accepts any attacker-chosen key with no registration or proof-of-work; the 300 KB cap bounds per-row size but not the number of rows, so fabricated keys can grow D1 storage and burn the write-quota unboundedly (cost + functional DoS of sync). Fix: a Cloudflare WAF rate-limit rule on `/v1/save*` now (free-plan allows one), a per-key KV throttle later, and tighten `MAX_SAVE_BYTES` 300 KB → 64 KB.

### M1/M2 — MEDIUM
- Rev-gated write is a read-then-write TOCTOU (`save.ts:117-125`) — fold the gate into SQL (`... WHERE excluded.rev > saves.rev`) to make it atomic.
- The "no personal data" comment (`functions/v1/save.ts:14`) is wrong: raw health is correctly *not* stored, but the player's free-text **gratitude journal** and wellness-behaviour patterns sync to D1 in plaintext. Correct the comment, cover it in the privacy policy, and consider client-side encryption of the save blob (on-brand for the ethics pillar).

**Verified clean:** D1 fully parameterised (no injection), strict bearer-auth, same-origin CORS posture, `pnpm audit --prod` clean, no secrets in repo, no SW cache-poisoning surface, `?tester` is client-only.

---

## 8. Asset integration & content audit

- **Manifest ↔ disk fully reconciled:** 436 manifest ids, 442 PNGs on disk, **0 referenced-but-missing**; 6 orphans (`app_icon` used directly + 5 unused `debris_*`). Move `feature_graphic.png` (2 MB store collateral) out of `public/art` so it never ships.
- **~72 assets genuinely still absent** (per the disk-verified `art-todo-2026-07-20.md`): the **late-game restoration set** (Ch3-6 buildings + winter/spring props + returning NPCs) is the one that matters — it is what would make **orders 25–72 visibly change the town** instead of the current flourish-only plateau. The **beauty-decor set** (8 premium pieces) is the art blocker on the G1b coin sink. Both are art-blocked, not code-blocked.
- **Audio is 100% synthesised** (WebAudio SFX + 3-layer music + mood stems + meditation drone) — zero audio files. Narrated meditations and licensed music are explicit M2 stubs. This is a legitimate ship-now state, but it caps the "cozy" sensory bar; budget for real ambient beds before commercial launch.
- **Dead/underused content:** the `music` merge chain is 100% inert; greenhouse/smithy/apothecary are sell-only; collections cover 5 of 20 chains (4 auto-complete via story); the `char_mayor_bust` art has no villager def. The Events screen is honest (2 real rhythms) but static — no live-ops machinery.

---

## 9. Game feel, retention & QA findings

The moment-to-moment feel is good (satisfying merges, warm feedback, gentle anti-compulsion copy). The QA deep-dive reproduced the following (all confirmed against the real modules):

| Sev | Bug | Evidence | Fix |
|---|---|---|---|
| **High** | **Cloud-sync silently clobbers a diverged device** — conflict detection is unreachable in production (`baselineRev` read at construction, `start()` runs before anything bumps rev, so `localAdvanced` is always false at launch); rev is a per-device push counter, so "more pushes wins" and the other device's real progress is overwritten. Violates the "never silently wipe a village" pillar. | `sync-controller.ts:36,57,117` | Persist `hearth:sync-baseline` = rev at last successful reconcile and compare against it, or compare content not push counts |
| **High** | **Undo-farm** — `drop()` awards xp/stats/quests/collections but `undoLastMerge()` restores only the board, so merge→undo loops farm currency & achievements for free | `game.ts:565-589` | Snapshot & restore stats/xp/maxTier with the board, or don't count undone merges |
| **High** | **Duel is an uncapped coin/item printer** — no entry cost, instant rematch, ~300–540 coins + ~8 order-deliverable items per ~90 s win (sim: 52–99% winrate) | `game.ts:1083-1101`, `ui/duel.ts:32` | Entry cost + daily reward cap + pacing-scaled payout (§10) |
| **High** | **Simulated social is a free-energy faucet in the shipped build** — Invite→"they joined" grants +15 energy per fake friend, unbounded (pillar violation) | `social-screen.ts:108`, `social.ts:12` | Gate "they joined" behind tester mode until the real backend exists |
| Medium | **Post-midnight chronicle loss** — if the first call after midnight is `completeAction`/`logMeditation`/`logRecovery`, yesterday's chronicle entry & stats day are silently dropped | `game.ts:785-802` | `beginDay(now)` at the top of `applyRecord` |
| Medium | **`finishMinigame` has no in-flight guard** — finish-without-start and double-finish both bank full rewards | `game.ts:1289-1337` | Stamp a pending-run token in `startMinigame`, require+consume it in finish |
| Medium | **Clock manipulation** farms daily bonus/chest/hearthstone (backwards day changes count as new days) | `actions.ts:112-143` | `if dayGap(...) <= 0 return advanced:false` |
| Medium | **Silent save failure** — quota/private-mode errors are swallowed; worse, sync then pushes the stale save as "newest" | `save.ts:117-123` | One-time "can't save on this device" toast; skip rev-bump/push when the last write failed |
| Medium | **Tester mode** is sticky-forever, guessable (`?tester` in public JS), untagged in analytics, and writes real rewards into the save | `main.ts:286-306` | Strip in prod builds or make tester rewards non-persistent; tag tester sessions out of retention metrics |
| Low | reset() leaves the undo snapshot (pre-reset board resurrectable); 800 ms post-adopt re-clobber window; energy countdown wrong after clock rewind; minigame card overstates ember past the daily cap; `storySeen` unbounded | see §3 / QA notes | one-liners each |

**Verified clean:** coins→energy guardrail holds (with passing tests), order-72→endless transition, full v8→v17 migration + round-trip + hostile-import rejection, health-energy idempotency, board rules, decor 50% refund (no buy/refund loop).

---

## 10. Economy simulation (detail)

Constants imported from the real modules; duels are Monte-Carlo over the actual `createDuel`/`raceMerge`/`bestDuelMove` code.

**Per-chapter pacing** (net energy after refunds; casual = ~40 energy/day for producer taps):

| Ch | net energy | casual days | engaged days |
|---|---:|---:|---:|
| 1 The Letter | 283 | 7.1 | 3.5 |
| 2 Shadows | **631** | **15.8** ← true wall | 7.9 |
| 3 Ninth Night | 513 | 12.8 | 6.4 |
| 4 New Sails | 264 | 6.6 | 3.3 |
| 5 Long Winter | 417 | 10.4 | 5.2 |
| 6 Spring Tides | 451 | 11.3 | 5.6 |
| **Story** | **2,106** | **~53** | **~26** |

**Coin faucet vs sink (engaged):** total sink capacity ≈ **7,525**; cumulative income crosses it by ~day 9–11 and reaches **~51,000 by story end (~6.8×)**. The last audit's "3.5×" counted order rewards only (half the faucet).

**Fixes (both sides of the ledger):**
- *Energy:* reweight `SPAWN_TABLE` to wood 28 / harvest 30 / hearthfire 14 / keepsake 28 (keepsake L6 drops 356→229 taps; Ch2 → ~10 casual days); fix the pacing test's `spawnsForLevel` to divide by spawn weight so it can *see* dilution.
- *Coins:* add an L4 "prestige" building tier (~+10,600 sink) + a repeatable seasonal-festival sink; cut town-request coins (`×14`→`×8`) and Ch4-6 order rewards ~×0.6.
- *Duels:* entry = 1 token + 2 energy; cap rewards at 3 wins/day; pay `20 + score/8 + 10·min(streak,6)`; exclude L≥3 spoils.
- *Regen/gauge:* `regenMs` 3→6 min, cap 30→20; `DAILY_GAUGE` 100→75.
- *Runway:* add `ms-45`/`ms-60` milestones, expand quest pools to 5/group, let endless orders occasionally ask for workshop chains.

Mini-games themselves are **healthy** — a run is net-negative energy (spend 4, earn ≤2, daily ember cap 5), so they can't substitute for wellness. The pillar holds there.

---

## 11. Commercial & live-ops readiness

The Finch-shaped thesis (ethical subscription on a habit-retention moat) is well-evidenced and the codebase's ethics are real. Three findings each independently threaten the soft-launch plan:

- **F1 — the retention gates are currently unmeasurable.** The go/no-go metric (D1≥30–40% / D7 15–20% / D30≥4%) cannot be computed: the analytics sink only exists if `VITE_ANALYTICS_ENDPOINT` is set (it isn't, and there's no backend), events carry a random per-load session id with *no stable identity* by design, and the on-device cohort record lives in localStorage that Safari ITP wipes after 7 days — corrupting exactly the lapsed-player signal the gate measures. Fix (M): wire PostHog (EU) behind the existing `setSink()` facade, use `deviceKey()` as a stable distinct-id, compute cohorts server-side, add an FTUE consent toggle.
- **F2 — device-key-is-the-account with no recovery.** The key that *is* the cloud slot is itself minted into the localStorage that eviction deletes — so an ITP wipe or a lost phone orphans the cloud village *forever* with no lookup (no email, no name), and private-mode players collide on one shared `ephemeral-no-storage-0000` slot. For a wellness game whose product *is* the accumulated village, this is a 1-star-review and (post-subscription) chargeback generator on the *normal* web-funnel path. Fix (M): an email magic-link *claim* endpoint (one D1 table, two Pages Functions, one settings card — also feeds the email list), then Sign-in-with-Apple/Google at native wrap.
- **F3 — the chapter-pass product has already been given away free.** The roadmap intends to sell "Ch. 3+, the Alden Vale arc" — but Chapters 3–6 already ship free and complete that mystery. The pass has an empty shelf. Fix (content, L): reserve all *future* arcs (Ch7+) for the pass and author before Phase D; do not retro-paywall shipped content.

**Also:** no entitlement seam yet (F4 — add an `entitled()` provider + optional `premium` save mirror now, RevenueCat at Phase D — small, and it rework-proofs every later paywall); no live-ops machinery (F5 — a `/v1/config` Pages Function for remote economy tuning + a JSON event template on the endless generator); the email list still routes to a personal `mailto:` (F6 — swap for a real endpoint, already on the shortlist); compliance not started (F7 — privacy policy, consent UI, Apple 5.1.3 posture, Play Health-Connect declaration and data-safety, age rating — ~2–3 weeks of paperwork+small code, all rejection-critical).

**Competitive position:** Hearth is the only title in its comp set (Finch, Merge Mansion, Gossip Harbor, Love & Pies) where the energy economy *is your real life* — importing a habit-app D30 into a genre whose leaders live at ~3–8% D30, while being structurally immune to the energy-squeeze resentment that defines the merge leaders. That is a real, defensible, shareable hook. The gaps versus each comp are account/identity, live-ops cadence, and a measurement stack — all on this list.

---

## 12. Production readiness — prioritised backlog

**CRITICAL (do before anything else ships):**
1. **Fix CI and turn on branch protection** (§5.1) — relock deps, `lint --fix` + `format`, fix 3 unsafe-any casts; require green to merge. ~½ day.
2. **Close the stored-XSS → account-takeover path** (§7 C1) — escape all save-derived sinks + validate in `migrateState` + ship CSP. ~1–2 days.

**HIGH (before friends-&-family beta):**
3. Fix the cloud-sync silent-clobber (§9) — the pillar promise. 4. Kill the economy exploits: undo-farm, duel faucet, simulated-social energy faucet, `finishMinigame` double-bank (§9/§10). 5. Ship `public/_headers` + WAF rate-limit on `/v1/save` (§7 H1/H2). 6. Keyboard-accessible merge board + fix text-scale `zoom` (§6). 7. Wire analytics identity + backend so beta retention is measurable (§11 F1). 8. Email magic-link account recovery (§11 F2).

**MEDIUM (before soft launch):**
9. Rebalance economy (spawn weights, coin sinks, regen, gauge — §10) + fix the pacing test's model. 10. Shared `openDialog()` a11y helper + toast queue (§6). 11. WebP art pipeline (60 MB → ~8–12 MB) + hashed filenames + `CacheFirst` (§ perf). 12. Layer-cache the map's static scene + 30 fps ambient cap; stop `renderList` rebuilding on every event; debounce `saveState`; suspend audio when hidden (§ perf). 13. Compliance paperwork: privacy policy, consent UI, store declarations (§11 F7). 14. Late-game restoration art so orders 25–72 visibly progress (§8). 15. Post-midnight chronicle-loss + clock-manip + silent-save-failure fixes (§9).

**LOW (hygiene / polish):**
16. Delete dead code & vestigial state; strip tester hooks in prod; refresh the 4 stale docs; prune 15 merged branches + 6 scratch PNGs; add the tool-bar glyphs to the asset brief; entitlement seam + `/v1/config` scaffolding for later.

---

## 13. Roadmap — current state → polished MVP → commercial release

**M0 · Stabilise the gate (this week).** CRITICAL #1–2. Exit: CI green on `main`, branch protection on, XSS closed. *This unblocks trustworthy iteration.*

**M1 · MVP polish (2–3 weeks).** HIGH #3–6 + MEDIUM #9–10, #14–15. Exit: no known exploit or pillar violation; merge board keyboard-usable; text-scale doesn't break the frame; orders 25–72 visibly heal the town; economy re-simulated within a sane band.

**M2 · Friends-&-family beta (2 weeks + 1 week live).** HIGH #7–8 first (measurement + recovery), then recruit 5+ external testers. Exit gate (the real one): 5 testers finish FTUE + Chapter 1 unaided, **zero save-loss**, permanent Cloudflare URL live (one human `wrangler login`), retention instrumented and reading real numbers.

**M3 · Native wrap (3–4 weeks).** `cap add android/ios`, bind Health-Connect/HealthKit (aggregation core already written & tested), closed-app notifications, cloud-save recovery via platform sign-in, haptics. Compliance paperwork (#13) lands here with the first store upload. Exit: real health energy on device, app-closed reminders fire, store review passed on internal track.

**M4 · Soft launch (PH/CA/NZ/AU).** WebP/perf (#11–12) shipped for low-end devices; live-ops `/v1/config` + event template so the economy can be tuned without a release. **Exit gate is data, not features:** D1 ≥ 30%, D7 ≥ 15%, D30 ≥ 4% measured via the wired analytics, over a real cohort. Do not proceed to monetization until this passes.

**M5 · Commercial release.** Author the Ch7+ arc (the pass's actual product — F3), integrate RevenueCat behind the `entitled()` seam (subscription + chapter pass + cosmetic sets; never energy, never pay-to-power), web Stripe layer for the funnel. Exit: trial→paid ≥ 30% on the annual plan; support/recovery flows proven at beta scale.

---

## Appendix — doc-drift corrections to land in the hygiene pass
- **CLAUDE.md:** 155 → 326 tests; save v13 → v17; "Batches 8+ not delivered" → most art delivered, ~72 assets remain (late-game + decor).
- **README.md:** 95 tests → 326; 4 chains/24 orders → 20 chains/72 orders/6 chapters.
- **DEPLOY.md:** remove the `selfDestroying:true` "flip before launch" note — already `registerType:'prompt'` + SWR.
- **mvp-status.md:** fully stale (v10/95 tests/M0-M5) — refresh or retire.
- **analytics.md:** "M2 sink: Firebase" → PostHog (per §11).

---

*Prepared by an automated multi-disciplinary audit (game-direction, systems-design, engineering, QA, security, performance, and commercial lenses), 2026-07-20. Every headline claim was re-verified against a live build, the deployed bundle, or simulation over the real constants. No production code was modified in producing this report.*
