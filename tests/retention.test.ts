import { describe, expect, it } from 'vitest';
import {
  completeFtue,
  currentStreak,
  emptyCohort,
  longestStreak,
  recordActive,
  recordFtueStep,
  shiftDay,
  summarize,
} from '../src/core/retention';

describe('shiftDay — UTC-safe day arithmetic', () => {
  it('adds and subtracts whole days across month boundaries', () => {
    expect(shiftDay('2026-07-07', 1)).toBe('2026-07-08');
    expect(shiftDay('2026-07-01', -1)).toBe('2026-06-30');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDay('2026-07-07', 7)).toBe('2026-07-14');
  });
});

describe('cohort recording (immutable)', () => {
  it('starts with install day active', () => {
    const c = emptyCohort('2026-07-07');
    expect(c.activeDays).toEqual(['2026-07-07']);
    expect(c.firstSeenDay).toBe('2026-07-07');
    expect(c.ftueCompleted).toBe(false);
  });

  it('records new active days uniquely and sorted', () => {
    let c = emptyCohort('2026-07-07');
    c = recordActive(c, '2026-07-09');
    c = recordActive(c, '2026-07-08');
    c = recordActive(c, '2026-07-08'); // dupe
    expect(c.activeDays).toEqual(['2026-07-07', '2026-07-08', '2026-07-09']);
    expect(c.lastSeenDay).toBe('2026-07-09');
  });

  it('FTUE furthest step only climbs; completion is sticky', () => {
    let c = emptyCohort('2026-07-07');
    c = recordFtueStep(c, 3);
    c = recordFtueStep(c, 1); // no regress
    expect(c.ftueFurthestStep).toBe(3);
    c = completeFtue(c);
    expect(c.ftueCompleted).toBe(true);
  });
});

describe('streaks', () => {
  it('longestStreak finds the longest consecutive run', () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(['2026-07-07'])).toBe(1);
    expect(longestStreak(['2026-07-07', '2026-07-08', '2026-07-09', '2026-07-12', '2026-07-13'])).toBe(3);
  });

  it('currentStreak counts back from today, 0 if today is absent', () => {
    const days = ['2026-07-05', '2026-07-06', '2026-07-07'];
    expect(currentStreak(days, '2026-07-07')).toBe(3);
    expect(currentStreak(days, '2026-07-08')).toBe(0);
    expect(currentStreak(['2026-07-04', '2026-07-07'], '2026-07-07')).toBe(1);
  });
});

describe('retention summary — the soft-launch gate', () => {
  it('a one-day player has no retention yet', () => {
    const s = summarize(emptyCohort('2026-07-07'), '2026-07-07');
    expect(s.d1).toBe(false);
    expect(s.returnedNextDay).toBe(false);
    expect(s.activeDayCount).toBe(1);
    expect(s.daysSinceInstall).toBe(0);
  });

  it('returning the next day sets D1 and returnedNextDay', () => {
    let c = emptyCohort('2026-07-07');
    c = recordActive(c, '2026-07-08');
    const s = summarize(c, '2026-07-08');
    expect(s.returnedNextDay).toBe(true);
    expect(s.d1).toBe(true);
    expect(s.d7).toBe(false);
  });

  it('D7 and D30 reflect lifetime reach, not exact-day pedantry', () => {
    let c = emptyCohort('2026-07-01');
    c = recordActive(c, '2026-07-09'); // offset 8 → past D7
    let s = summarize(c, '2026-07-09');
    expect(s.d1).toBe(true);
    expect(s.d7).toBe(true);
    expect(s.d30).toBe(false);
    c = recordActive(c, '2026-08-05'); // offset 35 → past D30
    s = summarize(c, '2026-08-05');
    expect(s.d30).toBe(true);
  });

  it('surfaces FTUE funnel position', () => {
    let c = emptyCohort('2026-07-07');
    c = recordFtueStep(c, 4);
    const s = summarize(c, '2026-07-07');
    expect(s.ftueFurthestStep).toBe(4);
    expect(s.ftueCompleted).toBe(false);
  });
});
