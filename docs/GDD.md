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
| Steps | 1 / 500, cap +20, **+5 milestone at 12k** | 1 | sensor | HealthKit / Health Connect |
| Stairs (flights climbed) | 1 / flight, cap +10 | 1 | sensor | HealthKit / Health Connect |
| Sleep | **7h → +10, a full 8h → +20** (tiered, pays the difference) | 1 | sensor | HealthKit / Health Connect |
| Drink water (1.5L) | +10 | 1 | self-report | honour |
| Take a photo outside | +10 | 1 | photo | camera |
| 15 squats | +10 | 1 | motion | guided reps (motion sensor in M2) |
| **Photograph the sunrise** | +15 | 1 | photo | camera, **gated to real local sunrise** |
| Photograph the sunset | +15 | 1 | photo | camera, gated to real local sunset |
| Find something green | +10 | 1 | photo | camera |
| Morning stretch | +8 | 1 | motion | guided |
| Four slow breaths | +6 | 2 | motion | guided |
| Note one good thing | +5 | 1 | self-report | journal |
| **Guided meditation** | +8 to +16 | 1 (box breathing 2) | meditation | in-app breath pacer + ambient tone |
| **Log a meditation you did** | 0.5/min, cap +15 | 1 | meditation | duration picker, honour system |
| **Log a cold plunge** | 3/min, cap +12 | 1 | recovery | duration picker, honour system |
| **Log a sauna** | 0.7/min, cap +15 | 1 | recovery | duration picker, honour system |
| **Journal: one good thing** | base 6 × streak multiplier (→ ~+10) | 1 | gratitude | Journal "Good Days" tab |
| **Gratitude flashback** | +5 | 1 | gratitude | resurfaced past entry, once/day |
| **Daily bonus (any first action)** | 2 + min(streak,10) → +3…+12 | auto | streak | first action of each day |
| Passive regen | 1 per 3 min | cap 30 | timer | client clock (server-validated M3) |
| Order rewards | 3–10 | — | — | economy table |

Sun-gated photos use the SunCalc algorithm (`src/core/sun.ts`) against optional device location — a gate a clock change can't beat. Captured images stay on device, never uploaded.

**Meditation:** a menu of guided breathing sessions (Morning Calm, Box Breathing, 4·7·8 Wind-down, Body Scan) played through an in-app pacer — an animated breath ring, countdown, phase cues, and a low ambient tone (`src/ui/meditation.ts`, `src/data/meditations.ts`). Completing a session grants energy through the same ledger (caps, streak, chest). Players can also log a meditation they did elsewhere via a duration picker (0.5 energy/min, cap +15, once/day). Narrated audio tracks are an M2 audio-pass stub; the pacer + tone carry it for now.

**Recovery logging:** a Recovery card in the Energy panel opens duration pickers for cold plunge (3 energy/min, cap +12 — short and intense) and sauna (0.7/min, cap +15). Once per day each, honour system, same ledger (`src/data/recovery.ts`, `src/ui/recovery.ts`).

**Sleep-app connections:** the game reads sleep from HealthKit (iOS) / Health Connect (Android), which already aggregate third-party trackers — Apple Watch, Oura, Whoop, Samsung Health, Sleep Cycle, Google Fit. No per-app integrations to maintain; the platform is the connector. `sleepSourceApp` is surfaced in the UI ("via Oura") when the platform exposes it. All conversion is on-device and tiered/idempotent (`src/health/health-energy.ts`).

**Streak & chest:** a positive-only "day streak" (grows on consecutive active days; a missed day resets to 1 with no penalty screen — honouring the no-punishment pillar) and a chest every 3 active days (+100 coins). Matches concept screen #2. The streak now drives two bonuses: a **daily energy bonus** paid on the first action each day (2 + min(streak,10)), and a **journal multiplier** (1.0→1.7× at a 7-day streak) applied to gratitude entries.

**Gratitude journal ("Good Days" tab):** write one good thing about your day for streak-multiplied energy; entries are kept and later **resurface as flashbacks** — an old good day, older than 3 days, resurfaces once a day for a +5 boost ("the game reminding you of a good day you'd half-forgotten"). Data `src/data/gratitude.ts`, logic in `Game.writeGratitude/pendingFlashback/claimFlashback`, UI in the Journal screen. Two seed entries ship so a flashback is available immediately.

**Map art:** the canvas homestead now follows the concept art's five-stage progression — Storm-Wrecked → Rebuilding Begins → A Place to Call Home → A Flourishing Haven → Beacon of Emberhollow — a single central cottage that gains walls, roof, lit windows, chimney smoke, a flower garden, and finally a swept beacon as orders are delivered, with a dawn-to-golden-hour sky. Painted stage PNGs (e.g. from the ComfyUI/SDXL pipeline) swap in behind the same `stage()` data at the M2 art pass.

Rules: energy never purchasable; regen never accrues past cap but life energy may exceed it; action counts reset at local midnight; sleep rewarded, never penalized.

### 3.1b Screens (concept-matched)
Bottom nav: Shop · Map · Home · Villagers · Journal. Home = merge board + order card + harbour banner. Energy panel opens from the HUD energy pill. Journal = Clues/Letters/People/Places. Shop = collections + events (decor arrives with M2 art).

**Map — visible town growth.** A canvas-rendered Emberhollow harbour (`src/ui/map-view.ts`) that grows with orders delivered: buildings rise and light warm windows, the lighthouse kindles and sweeps its beam, the sun rises and the sky warms, water shimmers. A restoration % bar + stage label + order-gated location list sit below. Ambient motion pauses when the screen is hidden and reduces under `prefers-reduced-motion`. This is the "progress you can see and feel" pillar.

**Villagers — the social layer** (`src/core/social.ts`, `src/ui/social-screen.ts`). Invite friends to your village; when a friend joins, **both of you get +15 energy** (once per friend). Ask a joined friend for help and they send starter items of your *current task's chain* to a Gifts inbox — tap to place on the board, directly helping the order you're on (once/day per friend). Story NPCs (Wren/Bran/Sorin/Marta) sit below as "Village folk" with affinity. Backend is a client-side simulation stub; the Game API (`inviteFriend`, `markFriendJoined`, `askFriendForHelp`, `claimGift`) is the real contract for the M3 multiplayer service — no per-friend integration, invites flow through a share link.

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
