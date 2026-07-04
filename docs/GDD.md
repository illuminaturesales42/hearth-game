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
### 3.1 Life Energy
| Source | Amount | Cap | Production source |
|---|---|---|---|
| Steps | 1 per 500 | 20/day | HealthKit / Health Connect (M2) |
| Sleep ≥7h | +10 at first morning session | 10/day | HealthKit / Health Connect (M2) |
| Micro-quests (water, stretch, tidy) | +2 each | 3/day | self-report, honor system |
| Passive regen | 1 per 3 min | cap 30 | client clock (server-validated M3) |
| Order rewards | 4–10 per delivery | — | economy table |

Rules: never purchasable; regen never accrues past cap but quest energy may exceed it; quests reset at local midnight; sleep is rewarded, never penalized.

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
