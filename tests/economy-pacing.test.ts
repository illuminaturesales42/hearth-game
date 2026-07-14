import { describe, expect, it } from 'vitest';
import { CHAPTERS, ENERGY, ORDERS } from '../src/data/economy';
import { chainDef } from '../src/core/board';

/**
 * Economy simulation: every order's item costs 2^level spawns (each merge
 * halves the count, spawns cost ENERGY.spawnCost). Against a conservative
 * daily energy income, both chapters must land inside the pacing band the
 * plan set: a chapter is roughly one or two weeks of gentle play, and the
 * whole MVP story is under a month — without ever needing to buy energy.
 */

// Conservative daily income: passive regen a player actually collects (~20)
// + sunrise bonus (~8 mid-streak) + two real-world actions (~20). Research
// band is 60–120/day for an engaged player; we pace against the lazy floor.
const LAZY_DAILY_ENERGY = 48;

function spawnsForLevel(level: number): number {
  return 2 ** level;
}

describe('economy pacing', () => {
  it('every order is craftable from its chain', () => {
    for (const o of ORDERS) {
      const def = chainDef(o.need.chain);
      expect(def.levelNames[o.need.level], `${o.id} needs ${o.need.chain} L${o.need.level}`).toBeTruthy();
    }
  });

  it('each chapter fits the pacing band on a lazy-floor energy diet', () => {
    for (const ch of CHAPTERS) {
      const orders = ORDERS.slice(ch.start, ch.end);
      const spendEnergy = orders.reduce((sum, o) => sum + spawnsForLevel(o.need.level) * ENERGY.spawnCost, 0);
      const earnedBack = orders.reduce((sum, o) => sum + o.rewardEnergy, 0);
      const net = Math.max(0, spendEnergy - earnedBack);
      const days = net / LAZY_DAILY_ENERGY;
      // A chapter should take at least a couple of sessions (no blow-through)
      // and at most ~2 weeks at the lazy floor (no grind wall).
      expect(days, `chapter ${ch.id} "${ch.title}" ≈ ${days.toFixed(1)} lazy days`).toBeLessThanOrEqual(14);
      expect(spendEnergy, `chapter ${ch.id} raw spend`).toBeGreaterThan(60);
    }
  });

  it('the whole MVP story stays under a month at the lazy floor', () => {
    const spend = ORDERS.reduce((s, o) => s + spawnsForLevel(o.need.level) * ENERGY.spawnCost, 0);
    const back = ORDERS.reduce((s, o) => s + o.rewardEnergy, 0);
    const days = Math.max(0, spend - back) / LAZY_DAILY_ENERGY;
    expect(days).toBeLessThanOrEqual(30);
  });

  it('each chapter refunds only part of its build cost — real actions carry the rest', () => {
    // The pillar: if orders hand back most of the energy they cost to build, the
    // real-world wellness loop stops mattering. Cap per-chapter refund near half.
    for (const ch of CHAPTERS) {
      const orders = ORDERS.slice(ch.start, ch.end);
      const demand = orders.reduce((s, o) => s + spawnsForLevel(o.need.level), 0);
      const refund = orders.reduce((s, o) => s + o.rewardEnergy, 0);
      const ratio = refund / demand;
      expect(ratio, `chapter ${ch.id} refunds ${(ratio * 100).toFixed(0)}%`).toBeLessThanOrEqual(0.55);
    }
    const totalDemand = ORDERS.reduce((s, o) => s + spawnsForLevel(o.need.level), 0);
    const totalRefund = ORDERS.reduce((s, o) => s + o.rewardEnergy, 0);
    expect(totalRefund / totalDemand).toBeLessThanOrEqual(0.5);
  });

  it('order rewards never exceed what the next orders can absorb (no energy inflation)', () => {
    // Total energy handed back by orders must stay below total spawn demand —
    // otherwise the real-world actions stop mattering, which breaks the pillar.
    const spend = ORDERS.reduce((s, o) => s + spawnsForLevel(o.need.level) * ENERGY.spawnCost, 0);
    const back = ORDERS.reduce((s, o) => s + o.rewardEnergy, 0);
    expect(back).toBeLessThan(spend);
  });
});
