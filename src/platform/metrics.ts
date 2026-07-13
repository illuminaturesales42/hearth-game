/**
 * Retention metrics wiring: persists this device's cohort record, marks today
 * active once per session, records FTUE funnel progress, and exposes a
 * dev-readable summary (window.hearthMetrics). Emits one `retention_day`
 * analytics event per session so the real sink (PostHog/Amplitude/Firebase)
 * receives the same numbers the soft-launch gate is measured against.
 *
 * Retention maths live in core/retention.ts (pure, tested); this is the thin
 * storage + wiring seam.
 */
import { localDayKey } from '../core/energy';
import { track } from '../analytics';
import { completeFtue, emptyCohort, recordActive, recordFtueStep, summarize } from '../core/retention';
import type { CohortRecord, RetentionSummary } from '../core/retention';

const KEY = 'hearth:cohort';

function load(): CohortRecord | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CohortRecord;
    if (!c.firstSeenDay || !Array.isArray(c.activeDays)) return null;
    return c;
  } catch {
    return null;
  }
}

function save(c: CohortRecord): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    /* best-effort */
  }
}

export class Metrics {
  private cohort: CohortRecord;

  constructor(private now: () => number = () => Date.now()) {
    const today = localDayKey(this.now());
    this.cohort = recordActive(load() ?? emptyCohort(today), today);
    save(this.cohort);
  }

  /** Fire once at boot: report this session's retention snapshot. */
  reportSession(): void {
    const s = this.summary();
    track('retention_day', {
      daysSinceInstall: s.daysSinceInstall,
      activeDays: s.activeDayCount,
      currentStreak: s.currentStreak,
      d1: s.d1,
      d7: s.d7,
      d30: s.d30,
      ftueStep: s.ftueFurthestStep,
      ftueDone: s.ftueCompleted,
    });
  }

  ftueReachedStep(step: number): void {
    this.cohort = recordFtueStep(this.cohort, step);
    save(this.cohort);
    track('ftue_step', { step });
  }

  ftueFinished(): void {
    this.cohort = completeFtue(this.cohort);
    save(this.cohort);
    track('ftue_complete', { furthest: this.cohort.ftueFurthestStep });
  }

  summary(): RetentionSummary {
    return summarize(this.cohort, localDayKey(this.now()));
  }
}

/** Attach a friendly console dashboard for friends-and-family week. */
export function exposeMetricsConsole(metrics: Metrics): void {
  (window as unknown as { hearthMetrics: () => void }).hearthMetrics = () => {
    const s = metrics.summary();

    console.table({
      'Install day': s.installDay,
      'Days since install': s.daysSinceInstall,
      'Active days': s.activeDayCount,
      'Returned next day': s.returnedNextDay,
      'Retained ≥ D1 / D7 / D30': `${s.d1} / ${s.d7} / ${s.d30}`,
      'Streak (current / best)': `${s.currentStreak} / ${s.bestStreak}`,
      'FTUE furthest step': s.ftueFurthestStep,
      'FTUE completed': s.ftueCompleted,
    });
  };
}
