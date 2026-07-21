# Hearth: Merge & Mystery

A cozy merge-adventure where real-life actions power your village. Restore Emberhollow, befriend its people, and uncover the truth behind Marta's disappearance. **Energy is earned from your day — never sold.**

## Run it

```bash
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # vitest core-logic suite (342 tests)
pnpm build      # typecheck + production build + PWA (service worker, manifest)
pnpm preview    # serve the production build locally
```

Dev console helpers: `hearthReset()` wipes the save · `hearthHealthSim(12500, 8.2, 6)` simulates a day of steps/sleep/stairs · `hearthEvents()` dumps analytics.

## What's in the MVP

- **Create** — the merge board: 20 chains (Timberline, Harvest, Hearthfire, Keepsakes + resource and Builder's-Yard chains), painted item art, auto-merge + auto-deliver toggle.
- **Home** — the living town: painted homestead stages that grow across the story, real time-of-day light, daily quests, current challenge, locations.
- **Story** — 6 chapters (72 orders), from *The Letter* and *Shadows in the Sand* through *Spring Tides*, with per-chapter cliffhangers, an endless generated-order mode after the story, and a Journal that assembles the mystery as you play.
- **Hearth Energy** — earned from real life: steps, stairs, sleep (tiered), water, photos (sunrise/sunset gated by the actual sun), squats/stretch/breaths, guided meditations, cold plunge & sauna logging, stargazing (real moon phase), a kind word to a stranger (+selfie bonus), and the gratitude journal with flashbacks.
- **Chronicle** — each night the village writes your day into prose. Never numbers.
- **Streaks** — sunrise New Day claim, streak-scaled daily bonus, chest every 3 active days, journal multiplier. Missing a day is never punished.
- **Social (local preview)** — invite/gift simulation and the hot-seat **Bonfire Duel** (shared-board PvP; winner banks the board into the Repository, which can deliver story orders). Online friends arrive with the M3 backend.
- **Achievements & Collections** — 10 quiet recognitions on the Collect screen.
- **Settings** — volumes, text size, high contrast, reduce motion, save export/import, diagnostics, reset.
- **PWA** — installable, fully offline after first load.

## Repo layout

```
public/art/        sliced game art (generated — see tools/)
public/icons/      PWA icons (generated from the splash emblem)
src/core/          pure game logic, no DOM (board, energy, actions, chronicle,
                   achievements, duel, social, sun/moon, save+migrations)
src/data/          tunable content: chains, orders/chapters, actions,
                   meditations, recovery, kindness, quests, world
src/health/        HealthKit/Health Connect abstraction (self-report on web)
src/ui/            DOM renderers, one file per surface
tests/             vitest suites (core logic + content QA + migrations)
tools/slice_assets.py   sheet → asset pipeline (probe/slice/contact modes)
docs/              GDD, art bible, analytics taxonomy, UI refinement, MVP status
```

## Asset pipeline

Source sheets live in `C:\Users\illum\OneDrive\Desktop\Hearth\Graphics and UI`.
`python tools/slice_assets.py` crops them into `public/art/` and regenerates
`src/art-manifest.ts`. `--probe <sheet>` writes a coordinate grid for defining
crops; `--contact` writes a review contact-sheet. Missing art falls back to
emoji automatically — the game never breaks on an absent file.

## Deploying (when ready)

1. Create a private GitHub repo and push (CI workflow already in `.github/`).
2. Cloudflare Pages → connect repo → build `pnpm build`, output `dist`.
3. Every push to `main` then auto-deploys; the PWA updates itself on clients.

## The rules that never change

Energy is never sold. Absence is never punished. Health data never leaves the
device. No pay-to-win, no FOMO. See `docs/GDD.md` §1 and the Hearth Test.
