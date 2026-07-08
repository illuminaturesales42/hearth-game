# HEARTH — Merge & Mystery

**Standalone project. Not part of Mastermind or any monorepo** — it only happens to sit on disk under `F:\Mastermind launch\hearth`. Its own git repo (`github.com/illuminaturesales42/hearth-game`), own stack, own roadmap. Treat it entirely on its own terms; never import from, couple to, or reason about it via Mastermind.

A cozy merge-story wellness game: real-world actions (steps, sleep, sunlight, meditation, kindness) generate the game's energy, which restores the storm-wrecked village of Emberhollow. **Core pillar: energy is never sold — no IAP, no gems, no ads.**

## Stack & commands

Vite 6 + TypeScript (strict) + vitest. No UI framework — pure-logic core, DOM-string UI. PWA via vite-plugin-pwa. Capacitor configured for the future native wrap (not yet built).

```bash
pnpm dev            # dev server
pnpm test           # vitest (currently 155 tests)
npx tsc --noEmit    # typecheck
pnpm build          # production build -> dist/ (must stay clean)
python tools/slice_assets.py   # regenerate art from source sheets
```

Always land changes green: `tsc` clean + tests pass + build clean, then commit.

## Architecture

- `src/core/` — **pure, DOM-free, deterministic** game logic (board, energy, duel, relationships, retention, chronicle, save/migrations). Testable in isolation; no `Math.random`/`Date.now` in logic that must be reproducible.
- `src/ui/` — DOM rendering + feedback; subscribes to `Game` events. `map-view.ts` is the canvas town.
- `src/data/` — content (economy/orders, chains, villagers, town-layout, meditations…).
- `src/platform/` — native/cloud seams (health provider selection, cloud-save sync, retention metrics) — drop-in for the Capacitor build.
- `src/main.ts` — wiring + dev helpers (`hearthReset()`, `hearthSeeTown(n)`, `hearthMetrics()`, `hearthEvents()`).

`Game` (core/game.ts) is the orchestrator: owns `GameState`, emits typed events, persists every change.

## Save system (critical)

`core/save.ts` — versioned localStorage with a **migration chain** (currently v13). Any schema change to `GameState` MUST add a `MIGRATIONS[n]` step + bump `CURRENT_VERSION` + extend the null-guard, or public saves wipe. Round-trip is regression-tested. Rotating backups + export/import exist.

## Art pipeline & visual authority

- **Canonical style/reference: `C:\Users\illum\OneDrive\Desktop\Hearth\Graphics and UI\Core\`** — `MVP.png` (palette + board), `Map.png` (terrain/props/buildings), `Merge assest.png` (item icons), `UI Flame.png` (ember-heart energy). Design bibles: `…\HEARTH_Codex_and_Production_Pack_v1\` (Book V art, Technical Art Bible, Book VI naming).
- `tools/slice_assets.py` crops sprites from source sheets → `public/art/` + generated `src/art-manifest.ts` (`artUrl(id)`). `KEYED` set = edge-flood bg removal; per-id `TOLERANCE`. Item icons also get `clean_sprite()` (speckle removal + autocrop).
- Rulings: dark navy/gold storybook style is authoritative; **no gems/premium-currency art ever**; energy = ember-heart, not a lightning bolt.
- New art to generate is briefed in `docs/asset-generation-brief.md`. Game is fully playable on current sliced assets — the brief is polish, not a blocker.

## Verification

Prefer typecheck + tests. For visual changes, verify by composing an offline PIL mock **from the real layout data** (parse the TS, composite actual PNGs at multiple states) and compare to the Core reference — do NOT eyeball keyed sprites on dark backgrounds (un-keyed navy panels are invisible there).

## Remote testing

Quick tunnel (session-bound, dies on PC sleep, random URL each launch): `npx http-server dist -p 4173` + `npx cloudflared tunnel --url http://localhost:4173`. Permanent URL still needs a one-time human `wrangler login` → Cloudflare Pages. The PWA service worker caches hard — reopen twice to pick up a new build.

## Where things are

- `docs/roadmap-to-market.md` — the go-to-market plan (Phase 0 finish → A audience → B native+cloud → C soft-launch gates → D monetize).
- `docs/market-research-2026-07.md` — strategy (skip Steam; web funnel; Finch-style ethical subscription; retention is the moat).
- `docs/mvp-upgrade-plan.md`, `docs/GDD.md`, `docs/art-bible.md`, `docs/analytics.md`.
