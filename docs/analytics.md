# Analytics Event Taxonomy (v1)

Facade: `src/analytics.ts`. M2 sink: Firebase Analytics. Privacy rule: **no raw health data ever leaves the device** — only derived energy amounts appear in events.

## Funnel
| Event | Props | Fired when |
|---|---|---|
| `session_start` | `orderIndex`, `energy` | app open |
| `ftue_first_merge` | — | first ever merge |
| `ftue_first_order` | `orderId` | first ever delivery |
| `merge` | `chain`, `level` | every merge |
| `spawn` | — | producer tap succeeds |
| `spawn_blocked` | `reason` (energy/full) | producer tap fails |
| `order_delivered` | `orderId`, `rewardEnergy`, `rewardCoins` | delivery |
| `chapter_complete` | `chapter` | last order of chapter |
| `zone_stage` | `stage` | restoration stage reached |

## Life energy
| Event | Props | Fired when |
|---|---|---|
| `action_done` | `actionId`, `energy` | a real-world action completes (photo, movement, self-report) |
| `chest_opened` | `coins` | streak chest opens (every 3 active days) |
| `health_grant` | `energy`, `fromSteps`, `fromSleep` | health sync pays out (amounts only, never step counts or sleep hours) |
| `health_permission` | `granted` | permission prompt resolves |

Photo actions never emit the image or any image-derived data. Sunrise/sunset gating uses on-device time + optional coarse location; location is not tracked as an event.

## Retention & funnel (computed on-device)
`src/core/retention.ts` keeps a per-device cohort record (install day, active
days, FTUE furthest step) and computes the soft-launch gate locally, so
friends-and-family week yields readable numbers before any server exists. The
same record is what the account server will aggregate.

| Event | Props | Fired when |
|---|---|---|
| `retention_day` | `daysSinceInstall`, `activeDays`, `currentStreak`, `d1`, `d7`, `d30`, `ftueStep`, `ftueDone` | once per session at boot |
| `ftue_step` | `step` | each FTUE step reached (drop-off funnel) |
| `ftue_complete` | `furthest` | FTUE finished (not skipped) |

Dev dashboard: `window.hearthMetrics()` prints this device's retention table.
Definitions — `d1/d7/d30` = lifetime reached ≥ N days after install (monotonic,
unambiguous); `returnedNextDay` = active on install+1 (classic D1).

## KPIs derived
- D1/D7/D30 and streaks from `retention_day` (per device now; aggregated by the account server later)
- FTUE funnel: `ftue_step` drop-off → `ftue_complete` rate
- Health-connect rate: users with ≥1 `health_grant` / DAU
- Energy-source mix: sum of `health_grant.energy` + `quest_done.energy` vs passive (inferred)
