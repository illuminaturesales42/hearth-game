/**
 * Health Connect (Android) record aggregation — the pure, testable core of the
 * native health spike (roadmap Phase B). Real Health Connect plugins hand back
 * RAW records for a time range; this turns them into the game's HealthSnapshot:
 * today's steps and flights on the LOCAL-day boundary, and last night's sleep
 * from the main morning session (asleep stages only). Read-only, on-device —
 * no health data ever leaves the phone (Apple 5.1.3 / Play Data-Safety clean).
 *
 * The plugin binding (which community plugin, its exact record fields) is a thin
 * adapter completed when the Android platform is built in Android Studio; it
 * maps the plugin's records into the shapes below, then calls
 * snapshotFromRecords. Everything here is deterministic and unit-tested.
 */
import type { HealthSnapshot } from './health-provider';

const HOUR = 3_600_000;

/** A steps / floors record: a value accrued over [startTime, endTime) (epoch ms). */
export interface QuantityRecord {
  startTime: number;
  endTime: number;
  value: number;
}

export type SleepStageName = 'awake' | 'sleeping' | 'light' | 'deep' | 'rem' | 'out_of_bed' | 'unknown';

export interface SleepStage {
  startTime: number;
  endTime: number;
  stage: SleepStageName;
}

export interface SleepSession {
  startTime: number;
  endTime: number;
  /** Per-stage breakdown when the source provides it; absent → whole session counts. */
  stages?: SleepStage[];
  /** Originating app (Samsung Health, Google Fit, Oura…), shown as "via <app>". */
  dataOrigin?: string;
}

/** Stages that are NOT asleep — excluded from the sleep total. */
const AWAKE_STAGES: ReadonlySet<SleepStageName> = new Set<SleepStageName>(['awake', 'out_of_bed']);

/** [start, end) epoch ms of the local calendar day containing `now`. */
export function localDayWindow(now: number): { start: number; end: number } {
  const d = new Date(now);
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return { start, end: start + 24 * HOUR };
}

/**
 * Sum record values whose START falls in [start, end). Health Connect quantity
 * records are non-overlapping within a source, so summing by start-time avoids
 * the double counting a naive overlap sum causes at the midnight boundary.
 */
export function sumForDay(records: readonly QuantityRecord[], window: { start: number; end: number }): number {
  let total = 0;
  for (const r of records) {
    if (r.startTime >= window.start && r.startTime < window.end) total += Math.max(0, r.value);
  }
  return Math.round(total);
}

/**
 * Last night's sleep: the session ending latest within [yesterday 18:00, today
 * noon] (the "this morning" band). Returns hours ASLEEP — awake / out-of-bed
 * stages removed; an unstaged session counts its whole duration — plus the
 * source app when present. `null` hours when nothing slept in the band.
 */
export function mainSleepHours(
  sessions: readonly SleepSession[],
  now: number,
): { hours: number | null; sourceApp?: string } {
  const day = localDayWindow(now);
  const bandStart = day.start - 6 * HOUR; // yesterday 18:00
  const bandEnd = day.start + 12 * HOUR; // today noon
  const inBand = sessions.filter((s) => s.endTime > bandStart && s.endTime <= bandEnd);
  if (!inBand.length) return { hours: null };

  const main = inBand.reduce((a, b) => (b.endTime > a.endTime ? b : a));
  const asleepMs = main.stages?.length
    ? main.stages.reduce((sum, st) => sum + (AWAKE_STAGES.has(st.stage) ? 0 : Math.max(0, st.endTime - st.startTime)), 0)
    : Math.max(0, main.endTime - main.startTime);

  const hours = asleepMs / HOUR;
  const out: { hours: number | null; sourceApp?: string } = { hours: hours > 0 ? Math.round(hours * 10) / 10 : null };
  if (main.dataOrigin) out.sourceApp = main.dataOrigin;
  return out;
}

/** Assemble the game's snapshot from a local day's raw Health Connect records. */
export function snapshotFromRecords(
  steps: readonly QuantityRecord[],
  flights: readonly QuantityRecord[],
  sleeps: readonly SleepSession[],
  now: number,
): HealthSnapshot {
  const day = localDayWindow(now);
  const sleep = mainSleepHours(sleeps, now);
  const snap: HealthSnapshot = {
    stepsToday: sumForDay(steps, day),
    flightsToday: sumForDay(flights, day),
    sleepHoursLastNight: sleep.hours,
    source: 'health-connect',
  };
  if (sleep.sourceApp) snap.sleepSourceApp = sleep.sourceApp;
  return snap;
}
