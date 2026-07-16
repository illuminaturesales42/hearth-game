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

describe('stemLevels — ambience derived from the world mood (additive only)', () => {
  it('a quiet day is silent — absence of a habit is never a cue', () => {
    const l = stemLevels(mood({}));
    expect(l).toEqual({ calmPad: 0, rain: 0, chatter: 0 });
  });

  it('meditation raises the calm pad', () => {
    expect(stemLevels(mood({ calm: true })).calmPad).toBe(1);
  });

  it('rain scales with intensity, with a floor so a drizzle is still heard', () => {
    expect(stemLevels(mood({ weather: 'rain', precip: 0.8 })).rain).toBe(0.8);
    expect(stemLevels(mood({ weather: 'rain', precip: 0.1 })).rain).toBe(0.35); // floor
    expect(stemLevels(mood({ weather: 'storm', precip: 1 })).rain).toBe(1);
    expect(stemLevels(mood({ weather: 'clouds', precip: 0.5 })).rain).toBe(0); // no rain, no bed
  });

  it('a good walk brings a faint distant bustle', () => {
    expect(stemLevels(mood({ villagersOut: 0.6 })).chatter).toBe(0.6);
    expect(stemLevels(mood({ villagersOut: 1 })).chatter).toBe(1);
  });
});
