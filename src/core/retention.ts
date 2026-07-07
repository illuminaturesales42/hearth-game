/**
 * Retention & funnel maths (roadmap Phase C: the soft-launch gate is
 * D1 ≥ 30% / D7 15–20% / D30 ≥ 4%, plus the FTUE-completion funnel). You
 * cannot iterate toward a gate you cannot see — this computes each device's
 * own retention so friends-and-family week produces readable numbers, and the
 * account-server can aggregate the same records later.
 *
 * Pure and deterministic: all functions take an explicit `today` and never
 * touch storage or the clock, so retention windows are exhaustively testable.
 */
import { daysBetween } from './world-mood';

/** One device's lifetime record — persisted, updated once per session. */
export interface CohortRecord {
  firstSeenDay: string; // YYYY-MM-DD local
  lastSeenDay: string;
  /** Unique local day keys the player opened the game, sorted ascending. */
  activeDays: readonly string[];
  /** Highest 0-based FTUE step the player reached. */
  ftueFurthestStep: number;
  ftueCompleted: boolean;
}

export interface RetentionSummary {
  installDay: string;
  daysSinceInstall: number;
  activeDayCount: number;
  /** Returned the very next calendar day after install. */
  returnedNextDay: boolean;
  /** Still active at least N days after install (lifetime ≥ N). */
  d1: boolean;
  d7: boolean;
  d30: boolean;
  currentStreak: number;
  bestStreak: number;
  ftueFurthestStep: number;
  ftueCompleted: boolean;
}

export function emptyCohort(day: string): CohortRecord {
  return { firstSeenDay: day, lastSeenDay: day, activeDays: [day], ftueFurthestStep: 0, ftueCompleted: false };
}

/** Mark `day` active. Idempotent; keeps activeDays sorted + unique. */
export function recordActive(c: CohortRecord, day: string): CohortRecord {
  if (c.activeDays.includes(day)) {
    return day > c.lastSeenDay ? { ...c, lastSeenDay: day } : c;
  }
  const activeDays = [...c.activeDays, day].sort();
  return { ...c, activeDays, lastSeenDay: day > c.lastSeenDay ? day : c.lastSeenDay };
}

export function recordFtueStep(c: CohortRecord, step: number): CohortRecord {
  return step > c.ftueFurthestStep ? { ...c, ftueFurthestStep: step } : c;
}

export function completeFtue(c: CohortRecord): CohortRecord {
  return { ...c, ftueCompleted: true };
}

/** Longest run of consecutive calendar days in a sorted day-key list. */
export function longestStreak(days: readonly string[]): number {
  if (days.length === 0) return 0;
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    best = Math.max(best, (run = daysBetween(days[i - 1]!, days[i]!) === 1 ? run + 1 : 1));
  }
  return best;
}

/** Consecutive active days ending at (and including) `today`, else 0. */
export function currentStreak(days: readonly string[], today: string): number {
  if (!days.includes(today)) return 0;
  let streak = 1;
  const set = new Set(days);
  // walk backwards from today one calendar day at a time
  for (let back = 1; ; back++) {
    const prev = shiftDay(today, -back);
    if (set.has(prev)) streak++;
    else break;
  }
  return streak;
}

export function summarize(c: CohortRecord, today: string): RetentionSummary {
  const offsets = c.activeDays.map((d) => daysBetween(c.firstSeenDay, d));
  const maxOffset = offsets.length ? Math.max(...offsets) : 0;
  return {
    installDay: c.firstSeenDay,
    daysSinceInstall: daysBetween(c.firstSeenDay, today),
    activeDayCount: c.activeDays.length,
    returnedNextDay: offsets.includes(1),
    d1: maxOffset >= 1,
    d7: maxOffset >= 7,
    d30: maxOffset >= 30,
    currentStreak: currentStreak(c.activeDays, today),
    bestStreak: longestStreak(c.activeDays),
    ftueFurthestStep: c.ftueFurthestStep,
    ftueCompleted: c.ftueCompleted,
  };
}

/** Add `delta` whole days to a YYYY-MM-DD key (UTC-safe, DST-immune). */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const t = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) + delta * 86400000;
  const dt = new Date(t);
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${mm}-${dd}`;
}
