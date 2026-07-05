import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { KINDNESS, promptAt } from '../src/data/kindness';

const T0 = new Date('2026-07-05T12:00:00').getTime();

describe('warm a stranger', () => {
  it('a compliment grants base energy, once per day', () => {
    const g = new Game(T0);
    g.claimDaily(T0); // mark the day active so the sunrise bonus isn't mixed in
    const before = g.snapshot.energy.current;
    expect(g.canDoKindness(T0)).toBe(true);
    g.doKindness(false, T0);
    expect(g.snapshot.energy.current).toBe(before + KINDNESS.baseEnergy);
    expect(g.canDoKindness(T0)).toBe(false);
    // second attempt same day pays nothing
    const after = g.snapshot.energy.current;
    g.doKindness(false, T0);
    expect(g.snapshot.energy.current).toBe(after);
  });

  it('a selfie with the new friend pays the bonus', () => {
    const g = new Game(T0);
    g.claimDaily(T0);
    const before = g.snapshot.energy.current;
    g.doKindness(true, T0);
    expect(g.snapshot.energy.current).toBe(before + KINDNESS.baseEnergy + KINDNESS.selfieBonus);
  });

  it('prompts rotate and wrap', () => {
    expect(typeof promptAt(0)).toBe('string');
    expect(promptAt(0)).toBe(promptAt(8)); // wraps at length 8
  });
});
