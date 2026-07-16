# HEARTH — Production Audit & Prioritised MVP Report

*2026-07-16 · audited at `dev` (post Village-Life merge, PR #18 + #16) · three parallel domain audits: technical integrity, art/asset layer, game design & economy · all findings carry file:line evidence; economy numbers computed from source*

**Scope metrics:** `src/ui` 7,506 LOC · `src/core` 3,914 LOC · `src/data` 2,534 LOC · 427 PNGs ≈ 51 MB (unhashed filenames) · 282 tests green.

**How to read this:** every issue lists *why it matters → proposed fix → complexity (S/M/L) → priority (P0 pre-launch / P1 launch week / P2 first month / P3 post-MVP)*. The closing section is the roadmap in one table.

---

## 1 · Critical bugs & broken systems

### C1 — The PWA stale-cache problem is unsolved for launch — **P0 · M**
`vite.config.ts:16,22,49-60`. Today's build ships `selfDestroying: true` — the service worker unregisters itself and wipes caches on every load. That *masks* the stale-build problem for testers, but it also means **no offline play and no installability**, and the day it's flipped back for launch the old bug returns, worse:
- `registerType: 'autoUpdate'` activates a new SW silently but **never prompts open tabs to refresh** — there is no `registerSW({ onNeedRefresh })` / update toast anywhere in `src/`.
- The `/art/` runtime cache is `CacheFirst` with a **30-day** expiry over **stable, unhashed filenames** — any redrawn sprite that keeps its name serves stale for up to a month after deploy.

*Why it matters:* this has bitten every deploy this cycle ("testers see the old build no matter how many reloads"), and it silently corrupts the launch experience.
*Fix:* add a `virtual:pwa-register` flow with a warm "A newer Emberhollow is ready — tap to refresh" toast; switch `/art/` to `StaleWhileRevalidate`; then flip `selfDestroying: false`.

### C2 — Stacking rAF render loops on navigation — **P0 · S**
`src/ui/map-view.ts:263-271` + `src/ui/app-shell.ts:143-152`. `setVisible(true)` calls `this.loop()` unconditionally with no `if (!this.raf)` guard, and `AppShell.go()` calls `map.setVisible(id === 'home')` on **every** nav tap — including tapping Home while already on Home. Each such tap starts *another* perpetual full-canvas draw loop; `cancelAnimationFrame` only ever cancels the newest id, orphaning the rest.
*Why it matters:* real battery drain and jank that compounds the longer a session runs — exactly the kind of "game feels heavy on my phone" report that's hard to trace later.
*Fix:* one-line guard (`if (!this.raf) this.loop();`) mirroring the existing `visibilitychange` handler which already guards correctly.

### C3 — Save sanitizer misses required fields — **P0 · S**
`src/core/save.ts:75-90`. The final validation checks 13 keys but omits required `GameState` fields: `repository`, `coins`, `duelStreak`, `xp`, `orderIndex`, `storySeen`, `nextUid`, `decor`, `nextDecorId`, `achievements`, `questsClaimed`. A truncated or corrupt save missing any of those passes migration and loads a broken game.
*Why it matters:* save integrity is a pillar ("never silently wipe a village"); a broken-but-loaded state is worse than a rejected one because it can then be re-saved.
*Fix:* add the missing keys to the guard (the newer optional fields are all read defensively and are fine).

### C4 — `beginDay` re-emits and re-saves every 20 s after midnight — **P0 · S**
`src/core/game.ts:390-403` + the 20 s `tick()` in `main.ts`. The Chronicle-write branch checks `actions.day !== today` but never advances `actions.day` (only a logged action does). `appendEntry` dedups so no duplicate entry appears, but every tick re-enters the branch — rebuilding state, emitting `chronicle`→`state`, forcing a full re-render and a `saveState` **every 20 seconds** until the player's first action of the day.
*Fix:* gate on a persisted "last chronicled day" marker.

### C5 — `SyncController` is untested — **P0 · M**
`src/platform/sync-controller.ts` (wired at `main.ts:193-214`) orchestrates the cloud-save reconcile: adopt-remote vs keep-local vs reload-on-conflict — the code that decides **which village survives when two devices disagree**. The provider has 3 test suites; the controller has zero.
*Why it matters:* it's the highest-blast-radius untested path in the game. A wrong branch = a player's village gone.
*Fix:* a focused test suite around the conflict/adopt/keep-local matrix.

---

## 2 · Missing or disconnected assets

### ✅ Zero live art gaps
Every `artUrl()` id — including all templated forms (`item_${chain}_${level}` across 20 chains, `char_*_bust`, `town_*_l2/_l3/_ruin/_wip`, `stage_*`, `chapter_*`, `action_*`) — resolves to a shipped file. Every emoji/CSS fallback in the codebase is **dormant** (its art exists). *(An initial finding that `item_stone_6` was missing was double-checked and is wrong — the file ships and is in the manifest.)* The asset layer is fully connected.

### A1 — Floating map sprites (the reported "random sprites" bug, root-caused) — **P0 · S**
`src/data/town-layout.ts:231` — `tree_dead_c` at (x 0.6, **y 0.31**) and `:249` — `tree_pine` at (x 0.47, **y 0.31**). The north coastline at those x-positions sits at y ≈ 0.376-0.378, so both trees' baselines are ~0.07 **above the waterline** — they render floating over the sea. `tree_dead_c` shows at stage 0-1 (the opening game state), `tree_pine` at stage 2.
*Fix:* move both to y ≥ 0.40 (on land), verify with a PIL composite over `map_island_plate.png`.

### A2 — Minor placement niggles — **P2 · S**
`prop_sign` (0.575) and `prop_barrel` (0.585) sit inside/kissing `town_garden`'s footprint (0.565-0.695) at near-identical baselines (`town-layout.ts:45,204,50`); `town_blacksmith` (0.45, 0.9) has its base on the south tideline (`:46`). Cosmetic — nudge during the next map pass. Scale is sound everywhere (heights derive from natural aspect; no distortion found).

### A3 — Prune the unused asset pile — **P2 · S/M**
- **Disk orphans (delete):** `debris_barrel/crate/driftwood/planks/wheel.png` — superseded by the `debris_a..e` set actually used.
- **~40 manifest ids with zero references:** 17 `res_*` icons (only coin/energy/chests are used), `btn_primary/secondary/disabled` (buttons are CSS-styled; painted skins never wired), all 5 `flag_*`, 3 unused `pin_*`, 3 unused `stake_*`, `energy_empty/low/med`, `fx_flame_tiny/lantern/fireplace`, `nav_map`, `panel_parch` (duplicate of `panel_parchment`), `panel_large/wood`, `popup_window`, `terrain_path`, `action_streak_reward`.
- **Dead code-gated art:** `stage_0..4` load only inside `if (!artUrl('town_townhall'))` — a branch that can never run.
- **Chest triplication:** one chest concept, three assets (`reward_chest`, `res_chest_open`, `res_chest_closed` — `reward_chest` is a dormant fallback).
*Why it matters:* ~dozens of files of dead weight in a 51 MB art folder, plus decision debt ("was this meant to ship?"). Either prune or deliberately wire the intended ones (painted buttons/panels would lift UI polish — see §4).

---

## 3 · Art consistency & visual quality

**Healthy:** one coherent painted style throughout; all six mini-game backdrops, tokens, banners wired; FX all animate through the single verified sprite-strip player (no CSS `steps()` remnants, no squished strips); audio has **no dead methods** — all 13 `feedback` exports are called, stems live, 3-layer music live.

Improvements:
| # | Item | Why | Fix | Cx | Pri |
|---|---|---|---|---|---|
| V1 | Well/Beacon/Forge backdrops are upscaled from ~370 px montage strips | Softer than the natively-rendered other three under close look | Regenerate at native 880×1120 using the §0 rules in `docs/asset-prompts-village-life-2026-07.md` | S (art only) | P2 |
| V2 | Chest concept ×3 assets | Inconsistent iconography risk | Consolidate on `res_chest_*`, delete `reward_chest` | S | P3 |
| V3 | Painted buttons/panels (`btn_*`, `panel_*`) unshipped | UI is CSS-flat where the art direction planned painted chrome | Decide: wire them (M) or prune (S) | S–M | P2 |

---

## 4 · UI/UX improvements

### U1 — FTUE never *demonstrates* the core differentiator — **P1 · S/M — highest-leverage UX fix in the game**
`src/ui/ftue.ts:20-61`. Onboarding is 7 well-built, skippable, event-gated steps (`waitFor: 'merge'`, `'delivered'`) — but the entire product thesis, "living well earns energy," is delivered as **one text paragraph** (step 6) and never actioned. The player exits FTUE having never earned a single point of energy from a real-world action, then hits the first "not enough energy" wall unguided.
*Fix:* add one step gated on `waitFor: 'action'` — have the player log a glass of water (or connect health) and *watch energy arrive*. Converts the differentiator from told to felt.

### U2 — Reward-feel gaps — **P1 · S**
- **Building upgrade is near-silent** (`home.ts:117-119` — a lone chime, no toast): the one purchase a player deliberately saves for has the weakest feedback of any spend. Add a warm toast + small map flourish.
- **Mini-game completion is toast-only** (`home.ts:142`) vs duels/chapters which get the full `feedback.chapter()` moment.
- **Personal bests are invisible** outside the one-time result popup — stored per game (`minigames.bests`) with a 0-100 score, never surfaced. Wire `game.minigameBest(id)` into the building card + Village Life index rows ("Best: 87"). Turns six thin games into a self-competition ritual at near-zero cost.

### U3 — Un-taught systems — **P2 · S**
Coins, the Workshop (unlocks at 6 deliveries), villager bonds, and the Journal are never introduced anywhere. A one-line contextual coach mark on first encounter each (the `coachOnce` helper already exists in `minigames.ts`) closes this cheaply.

---

## 5 · Gameplay balance & progression

The economy's load-bearing maths: building a level-L item costs **2^L producer taps = 2^L energy**. All numbers below are computed from `src/data/economy.ts` / `actions.ts` / shop data.

### G1 — Coin inflation ≈ 5× — **P1 (tune) + P2 (sinks) · S+M**
Story orders alone pay **35,605 coins** (24,810 of it in Ch5-6 at 800-1,600/order) against **~7,270 coins of total permanent sinks** (5 board skins = 1,270; ~12 building upgrade tracks ≈ 6,000). Achievements/streaks/quests/dailies add thousands more on top. And **decor is not a sink** — `removeDecor` (`game.ts:827-837`) refunds 100%, so the catalogue just parks coins.
*Why it matters:* by Chapter 4-5 the player has bought everything and coins become inert — which quietly hollows out the "coins buy beauty" pillar *because there isn't enough beauty stocked*.
*Fix (two parts):* **(a)** compress late-order coin rewards (data tuning, S); **(b)** stock a real late-game beauty catalogue — premium decor tiers, town-wide seasonal themes, named "monument" purchases — and split decor into *placed* (refundable, keep-everything holds) vs *commissioned* (permanent, non-refundable) (M).

### G2 — The Chapter 5-6 grind wall — **P1 · S**
Net energy by chapter (build taps − reward energy): Ch1 −116 · Ch2 −100 · Ch3 −156 · Ch4 −159 · **Ch5 −211 · Ch6 −225**. The wall is the ten **L6 orders = 64 taps each returning only ~20 energy (net −44)**, three of them in Chapter 6 (360 total taps). The reward curve does not track the 2^L cost curve, so the story gets grindier per delivery exactly when engagement is most fragile.
*Fix:* data-tune `ORDERS` — raise late `rewardEnergy` toward the cost curve, or cap consecutive L6 asks per chapter. (Whole story: 1,583 taps, −967 net energy; engaged players finish in ~2-4 weeks — a good MVP runway once the wall is shaved.)

### G3 — Energy economy: working as designed, one perception risk — **P2 · S**
Daily income: realistic healthy day ≈ **100-130** energy (theoretical all-actions ceiling ≈ 350); passive regen only 1/3min with a **30 cap**. A zero-action player is never hard-stuck but crawls (an L6 order = 3.2 hours of tap-as-you-regen) — so "living well earns energy" is genuinely load-bearing, the pillar holding. The risk is inverted: without health integration the game can feel like *punishment by absence*. U1 (FTUE) plus gentle copy at the empty-energy moment ("a short walk refills the hearth") softens this without touching the economy.

### G4 — Dead & underused content — **P2 · S/M each**
- **`music` chain (Conservatory) is 100% dead** — in no spawn table, order, request, minigame, or collection. Repurpose (a Conservatory mini-game / collection) or remove.
- **greenhouse/smithy/apothecary** chains are sell-only — no collection, order, or request touches them.
- **Collections cover only 5 of 20 chains** — 15 chains have no completion reward (`world.ts:294`).
- **`EVENTS` screen is a hardcoded mock** — static "Starts in 2d 14h" strings rendered read-only (`world.ts:309`, `screens.ts:334`). Ship a real (even minimal, seasonal) event system or remove the screen; a fake countdown erodes trust.
- Duels use only 3 of 20 chains.

---

## 6 · Performance & optimisation

| # | Item | Evidence | Fix | Cx | Pri |
|---|---|---|---|---|---|
| P1 | rAF loop stacking | §1 C2 | guard | S | P0 |
| P2 | 51 MB unhashed art; plate 3.5 MB always loads; six ~1 MB backdrops; `feature_graphic.png` 2 MB is a store asset — confirm it isn't shipped | top-20 table in appendix | WebP/AVIF conversion (plate + backdrops ≈ 70% smaller), prune §2-A3, exclude store art | M | P2 |
| P3 | `map-view.ts` = **2,688 LOC** incl. ~360 lines of dead procedural-ground code behind `if (!plate)` that can never run | `map-view.ts:1003-1364` | delete dead branch; split camera/draw/decor/recap modules | M | P2 |
| P4 | Full-DOM re-renders on every `state` event | subscribe handlers rebuild whole lists | acceptable at current scale; revisit if profiling shows jank | — | P3 |
| P5 | Vestigial state: `xp` accumulates but is only read as `xp > 0`; `flags.windDownShown` persisted but never read (local var used instead, `main.ts:63-69`) | `game.ts:556`, `types.ts:204` | fold into stats / actually read the flag | S | P2 |
| P6 | WorldMood glue hand-assembled 3× | `main.ts:257`, `map-view.ts:243,834` | extract `game.currentMood()` | S | P2 |

---

## 7 · Engagement & retention

**Already strong (verified):** New Day claim ritual · streak with hearthstones (no-punishment freeze, earned never bought) · weekly-rhythm chronicle prose · reactive world & seasonal ambience as ambient "the game noticed" retention. All pillars hold everywhere audited — no dark patterns found.

| # | Gap | Why it matters | Fix | Cx | Pri |
|---|---|---|---|---|---|
| R1 | **No re-engagement layer at all** — no push, no local notifications | Nothing brings a lapsed player back; even wellness apps (Finch) send one warm daily nudge | Opt-in local notification: "The hearth is warm — your New Day awaits." No streak threats, no FOMO copy | M | P2 |
| R2 | **Weekly reflection digest doesn't exist in code** — `composeWeek` is referenced in retention plans but was never built (`chronicle.ts` has only per-day `composeEntry`) | The genre's signature D7 ritual; pillar-perfect | Build `composeWeek` from the existing sentence pools; surface atop Chronicle on Sundays | M | P2 |
| R3 | Daily variety exhausts in ~2 weeks — quests are 3 categories × 3 tiers (9 permutations); endless orders cycle 12 ask / 10 done strings | Weeks 2-4 feel repetitive | Widen pools; add a rotating "featured village need" | S | P2 |
| R4 | Social is simulated — duel vs local AI; "friend joined" is a manual button (`social-screen.ts:152`) | The strongest genre retention lever is absent, and the current UI can read as broken | MVP: stage it honestly (label "practice duel", soften invite copy). Post-MVP: real async gifting/visits | S now / L later | P2/P3 |
| R5 | Post-story endgame is functional but flavour-thin (endless + 3 mini-game tokens + duels; no new mechanic after order 72) | Day-31+ players plateau | The G1 beauty catalogue + R2 digest + seasonal events are the natural fill | — | P3 |

---

## 8 · Content gaps & future production queue

1. **Art queue:** native-res regens for well/beacon/forge backdrops (V1) · collection art if G4 collections expand · painted buttons/panels decision (V3).
2. **Systems queue:** real events system or screen removal (G4) · `composeWeek` (R2) · local notifications (R1) · music-chain repurpose (G4).
3. **Platform queue:** flip `selfDestroying` off with the C1 update flow · Capacitor store build (icons/splash exist) · health-provider deep integration per platform.
4. **Testing queue:** SyncController suite (C5) · `platform/metrics.ts` + `providers.ts` (the soft-launch funnel readout depends on them) · a jsdom view-switch smoke test (would have caught C2/C4).

---

## The roadmap

| Priority | Items | Effort |
|---|---|---|
| **P0 — pre-launch** (~1 day) | C2 rAF guard · C3 sanitizer keys · C4 beginDay gate · A1 two floating trees · C1 PWA update-toast + art SWR · C5 SyncController tests | 4×S + 2×M |
| **P1 — launch week** | U1 FTUE real-action step · U2 bests surfaced + upgrade/minigame reward feel · G2 Ch5-6 tuning · G1a late-coin compression | 4×S/M |
| **P2 — first month** | G1b beauty catalogue + decor placed/commissioned split · R2 composeWeek digest · R1 local notifications · R3 variety pools · A3 asset prune + P2 WebP · P3 map-view split · U3 coach marks · G3 empty-energy copy · R4 stage social honestly | mix |
| **P3 — post-MVP** | Real social · music/Conservatory · events system · V2/V3 consolidation | L |

**Bottom line:** the game is in genuinely strong shape — zero broken asset references, all pillars verified holding, audio/FX fully wired, 282 tests green, and a core loop whose "living well" economy is provably load-bearing rather than cosmetic. The pre-launch risk concentrates in **plumbing, not gameplay**: the service-worker update path, one rAF leak, save-guard gaps, and an untested cloud-conflict resolver. The biggest *product* wins are making the differentiator felt in the first minute (U1), giving the late game something beautiful to spend on (G1), and shaving the Ch5-6 wall (G2).

---

## Appendix A — Top-20 assets by size
`map_island_plate` 3.50 MB · `feature_graphic` 2.04 · `mg_bg_well` 1.18 · `mg_bg_forage` 1.08 · `mg_bg_beacon` 1.04 · `mg_bg_catch` 1.02 · `mg_bg_forge` 0.96 · `mg_bg_stacks` 0.86 · `ui_villagelife_header` 0.77 · `ui_repository_header` 0.55 · `app_icon` 0.48 · `chapter_6` 0.46 · `item_books_6` 0.46 · `chapter_1` 0.43 · `chapter_5` 0.43 · `town_dock_l3` 0.41 · `loc_market` 0.41 · `town_garden_l3` 0.40 · `chapter_4` 0.38 · `town_cottage_l3` 0.37.

## Appendix B — Largest source files (LOC)
`ui/map-view.ts` 2,688 · `core/game.ts` 1,409 · `data/economy.ts` 997 · `ui/minigames.ts` 860 · `ui/board-view.ts` 407 · `ui/screens.ts` 393 · `core/minigames.ts` 372 · `core/types.ts` 316 · `data/town-layout.ts` 315 · `data/world.ts` 314.

## Appendix C — Test coverage map
Every `core/*` module has at least one test suite; covered critical paths: save-migration chain, minigame rewards, endless orders, duel AI, economy pacing, retention mechanics. **Gaps:** `platform/sync-controller.ts` (C5), `platform/metrics.ts`, `platform/providers.ts`, `data/actions.ts`, `data/friends.ts`, and no jsdom smoke test for view lifecycle.

## Appendix D — Story economy curve
Per-order cost = 2^level taps. Chapter (taps / reward energy / net): Ch1 198/82/−116 · Ch2 175/75/−100 · Ch3 254/98/−156 · Ch4 260/101/−159 · Ch5 336/125/−211 · Ch6 360/135/−225 · **Total 1,583 / 616 / −967**. Daily energy: healthy-day ≈ 100-130, all-actions ceiling ≈ 350, passive-only 20/hr capped at 30 stored. Day-1 → mid-Ch1 (seeds fund orders 1-3 free); Day-7 engaged → Ch3-4 (town "restored" visual at order 24); Day-30 engaged → story complete.
