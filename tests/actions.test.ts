import { describe, expect, it } from 'vitest';
import {
  CHEST_COINS,
  canDoAction,
  chestDaysLeft,
  initialActionState,
  recordAction,
  rolloverActions,
} from '../src/core/actions';
import { isWithinWindow, sunTimes, sunWindow } from '../src/core/sun';
import { LOG_MEDITATION, loggedMinutesToEnergy } from '../src/data/meditations';
import { COLD_PLUNGE, SAUNA, recoveryEnergy } from '../src/data/recovery';
import { GRATITUDE } from '../src/data/gratitude';
import { dailyBonus, earnableById, streakMultiplier } from '../src/core/actions';
import { Game } from '../src/core/game';

const T0 = new Date('2026-07-05T09:00:00').getTime();

describe('action ledger', () => {
  it('grants energy and enforces the per-day cap', () => {
    const s0 = initialActionState(T0);
    const r1 = recordAction(s0, 'water', T0);
    expect(r1.energy).toBe(10);
    const r2 = recordAction(r1.state, 'water', T0 + 1000);
    expect(r2.energy).toBe(0); // water is once/day
    expect(canDoAction(r2.state, 'water', T0 + 1000)).toBe(false);
  });

  it('honours timesPerDay > 1 (breathe twice)', () => {
    let s = initialActionState(T0);
    expect(recordAction(s, 'breathe', T0).energy).toBe(6);
    s = recordAction(s, 'breathe', T0).state;
    expect(recordAction(s, 'breathe', T0).energy).toBe(6);
    s = recordAction(s, 'breathe', T0).state;
    expect(recordAction(s, 'breathe', T0).energy).toBe(0);
  });

  it('resets counts at midnight', () => {
    const done = recordAction(initialActionState(T0), 'water', T0).state;
    const nextDay = rolloverActions(done, T0 + 24 * 3600_000);
    expect(nextDay.counts.water ?? 0).toBe(0);
  });

  it('grows the streak on consecutive days, resets gently after a gap', () => {
    const day = (n: number) => T0 + n * 24 * 3600_000;
    let s = recordAction(initialActionState(day(0)), 'water', day(0)).state;
    expect(s.streak).toBe(1);
    s = recordAction(s, 'water', day(1)).state;
    expect(s.streak).toBe(2);
    s = recordAction(s, 'water', day(2)).state;
    expect(s.streak).toBe(3);
    // skip day 3, act on day 4 -> streak resets to 1, no penalty
    s = recordAction(s, 'water', day(4)).state;
    expect(s.streak).toBe(1);
  });

  it('opens a chest every third active day', () => {
    const day = (n: number) => T0 + n * 24 * 3600_000;
    let s = initialActionState(day(0));
    expect(recordAction(s, 'water', day(0)).chestCoins).toBe(0);
    s = recordAction(s, 'water', day(0)).state;
    expect(chestDaysLeft(s)).toBe(2);
    s = recordAction(s, 'water', day(1)).state;
    const third = recordAction(s, 'water', day(2));
    expect(third.chestCoins).toBe(CHEST_COINS);
    expect(third.state.chestProgress).toBe(0);
  });
});

describe('meditation', () => {
  it('resolves guided-session energy from the meditation catalogue', () => {
    expect(earnableById('med-morning')?.energy).toBe(10);
    expect(earnableById('med-box')?.timesPerDay).toBe(2);
  });

  it('completing a guided session grants its energy and caps per day', () => {
    const s0 = initialActionState(T0);
    const r1 = recordAction(s0, 'med-morning', T0);
    expect(r1.energy).toBe(10);
    expect(recordAction(r1.state, 'med-morning', T0 + 1000).energy).toBe(0);
  });

  it('box breathing can be done twice a day', () => {
    let s = initialActionState(T0);
    expect(recordAction(s, 'med-box', T0).energy).toBe(8);
    s = recordAction(s, 'med-box', T0).state;
    expect(recordAction(s, 'med-box', T0).energy).toBe(8);
    s = recordAction(s, 'med-box', T0).state;
    expect(recordAction(s, 'med-box', T0).energy).toBe(0);
  });

  it('logged minutes convert to energy and clamp at the max', () => {
    expect(loggedMinutesToEnergy(10)).toBe(5);
    expect(loggedMinutesToEnergy(60)).toBe(LOG_MEDITATION.maxEnergy);
  });

  it('logging uses the energy override and is once per day', () => {
    const s0 = initialActionState(T0);
    const first = recordAction(s0, LOG_MEDITATION.id, T0, loggedMinutesToEnergy(20));
    expect(first.energy).toBe(10);
    expect(recordAction(first.state, LOG_MEDITATION.id, T0 + 1000, loggedMinutesToEnergy(20)).energy).toBe(0);
  });
});

