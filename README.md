# Hearth: Merge & Mystery

A merge-story game where your real day powers the village. **Energy is never sold.**

## Run

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # vitest core-logic suite
pnpm build      # typecheck + production build
```

`window.hearthReset()` in the console wipes the save.

## Structure

- `src/core/` — pure game logic (board, energy, orchestrator, save). No DOM. Fully unit-tested.
- `src/data/economy.ts` — all tunable numbers and content tables, remote-config shaped.
- `src/ui/` — DOM renderers (board drag-and-drop, HUD, story modal).
- `docs/GDD.md` — design document and production plan.

## Design guardrails

Energy comes from time regen and the player's real day (steps, sleep, self-care), never from purchases. No streaks, no punishment for absence. See the GDD for the full ethics rules — they are product requirements, not aspirations.
