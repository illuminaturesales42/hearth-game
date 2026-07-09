import { describe, expect, it } from 'vitest';
import {
  localDayWindow,
  mainSleepHours,
  snapshotFromRecords,
  sumForDay,
} from '../src/health/health-connect';
import type { QuantityRecord, SleepSession } from '../src/health/health-connect';

const HOUR = 3_600_000;
// A fixed instant; all record times are derived from the LOCAL day it lands in,
// so these assertions hold in any timezone the test runner uses.
const NOW = new Date('2026-07-08T14:00:00').getTime();
const DAY = localDayWindow(NOW);
const at = (hoursFromMidnight: number) => DAY.start + hoursFromMidnight * HOUR;

const steps = (h: number, value: number): QuantityRecord => ({ startTime: at(h), endTime: at(h) + HOUR, value });

describe('localDayWindow', () => {
  it('is a 24h span containing now, starting at local midnight', () => {
    expect(DAY.end - DAY.start).toBe(24 * HOUR);
    expect(NOW).toBeGreaterThanOrEqual(DAY.start);
    expect(NOW).toBeLessThan(DAY.end);
    expect(new Date(DAY.start).getHours()).toBe(0);
  });
});

describe('sumForDay', () => {
  it('sums records that START within the day, ignoring others and negatives', () => {
    const recs = [
      steps(2, 1000),
      steps(9, 2500),
      steps(23.5, 400),
      { startTime: at(-1), endTime: at(0.5), value: 9999 }, // started yesterday → excluded
      { startTime: at(1), endTime: at(2), value: -50 }, // clamped to 0
    ];
    expect(sumForDay(recs, DAY)).toBe(3900);
  });

  it('is zero for an empty day', () => {
    expect(sumForDay([], DAY)).toBe(0);
  });
});

describe('mainSleepHours', () => {
  it('sums asleep stages of the morning session, excluding awake/out-of-bed', () => {
    const session: SleepSession = {
      startTime: at(-1), // 23:00 previous night
      endTime: at(6.5), // 06:30
      dataOrigin: 'Samsung Health',
      stages: [
        { startTime: at(-1), endTime: at(2), stage: 'light' }, // 3h
        { startTime: at(2), endTime: at(2.5), stage: 'awake' }, // excluded 0.5h
        { startTime: at(2.5), endTime: at(6.5), stage: 'deep' }, // 4h
      ],
    };
    const res = mainSleepHours([session], NOW);
    expect(res.hours).toBe(7); // 3 + 4, the 0.5 awake dropped
    expect(res.sourceApp).toBe('Samsung Health');
  });

  it('counts the whole duration when a session has no staging', () => {
    const session: SleepSession = { startTime: at(0), endTime: at(8) };
    expect(mainSleepHours([session], NOW).hours).toBe(8);
  });

  it('picks the session that ended latest in the morning band', () => {
    const nap: SleepSession = { startTime: at(-4), endTime: at(-2) }; // ends before the band-ish, short
    const morning: SleepSession = { startTime: at(0), endTime: at(7) };
    expect(mainSleepHours([nap, morning], NOW).hours).toBe(7);
  });

  it('returns null when nothing was slept in the band (e.g. an afternoon nap)', () => {
    const nap: SleepSession = { startTime: at(14), endTime: at(15) }; // after noon → out of band
    expect(mainSleepHours([nap], NOW).hours).toBeNull();
  });

  it('omits sourceApp when the record has no origin (exactOptionalPropertyTypes)', () => {
    const res = mainSleepHours([{ startTime: at(0), endTime: at(6) }], NOW);
    expect('sourceApp' in res).toBe(false);
  });
});

describe('snapshotFromRecords', () => {
  it('assembles a Health-Connect snapshot end to end', () => {
    const snap = snapshotFromRecords(
      [steps(7, 5000), steps(12, 3200)],
      [{ startTime: at(8), endTime: at(8.2), value: 6 }],
      [{ startTime: at(-1), endTime: at(6), dataOrigin: 'Oura' }],
      NOW,
    );
    expect(snap).toEqual({
      stepsToday: 8200,
      flightsToday: 6,
      sleepHoursLastNight: 7,
      sleepSourceApp: 'Oura',
      source: 'health-connect',
    });
  });

  it('reports null sleep and no source when there is no morning session', () => {
    const snap = snapshotFromRecords([steps(9, 1200)], [], [], NOW);
    expect(snap.stepsToday).toBe(1200);
    expect(snap.sleepHoursLastNight).toBeNull();
    expect('sleepSourceApp' in snap).toBe(false);
    expect(snap.source).toBe('health-connect');
  });
});
