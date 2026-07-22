import { describe, expect, it } from 'vitest';
import { constellationFor, activeMeteorShower, METEOR_SHOWERS } from '../src/data/constellations';

describe('constellationFor — seasonal + hemisphere aware', () => {
  it('northern seasons map to their icons', () => {
    expect(constellationFor(0, false).name).toBe('Orion'); // Jan (winter)
    expect(constellationFor(3, false).name).toBe('the Plough'); // Apr (spring)
    expect(constellationFor(6, false).name).toBe('Cygnus'); // Jul (summer)
    expect(constellationFor(9, false).name).toBe('Cassiopeia'); // Oct (autumn)
  });

  it('southern skies get the Cross, and Scorpius in their winter', () => {
    expect(constellationFor(0, true).name).toBe('the Southern Cross'); // Jan (southern summer)
    expect(constellationFor(6, true).name).toBe('Scorpius'); // Jul (southern winter)
  });

  it('every constellation has stars and its lines index real stars', () => {
    for (const southern of [false, true]) {
      for (let m = 0; m < 12; m++) {
        const c = constellationFor(m, southern);
        expect(c.stars.length).toBeGreaterThan(2);
        for (const [a, b] of c.lines) {
          expect(c.stars[a]).toBeDefined();
          expect(c.stars[b]).toBeDefined();
        }
      }
    }
  });
});

describe('activeMeteorShower — shooting stars on the real peak nights', () => {
  const at = (month: number, day: number) => new Date(2026, month, day, 22, 0, 0).getTime();

  it('peaks on the Perseids (Aug 12) at full intensity', () => {
    const s = activeMeteorShower(at(7, 12));
    expect(s?.name).toBe('the Perseids');
    expect(s?.intensity).toBeCloseTo(1);
  });

  it('fades over the days around a peak, and is null well away from any shower', () => {
    expect(activeMeteorShower(at(7, 13))?.intensity).toBeCloseTo(1 - 1 / 3); // one day out
    expect(activeMeteorShower(at(7, 20))).toBeNull(); // clear of the window
    expect(activeMeteorShower(at(5, 15))).toBeNull(); // no June shower listed
  });

  it('the Geminids peak in December', () => {
    expect(activeMeteorShower(at(11, 14))?.name).toBe('the Geminids');
  });

  it('every listed shower has a valid month/day', () => {
    for (const s of METEOR_SHOWERS) {
      expect(s.month).toBeGreaterThanOrEqual(0);
      expect(s.month).toBeLessThanOrEqual(11);
      expect(s.day).toBeGreaterThanOrEqual(1);
      expect(s.day).toBeLessThanOrEqual(31);
    }
  });
});
