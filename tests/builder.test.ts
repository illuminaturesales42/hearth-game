import { describe, expect, it } from 'vitest';
import { BUILDER_CHAINS, RESOURCE_SPAWN_TABLE, sellValue } from '../src/data/economy';
import { CHAINS } from '../src/data/economy';
import { maxLevel } from '../src/core/board';

describe("Builder's Yard chains", () => {
  it('every builder chain is defined and craftable in the Workshop', () => {
    const spawnable = new Set(RESOURCE_SPAWN_TABLE.map((e) => e.chain));
    for (const c of BUILDER_CHAINS) {
      expect(CHAINS.some((d) => d.id === c)).toBe(true);
      expect(spawnable.has(c)).toBe(true);
    }
  });

  it('a finished building sells for far more than a raw material', () => {
    for (const c of BUILDER_CHAINS) {
      const top = maxLevel(c);
      expect(sellValue(c, top)).toBeGreaterThan(sellValue(c, 0) * 5); // the climb pays off
      expect(sellValue(c, top)).toBeGreaterThan(sellValue('wood', top)); // premium vs ordinary
    }
  });

  it('selling never yields energy or power — coins only (unchanged pillar)', () => {
    // sellValue is a pure number; the guardrail (no energy) is covered in the
    // game-level sell tests. Here we just assert it is always positive.
    for (const c of BUILDER_CHAINS) expect(sellValue(c, 0)).toBeGreaterThan(0);
  });
});
