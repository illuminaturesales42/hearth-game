import { describe, expect, it } from 'vitest';
import { CHAINS, CHAPTERS, ORDERS, SPAWN_TABLE, ZONE_STAGES, chapterFor } from '../src/data/economy';
import { JOURNAL } from '../src/data/world';

describe('story content integrity', () => {
  it('every order need exists in a defined chain at a reachable level', () => {
    for (const o of ORDERS) {
      const chain = CHAINS.find((c) => c.id === o.need.chain);
      expect(chain, `order ${o.id} references unknown chain ${o.need.chain}`).toBeDefined();
      expect(
        o.need.level,
        `order ${o.id} needs ${o.need.chain} level ${o.need.level} but the chain tops out at ${chain!.levels.length - 1}`,
      ).toBeLessThan(chain!.levels.length);
      expect(o.need.level).toBeGreaterThanOrEqual(0);
    }
  });

  it('every needed chain can actually spawn from the producer', () => {
    const spawnable = new Set(SPAWN_TABLE.filter((s) => s.weight > 0).map((s) => s.chain));
    for (const o of ORDERS) {
      expect(spawnable.has(o.need.chain), `order ${o.id} needs unspawnable chain ${o.need.chain}`).toBe(true);
    }
  });

  it('order ids are unique and rewards positive', () => {
    const ids = new Set(ORDERS.map((o) => o.id));
    expect(ids.size).toBe(ORDERS.length);
    for (const o of ORDERS) {
      expect(o.rewardEnergy).toBeGreaterThan(0);
      expect(o.rewardCoins).toBeGreaterThan(0);
    }
  });

  it('chapters tile the order spine exactly', () => {
    expect(CHAPTERS[0]!.start).toBe(0);
    for (let i = 1; i < CHAPTERS.length; i++) {
      expect(CHAPTERS[i]!.start).toBe(CHAPTERS[i - 1]!.end);
    }
    expect(CHAPTERS[CHAPTERS.length - 1]!.end).toBe(ORDERS.length);
    expect(chapterFor(0).id).toBe(1);
    expect(chapterFor(12).id).toBe(2);
    expect(chapterFor(23).id).toBe(2);
  });

  it('chain levels and names stay in lockstep', () => {
    for (const c of CHAINS) {
      expect(c.levels.length).toBe(c.levelNames.length);
    }
  });

  it('zone stages and journal unlocks stay within the order spine', () => {
    for (const z of ZONE_STAGES) {
      expect(z.at).toBeLessThanOrEqual(ORDERS.length);
    }
    for (const j of JOURNAL) {
      expect(j.at, `journal ${j.id} unlocks after the story ends`).toBeLessThanOrEqual(ORDERS.length);
    }
  });
});
