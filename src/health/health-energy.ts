/**
 * Converts a HealthSnapshot into energy grants, idempotently per local day.
 * Pure functions; the ledger lives in GameState so cloud save carries it.
 */
import type { HealthSnapshot } from './health-provider';
import { localDayKey } from '../core/energy';

export const HEALTH_RULES = {
  stepsPerEnergy: 500,
  stepsDailyCap: 20,
  sleepHoursThreshold: 7,
  sleepBonus: 10,
} as const;

export interface HealthLedger {
  day: string; // YYYY-MM-DD local
  stepsGranted: number; // energy already granted from steps today
  sleepGranted: boolean;
}

export function initialLedger(now: number): HealthLedger {
  return { day: localDayKey(now), stepsGranted: 0, sleepGranted: false };
}

export interface HealthGrant {
  ledger: HealthLedger;
  energy: number;
  fromSteps: number;
  fromSleep: number;
}

/**
 * Compute the incremental grant for the current snapshot.
 * Safe to call repeatedly (e.g. every app-foreground); only the delta pays out.
 */
export function applySnapshot(ledger: HealthLedger, snap: HealthSnapshot, now: number): HealthGrant {
  const day = localDayKey(now);
  const base: HealthLedger = day === ledger.day ? ledger : { day, stepsGranted: 0, sleepGranted: false };

  const earnedTotal = Math.min(
    Math.floor(snap.stepsToday / HEALTH_RULES.stepsPerEnergy),
    HEALTH_RULES.stepsDailyCap,
  );
  const fromSteps = Math.max(0, earnedTotal - base.stepsGranted);

  const sleepQualifies =
    snap.sleepHoursLastNight !== null && snap.sleepHoursLastNight >= HEALTH_RULES.sleepHoursThreshold;
  const fromSleep = sleepQualifies && !base.sleepGranted ? HEALTH_RULES.sleepBonus : 0;

  return {
    ledger: {
      day,
      stepsGranted: base.stepsGranted + fromSteps,
      sleepGranted: base.sleepGranted || fromSleep > 0,
    },
    energy: fromSteps + fromSleep,
    fromSteps,
    fromSleep,
  };
}
