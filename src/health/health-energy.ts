/**
 * Converts a HealthSnapshot into energy grants, idempotently per local day and
 * in tiers — so reaching a higher milestone later in the day pays only the
 * difference. All amounts are stored as energy-already-granted, never raw
 * health values, which keeps re-syncing safe and keeps health data off the wire.
 */
import type { HealthSnapshot } from './health-provider';
import { localDayKey } from '../core/energy';

export const HEALTH_RULES = {
  // Steps: 1 energy per 500, capped, plus a milestone for a big day.
  stepsPerEnergy: 500,
  stepsDailyCap: 20, // = 10,000 steps
  stepsMilestone: { steps: 12_000, bonus: 5 },
  // Stairs: rewards vertical effort the step count misses.
  flightsPerEnergy: 1,
  stairsDailyCap: 10,
  // Sleep tiers: a solid night, and a full eight hours.
  sleepTiers: [
    { hours: 7, energy: 10 },
    { hours: 8, energy: 20 },
  ] as const,
} as const;

export interface HealthLedger {
  day: string; // YYYY-MM-DD local
  stepsGranted: number;
  stairsGranted: number;
  sleepGranted: number;
}

export function initialLedger(now: number): HealthLedger {
  return { day: localDayKey(now), stepsGranted: 0, stairsGranted: 0, sleepGranted: 0 };
}

export interface HealthGrant {
  ledger: HealthLedger;
  energy: number;
  fromSteps: number;
  fromStairs: number;
  fromSleep: number;
  /** Whether this grant crossed the full 8-hour sleep tier, for a nicer message. */
  sleepFullNight: boolean;
}

function stepsTarget(steps: number): number {
  const base = Math.min(Math.floor(steps / HEALTH_RULES.stepsPerEnergy), HEALTH_RULES.stepsDailyCap);
  const bonus = steps >= HEALTH_RULES.stepsMilestone.steps ? HEALTH_RULES.stepsMilestone.bonus : 0;
  return base + bonus;
}

function stairsTarget(flights: number): number {
  return Math.min(flights * HEALTH_RULES.flightsPerEnergy, HEALTH_RULES.stairsDailyCap);
}

function sleepTarget(hours: number | null): { energy: number; full: boolean } {
  if (hours === null) return { energy: 0, full: false };
  let energy = 0;
  let full = false;
  for (const tier of HEALTH_RULES.sleepTiers) {
    if (hours >= tier.hours) {
      energy = tier.energy;
      full = tier.hours >= 8;
    }
  }
  return { energy, full };
}

/**
 * Compute the incremental grant for the current snapshot. Safe to call on every
 * app foreground; only the delta above what was already granted today pays out.
 */
export function applySnapshot(ledger: HealthLedger, snap: HealthSnapshot, now: number): HealthGrant {
  const day = localDayKey(now);
  const base: HealthLedger = day === ledger.day ? ledger : { day, stepsGranted: 0, stairsGranted: 0, sleepGranted: 0 };

  const fromSteps = Math.max(0, stepsTarget(snap.stepsToday) - base.stepsGranted);
  const fromStairs = Math.max(0, stairsTarget(snap.flightsToday) - base.stairsGranted);
  const sleep = sleepTarget(snap.sleepHoursLastNight);
  const fromSleep = Math.max(0, sleep.energy - base.sleepGranted);

  return {
    ledger: {
      day,
      stepsGranted: base.stepsGranted + fromSteps,
      stairsGranted: base.stairsGranted + fromStairs,
      sleepGranted: base.sleepGranted + fromSleep,
    },
    energy: fromSteps + fromStairs + fromSleep,
    fromSteps,
    fromStairs,
    fromSleep,
    sleepFullNight: sleep.full && fromSleep > 0,
  };
}
