# MVP Status — test guide (2026-07-07)

**Build:** save v10 · 95 tests green · PWA-packaged · all milestones M0–M5 code-complete.

## How to test (morning checklist)

1. `cd "F:\Mastermind launch\hearth" && pnpm dev` → http://localhost:5173 (or it may already be running).
2. Fresh eyes: open DevTools console → `hearthReset()` → the **FTUE welcome** should greet you (emblem art → town → first merge → first delivery → energy promise → done), then the **sunrise New Day** claim.
3. Play Create: merge the saplings → plank → **Deliver** to Bran. Painted item art on tiles, portrait on the order card.
4. Home: the painted homestead, time-of-day light (open at night — it's moonlit), **Today in Emberhollow** daily quests ticking themselves off, chapter recap line.
5. Energy pill → the panel: try **Sit by the Hearth** (breathing session with ambient tone), **Warm a Stranger**, **Stargaze** (after dark — real moon phase). `hearthHealthSim(12500, 8.2, 6)` simulates the health-app sync.
6. Journal → **Chronicle** tab: empty tonight; tomorrow's first open writes yesterday's page. Story tabs fill as orders deliver.
7. Collect: achievement badges (First Spark should already be lit).
8. Villagers → **Bonfire Duel**: race Old Joss; win banks the board to the Repository → "Deliver to Emberhollow". Friends can also be challenged to an async duel on a shared server seed.
9. Settings (gear): text size, contrast, volumes, **export save** (download), reset.
10. Reload the page — progress must persist (this was the P0 bug; a regression test now guards it).
11. Optional: `pnpm build && pnpm preview` → install as PWA from the browser menu; then kill the network — it runs offline.

## Known limits (by design, for this MVP)
- Health data is **self-report/simulated** on web; native HealthKit/Health Connect arrives with the Capacitor build.
- Friends/gifts/duels are **real and server-backed** (`functions/v1/*` on Cloudflare Pages + D1). Identity is an anonymous device key; account logins (cross-device, recovery) remain future work.
- Meditation narration, painted location vignettes, seasonal festivals, Ch3+ — post-MVP backlog (assets exist on the sheets).
- Music is a synth stand-in with the same layering API licensed stems will use.

## Blocked on you
- **GitHub remote**: repo creation needs your say-so (permissions). Say "create the private GitHub repo" and CI + Cloudflare Pages deploy unlock. Interim backups: git bundles in `OneDrive\Desktop\Hearth\repo-backups\`.
