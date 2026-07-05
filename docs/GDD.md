# Hearth: Merge & Mystery — Game Design Document (v0.1)

**One-liner:** A merge-story game where your real day powers the village. Energy is never sold.

## 1. Pillars
1. **Best-in-class merge feel** — the pop is the product.
2. **Life is the battery** — steps, sleep, and small self-care acts convert to Hearth energy. No energy IAP, ever. This is stated in the store listing as a promise.
3. **Story pulls you back** — a serialized cozy mystery (Marta's disappearance), one cliffhanger per zone.
4. **Never punish absence** — no streaks, no decay. Returning players get a warm recap, not guilt.

## 2. Core loop
Spend energy on producers → spawn items → merge up chains → fill villager orders → coins/XP/story beats → restore village zones → new chains and characters.

## 3. Systems
### 3.1 Life Energy — the action catalogue
Energy comes only from the player's real day. Full catalogue in `src/data/actions.ts`; the Energy panel (concept screen #2) surfaces featured actions with "More ways to earn energy" beneath.

| Action | Amount | Cap/day | Kind | Source |
|---|---|---|---|---|
| 4,200 steps | +20 | 1 | sensor | HealthKit / Health Connect |
| 7.5h sleep | +20 | 1 | sensor | HealthKit / Health Connect |
| Drink water (1.5L) | +10 | 1 | self-report | honour |
| Take a photo outside | +10 | 1 | photo | camera |
| 15 squats | +10 | 1 | motion | guided reps (motion sensor in M2) |
| **Photograph the sunrise** | +15 | 1 | photo | camera, **gated to real local sunrise** |
| Photograph the sunset | +15 | 1 | photo | camera, gated to real local sunset |
| Find something green | +10 | 1 | photo | camera |
| Morning stretch | +8 | 1 | motion | guided |
| Four slow breaths | +6 | 2 | motion | guided |
| Note one good thing | +5 | 1 | self-report | journal |
| Passive regen | 1 per 3 min | cap 30 | timer | client clock (server-validated M3) |
| Order rewards | 3–10 | — | — | economy table |

Sun-gated photos use the SunCalc algorithm (`src/core/sun.ts`) against optional device location — a gate a clock change can't beat. Captured images stay on device, never uploaded.

**Streak & chest:** a positive-only "day streak" (grows on consecutive active days; a missed day resets to 1 with no penalty screen — honouring the no-punishment pillar) and a chest every 3 active days (+100 coins). Matches concept screen #2.

Rules: energy never purchasable; regen never accrues past cap but life energy may exceed it; action counts reset at local midnight; sleep rewarded, never penalized.

### 3.1b Screens (concept-matched)
Bottom nav: Shop · Map · Home · Villagers · Journal. Home = merge board + order card + harbour banner. Energy panel opens from the HUD energy pill. Map = Emberhollow harbour with order-gated locations. Journal = Clues/Letters/People/Places. Villagers = cast + affinity. Shop = collections + events (decor arrives with M2 art).

### 3.2 Chains (M1 set)
- **Timberline** (7 levels): Sapling → Cottage
- **Harvest** (7 levels): Wheat → Fair Prize
- **Hearthfire** (4 levels): Candle → Beacon

M2 adds Sea-goods and Flowers (9 levels each) plus event chains.

### 3.3 Orders & story
Orders are the story spine. Chapter 1 ("The Letter") ships with 5 orders in M1, 12 in M2. Each delivery pays energy + coins and reveals a beat. Chapter cliffhangers gate zone unlocks.

## 4. Economy guardrails
- Session target: 8–20 minutes; energy design supports ~15 producer taps per session for a connected player.
- A player who connects health data earns roughly 2× the energy of timer-only play. That is the intended incentive, tuned so timer-only remains genuinely playable.
- Wind-down: after 2h+ continuous play, the hearth "burns low" visually and suggests rest. No hard lock.

## 5. Monetization (never energy)
Decor/cosmetics, seasonal Story Pass ($4.99), event boosters, coin packs (coins ≠ energy), capped player-initiated rewarded ads.

## 6. Tech
- **M1 (this repo):** Vite + TypeScript, DOM renderer, localStorage saves. Pure-logic core (`src/core`) with Vitest coverage; UI is a thin layer.
- **M2:** Capacitor shell → iOS/Android; HealthKit + Health Connect plugins; cloud save; analytics (event taxonomy in `docs/analytics.md`, TBD).
- **Decision gate:** if merge-board performance or pipeline needs outgrow the DOM approach during soft launch prep, port the core (already renderer-agnostic) to Unity. The `src/core` contract is the spec.
- Art: emoji placeholders in M1; M2 replaces with the commissioned item-icon set (art bible: firelit amber, painterly-casual).

## 7. Privacy & compliance
Health data is read on device and converted to energy grants locally; raw health data never leaves the device. No health claims beyond "encouragement." Age 13+.

## 8. Milestones
M0 scaffold ✅ → M1 playable core (this build) → M2 vertical slice (health, ch. 1 full, zone art) → M3 content + live-ops tooling → M4 soft launch (PH/CA/NZ) → M5 global.
