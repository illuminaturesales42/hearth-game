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
| `quest_done` | `questId`, `energy` | self-report quest |
| `health_grant` | `energy`, `fromSteps`, `fromSleep` | health sync pays out (amounts only, never step counts or sleep hours) |
| `health_permission` | `granted` | permission prompt resolves |

## KPIs derived
- D1/D7/D30 from `session_start`
- FTUE funnel: install → `ftue_first_merge` → `ftue_first_order`
- Health-connect rate: users with ≥1 `health_grant` / DAU
- Energy-source mix: sum of `health_grant.energy` + `quest_done.energy` vs passive (inferred)