describe('streak bonuses', () => {
  it('streak multiplier climbs to 1.7x and caps at a 7-day streak', () => {
    expect(streakMultiplier(1)).toBeCloseTo(1.1);
    expect(streakMultiplier(7)).toBeCloseTo(1.7);
    expect(streakMultiplier(20)).toBeCloseTo(1.7);
  });

  it('daily bonus scales with streak and caps', () => {
    expect(dailyBonus(1)).toBe(3);
    expect(dailyBonus(10)).toBe(12);
    expect(dailyBonus(99)).toBe(12);
  });

  it('recordAction pays the daily bonus only on the first action of a new day', () => {
    const s0 = initialActionState(T0);
    const first = recordAction(s0, 'water', T0);
    expect(first.dailyBonus).toBe(dailyBonus(first.state.streak));
    const second = recordAction(first.state, 'squats', T0 + 1000);
    expect(second.dailyBonus).toBe(0); // same day, second action
    const nextDay = recordAction(first.state, 'water', T0 + 24 * 3600_000);
    expect(nextDay.dailyBonus).toBeGreaterThan(0);
  });
});

describe('sunrise new day', () => {
  const day = (n: number) => T0 + n * 24 * 3600_000;

  it('can claim once per day; claiming pays streak-scaled energy', () => {
    const g = new Game(day(0));
    expect(g.canClaimDaily(day(0))).toBe(true);
    const before = g.snapshot.energy.current;
    const preview = g.dailyRewardPreview(day(0));
    g.claimDaily(day(0));
    expect(g.snapshot.energy.current).toBe(before + preview.energy);
    expect(g.canClaimDaily(day(0))).toBe(false); // already claimed today
  });

  it('an action counts as the day, so the dawn reward is not double-paid', () => {
    const g = new Game(day(0));
    g.completeAction('water', day(0)); // first activity of the day
    expect(g.canClaimDaily(day(0))).toBe(false);
  });

  it('streak grows across consecutive days and resets after a gap', () => {
    const g = new Game(day(0));
    g.claimDaily(day(0));
    expect(g.dailyRewardPreview(day(1)).streak).toBe(2);
    g.claimDaily(day(1));
    expect(g.dailyRewardPreview(day(2)).streak).toBe(3);
    // skip day 3, claim day 4 → resets to 1
    expect(g.dailyRewardPreview(day(4)).streak).toBe(1);
  });
});

describe('gratitude journal', () => {
  it('gratitude id is registered as a once-per-day earnable', () => {
    expect(earnableById(GRATITUDE.id)?.timesPerDay).toBe(1);
  });

  it('writing (via override) is once per day and streak-multiplied', () => {
    const s0 = initialActionState(T0);
    const energy = Math.round(GRATITUDE.baseEnergy * streakMultiplier(1));
    const first = recordAction(s0, GRATITUDE.id, T0, energy);
    expect(first.energy).toBe(energy);
    expect(recordAction(first.state, GRATITUDE.id, T0 + 1000, energy).energy).toBe(0);
  });
});

describe('recovery logging', () => {
  it('cold plunge pays a high per-minute rate, capped', () => {
    expect(recoveryEnergy(COLD_PLUNGE, 3)).toBe(9);
    expect(recoveryEnergy(COLD_PLUNGE, 10)).toBe(COLD_PLUNGE.maxEnergy);
    expect(earnableById(COLD_PLUNGE.id)?.timesPerDay).toBe(1);
  });

  it('sauna pays a gentler per-minute rate, capped', () => {
    expect(recoveryEnergy(SAUNA, 20)).toBe(14);
    expect(recoveryEnergy(SAUNA, 60)).toBe(SAUNA.maxEnergy);
  });

  it('each recovery activity logs once per day via the ledger', () => {
    const s0 = initialActionState(T0);
    const first = recordAction(s0, COLD_PLUNGE.id, T0, recoveryEnergy(COLD_PLUNGE, 3));
    expect(first.energy).toBe(9);
    expect(recordAction(first.state, COLD_PLUNGE.id, T0 + 1000, recoveryEnergy(COLD_PLUNGE, 3)).energy).toBe(0);
    // sauna is independent of the cold-plunge cap
    expect(recordAction(first.state, SAUNA.id, T0 + 1000, recoveryEnergy(SAUNA, 15)).energy).toBe(11);
  });
});

describe('sun windows', () => {
  const MEL = { lat: -37.81, lng: 144.96 };

  it('computes sunrise before sunset', () => {
    const t = sunTimes(T0, MEL);
    expect(t.sunrise).toBeLessThan(t.sunset);
    expect(Number.isFinite(t.sunrise)).toBe(true);
  });

  it('sunrise window opens before it closes', () => {
    const w = sunWindow('sunrise', T0, MEL);
    expect(w.start).toBeLessThan(w.end);
  });

  it('falls back to a clock heuristic without coords', () => {
    const morning = new Date('2026-07-05T06:30:00').getTime();
    const midday = new Date('2026-07-05T13:00:00').getTime();
    expect(isWithinWindow('sunrise', morning)).toBe(true);
    expect(isWithinWindow('sunrise', midday)).toBe(false);
  });
});
