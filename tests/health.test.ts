import { describe, expect, it } from 'vitest';
import { HEALTH_RULES, applySnapshot, initialLedger } from '../src/health/health-energy';
import type { HealthSnapshot } from '../src/health/health-provider';

const T0 = new Date('2026-07-05T08:00:00').getTime();
const snap = (over: Partial<HealthSnapshot>): HealthSnapshot => ({
  stepsToday: 0,
  flightsToday: 0,
  sleepHoursLastNight: null,
  source: 'healthkit',
  ...over,
});

describe('steps', () => {
  it('grants 1 energy per 500 steps', () => {
    expect(applySnapshot(initialLedger(T0), snap({ stepsToday: 2600 }), T0).fromSteps).toBe(5);
  });

  it('caps at the daily step cap then adds the 12k milestone bonus', () => {
    const res = applySnapshot(initialLedger(T0), snap({ stepsToday: 13_000 }), T0);
    expect(res.fromSteps).toBe(HEALTH_RULES.stepsDailyCap + HEALTH_RULES.stepsMilestone.bonus);
  });

  it('is idempotent: repeated syncs pay only the delta', () => {
    const first = applySnapshot(initialLedger(T0), snap({ stepsToday: 2600 }), T0);
    expect(applySnapshot(first.ledger, snap({ stepsToday: 2600 }), T0 + 60_000).energy).toBe(0);
    expect(applySnapshot(first.ledger, snap({ stepsToday: 4100 }), T0 + 120_000).fromSteps).toBe(3);
  });
});

describe('stairs', () => {
  it('grants 1 energy per flight up to the cap', () => {
    expect(applySnapshot(initialLedger(T0), snap({ flightsToday: 4 }), T0).fromStairs).toBe(4);
    expect(applySnapshot(initialLedger(T0), snap({ flightsToday: 99 }), T0).fromStairs).toBe(HEALTH_RULES.stairsDailyCap);
  });

  it('pays only the delta as more flights are climbed', () => {
    const first = applySnapshot(initialLedger(T0), snap({ flightsToday: 3 }), T0);
    expect(applySnapshot(first.ledger, snap({ flightsToday: 5 }), T0 + 60_000).fromStairs).toBe(2);
  });
});

describe('sleep tiers', () => {
  it('rewards a solid 7h night', () => {
    const res = applySnapshot(initialLedger(T0), snap({ sleepHoursLastNight: 7.2 }), T0);
    expect(res.fromSleep).toBe(10);
    expect(res.sleepFullNight).toBe(false);
  });

  it('rewards a full 8 hours more, and flags it', () => {
    const res = applySnapshot(initialLedger(T0), snap({ sleepHoursLastNight: 8.1 }), T0);
    expect(res.fromSleep).toBe(20);
    expect(res.sleepFullNight).toBe(true);
  });

  it('pays the tier difference when sleep is re-read higher, once', () => {
    const seven = applySnapshot(initialLedger(T0), snap({ sleepHoursLastNight: 7 }), T0);
    expect(seven.fromSleep).toBe(10);
    const eight = applySnapshot(seven.ledger, snap({ sleepHoursLastNight: 8 }), T0 + 60_000);
    expect(eight.fromSleep).toBe(10); // 20 target - 10 already granted
    const again = applySnapshot(eight.ledger, snap({ sleepHoursLastNight: 8 }), T0 + 120_000);
    expect(again.fromSleep).toBe(0);
  });

  it('gives nothing under 7 hours or when unknown', () => {
    expect(applySnapshot(initialLedger(T0), snap({ sleepHoursLastNight: 6.5 }), T0).fromSleep).toBe(0);
    expect(applySnapshot(initialLedger(T0), snap({ sleepHoursLastNight: null }), T0).fromSleep).toBe(0);
  });
});

describe('combined + daily reset', () => {
  it('sums all three sources in one grant', () => {
    const res = applySnapshot(initialLedger(T0), snap({ stepsToday: 5000, flightsToday: 3, sleepHoursLastNight: 8 }), T0);
    expect(res.energy).toBe(10 + 3 + 20);
  });

  it('resets at local midnight', () => {
    const first = applySnapshot(initialLedger(T0), snap({ stepsToday: 10_000, flightsToday: 5, sleepHoursLastNight: 8 }), T0);
    const nextDay = applySnapshot(first.ledger, snap({ stepsToday: 1000, flightsToday: 1, sleepHoursLastNight: 8 }), T0 + 24 * 3600_000);
    expect(nextDay.fromSteps).toBe(2);
    expect(nextDay.fromStairs).toBe(1);
    expect(nextDay.fromSleep).toBe(20);
  });
});
