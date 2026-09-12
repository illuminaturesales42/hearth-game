import { describe, expect, it } from 'vitest';
import { stemLevels } from '../src/core/stem-levels';
import { computeMood } from '../src/core/world-mood';
import type { WorldMood } from '../src/core/world-mood';

/** A neutral mood to override per case. */
function mood(over: Partial<WorldMood>): WorldMood {
  const base = computeMood({
    weather: null,
    meditatedToday: false,
    lastCalmDay: null,
    today: 'd1',
    sleptWell: false,
    counts: {},
    walkedToday: false,
    streak: 0,
  });
  return { ...base, ...over };
}

describe('stemLevels — ambience derived from mood + real time of day (additive only)', () => {
  it('a quiet day has no HABIT/weather-event ambience (absence is never a cue)', () => {
    const l = stemLevels(mood({ wind: 0, sea: 0 }));
    expect(l.calmPad).toBe(0);
    expect(l.rain).toBe(0);
    expect(l.chatter).toBe(0);
    expect(l.birds).toBe(0); // no dawn phase passed
    expect(l.crickets).toBe(0);
  });

  it('meditation raises the calm pad', () => {
    expect(stemLevels(mood({ calm: true })).calmPad).toBe(1);
  });

  it('a gentle breeze and surf ride the real wind and sea', () => {
    const l = stemLevels(mood({ wind: 0.4, sea: 0.5 }));
    expect(l.wind).toBe(0.4);
    expect(l.surf).toBe(0.5);
  });

  it('rain scales continuously with real intensity — no artificial floor', () => {
    expect(stemLevels(mood({ weather: 'rain', precip: 0.8 })).rain).toBeCloseTo(0.8);
    expect(stemLevels(mood({ weather: 'rain', precip: 0.1 })).rain).toBeCloseTo(0.1); // a true drizzle is a whisper now
    expect(stemLevels(mood({ weather: 'storm', precip: 0.5 })).rain).toBeCloseTo(0.65); // storm adds body
    expect(stemLevels(mood({ weather: 'clouds', precip: 0.5 })).rain).toBe(0); // no rain, no bed
  });

  it('dawn brings birdsong and night brings crickets — hushed by heavy rain', () => {
    const dawn = { dawn: 1, day: 0, dusk: 0, evening: 0, night: 0 };
    const night = { dawn: 0, day: 0, dusk: 0, evening: 0, night: 1 };
    expect(stemLevels(mood({ precip: 0 }), dawn).birds).toBe(1);
    expect(stemLevels(mood({ precip: 0 }), night).crickets).toBe(1);
    expect(stemLevels(mood({ weather: 'rain', precip: 1 }), dawn).birds).toBe(0); // downpour hushes the birds
    expect(stemLevels(mood({}), null).birds).toBe(0); // no phase → silent
  });

  it('a good walk brings a faint distant bustle', () => {
    expect(stemLevels(mood({ villagersOut: 0.6 })).chatter).toBe(0.6);
    expect(stemLevels(mood({ villagersOut: 1 })).chatter).toBe(1);
  });

  const nightW = { dawn: 0, day: 0, dusk: 0, evening: 0, night: 1 };
  const noonW = { dawn: 0, day: 1, dusk: 0, evening: 0, night: 0 };

  it('frogs sing off wet ground after dark — never at noon, hushed in a storm', () => {
    const wetNight = stemLevels(mood({ wetness: 0.6 }), nightW).frogs;
    expect(wetNight).toBeGreaterThan(0.5);
    expect(stemLevels(mood({ wetness: 0.6 }), noonW).frogs).toBe(0);
    expect(stemLevels(mood({ wetness: 0 }), nightW).frogs).toBe(0); // dry night, no chorus
    expect(stemLevels(mood({ weather: 'storm', wetness: 0.6 }), nightW).frogs).toBeLessThan(wetNight);
  });

  it('roof patter earns its place only over genuinely heavy rain', () => {
    expect(stemLevels(mood({ weather: 'rain', precip: 0.3 })).roofRain).toBe(0);
    expect(stemLevels(mood({ weather: 'rain', precip: 1 })).roofRain).toBeCloseTo(1);
    expect(stemLevels(mood({ weather: 'clear', precip: 0 })).roofRain).toBe(0);
  });

  it('the hearth answers cold, storms and cosy rain after dark', () => {
    expect(stemLevels(mood({ frost: 0.8 }), nightW).fireplace).toBeGreaterThan(0.5);
    expect(stemLevels(mood({ weather: 'storm' }), nightW).fireplace).toBeGreaterThan(0.3);
    expect(stemLevels(mood({ frost: 0.8 }), noonW).fireplace).toBe(0); // daylight, no hearth bed
    expect(stemLevels(mood({}), nightW).fireplace).toBe(0); // mild dry night stays quiet
  });
});
