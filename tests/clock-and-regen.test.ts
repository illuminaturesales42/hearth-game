import { describe, expect, it } from 'vitest';
import { advanceDay, initialActionState } from '../src/core/actions';
import { accrueRegen, initialEnergy, msToNextTick } from '../src/core/energy';
import { ENERGY } from '../src/data/economy';
import { Game } from '../src/core/game';

const day = (s: string) => new Date(`${s}T12:00:00`).getTime();

describe('clock manipulation is not a faucet', () => {
  it('a backwards day change does not count as a new active day', () => {
    // Active today, then the clock is rolled back a day.
    const active = advanceDay(initialActionState(day('2026-07-10')), day('2026-07-10'));
    expect(active.advanced).toBe(true);
    const back = advanceDay(active.state, day('2026-07-09'));
    expect(back.advanced).toBe(false); // no bonus, no chest, no hearthstone
    expect(back.dailyBonus).toBe(0);
    expect(back.chestCoins).toBe(0);
  });

  it('a genuine next day still advances (guard is not too aggressive)', () => {
    const d1 = advanceDay(initialActionState(day('2026-07-10')), day('2026-07-10'));
    const d2 = advanceDay(d1.state, day('2026-07-11'));
    expect(d2.advanced).toBe(true);
    expect(d2.state.streak).toBe(2);
  });
});

describe('passive regen survives a rewound clock', () => {
  it('re-anchors instead of freezing when now < lastRegenAt', () => {
    const e = initialEnergy(day('2026-07-10')); // lastRegenAt in the "future"
    const rewound = accrueRegen(e, day('2026-07-10') - 60 * 60_000); // clock back 1h
    expect(rewound.lastRegenAt).toBe(day('2026-07-10') - 60 * 60_000); // anchored to now
  });

  it('the HUD countdown never reads above a full tick after a rewind', () => {
    const e = initialEnergy(day('2026-07-10'));
    const ms = msToNextTick(e, day('2026-07-10') - 60 * 60_000);
    expect(ms).toBeLessThanOrEqual(ENERGY.regenMs);
    expect(ms).toBeGreaterThanOrEqual(0);
  });
});

describe('the Chronicle is not lost across midnight', () => {
  it('an action as the first call after midnight still writes yesterday', () => {
    const g = new Game(day('2026-07-07'));
    g.completeAction('water', day('2026-07-07')); // some activity on day 1
    // First call of day 2 is an action (not the 20s tick / a merge).
    g.completeAction('water', day('2026-07-08'));
    expect(g.snapshot.chronicle.entries.some((e) => e.day === '2026-07-07')).toBe(true);
  });
});
