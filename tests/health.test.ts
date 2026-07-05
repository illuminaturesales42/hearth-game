import { describe, expect, it } from 'vitest';
import { HEALTH_RULES, applySnapshot, initialLedger } from '../src/health/health-energy';
import type { HealthSnapshot } from '../src/health/health-provider';

const T0 = new Date('2026-07-05T08:00:00').getTime();
const snap = (steps: number, sleep: number | null): HealthSnapshot => ({
  stepsToday: steps,
  sleepHoursLastNight: sleep,
  source: 'healthkit',
});

describe('health energy conversion', () => {
  it('grants 1 energy per 500 steps', () => {
    const res = applySnapshot(initialLedger(T0), snap(2600, null), T0);
    expect(res.fromSteps).toBe(5);
    expect(res.energy).toBe(5);
  });

  it('caps steps at 20/day', () => {
    const res = applySnapshot(initialLedger(T0), snap(50_000, null), T0);
    expect(res.fromSteps).toBe(HEALTH_RULES.stepsDailyCap);
  });

  it('is idempotent: repeated syncs pay only the delta', () => {
    const first = applySnapshot(initialLedger(T0), snap(2600, null), T0);
    const same = applySnapshot(first.ledger, snap(2600, null), T0 + 60_000);
    expect(same.energy).toBe(0);
    const more = applySnapshot(same.ledger, snap(4100, null), T0 + 120_000);
    expect(more.fromSteps).toBe(3); // 8 total earned - 5 already granted
  });

  it('sleep bonus pays once when >= 7h', () => {
    const first = applySnapshot(initialLedger(T0), snap(0, 7.5), T0);
    expect(first.fromSleep).toBe(HEALTH_RULES.sleepBonus);
    const again = applySnapshot(first.ledger, snap(0, 7.5), T0 + 60_000);
    expect(again.fromSleep).toBe(0);
  });

  it('no sleep bonus under threshold or unknown', () => {
    expect(applySnapshot(initialLedger(T0), snap(0, 6.9), T0).fromSleep).toBe(0);
    expect(applySnapshot(initialLedger(T0), snap(0, null), T0).fromSleep).toBe(0);
  });

  it('resets at local midnight', () => {
    const first = applySnapshot(initialLedger(T0), snap(10_000, 8), T0);
    const nextDay = T0 + 24 * 3600_000;
    const res = applySnapshot(first.ledger, snap(1000, 8), nextDay);
    expect(res.fromSteps).toBe(2);
    expect(res.fromSleep).toBe(HEALTH_RULES.sleepBonus);
  });
});
