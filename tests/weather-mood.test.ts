import { afterEach, describe, expect, it } from 'vitest';
import {
  MOOD_CAPTION,
  MOOD_FEELING,
  MoodHysteresis,
  WEATHER_MOODS,
  resolveMood,
  setMoodOverride,
  type MoodSignals,
} from '../src/core/weather-mood';
import type { PhaseWeights } from '../src/core/time-of-day';
import type { WeatherNow } from '../src/core/world-mood';

const day: PhaseWeights = { dawn: 0, day: 1, dusk: 0, evening: 0, night: 0 };
const night: PhaseWeights = { dawn: 0, day: 0, dusk: 0, evening: 0, night: 1 };
const dawn: PhaseWeights = { dawn: 0.8, day: 0.4, dusk: 0, evening: 0, night: 0.1 };
const dusk: PhaseWeights = { dawn: 0, day: 0.4, dusk: 0.8, evening: 0.2, night: 0.1 };

function wx(partial: Partial<WeatherNow>): WeatherNow {
  return { kind: 'clear', cloudCover: 0.15, windKph: 8, precipMm: 0, fetchedAt: 0, ...partial };
}

function sig(partial: Partial<MoodSignals>): MoodSignals {
  return { weather: wx({}), weights: day, moonAmount: 0, snowDepth: 0, frost: 0, ...partial };
}

describe('resolveMood — the priority ladder', () => {
  afterEach(() => setMoodOverride(null));

  it('storms outrank everything', () => {
    expect(resolveMood(sig({ weather: wx({ kind: 'storm', precipMm: 4, windKph: 40 }) }))).toBe('storm-watch');
    // heavy wind-driven rain is a storm in feeling even without the WMO code
    expect(resolveMood(sig({ weather: wx({ kind: 'rain', precipMm: 3, windKph: 30 }) }))).toBe('storm-watch');
  });

  it('gentle rain is cosy, not dramatic', () => {
    expect(resolveMood(sig({ weather: wx({ kind: 'rain', precipMm: 0.8, windKph: 10 }) }))).toBe('cosy-rain');
  });

  it('snow falling or lying reads as snow-glow, even under clear skies', () => {
    expect(resolveMood(sig({ weather: wx({ kind: 'snow', precipMm: 0.5 }) }))).toBe('snow-glow');
    expect(resolveMood(sig({ snowDepth: 0.6 }))).toBe('snow-glow');
  });

  it('fog is misty; strong dry wind is wind-swept; freezing clear air is frosted', () => {
    expect(resolveMood(sig({ weather: wx({ kind: 'fog' }) }))).toBe('misty');
    expect(resolveMood(sig({ weather: wx({ windKph: 35 }) }))).toBe('wind-swept');
    expect(resolveMood(sig({ weather: wx({ tempC: -3 }), frost: 0.8 }))).toBe('frosted');
  });

  it('night splits on moon and cloud', () => {
    expect(resolveMood(sig({ weights: night, moonAmount: 0.7 }))).toBe('moonlit-clear');
    expect(resolveMood(sig({ weights: night, moonAmount: 0.05 }))).toBe('deep-night');
    expect(resolveMood(sig({ weights: night, moonAmount: 0.7, weather: wx({ cloudCover: 0.9 }) }))).toBe('deep-night');
  });

  it('clear daylight splits into fresh-morning / bright-day / golden-calm by phase', () => {
    expect(resolveMood(sig({ weights: dawn }))).toBe('fresh-morning');
    expect(resolveMood(sig({ weights: day }))).toBe('bright-day');
    expect(resolveMood(sig({ weights: dusk }))).toBe('golden-calm');
  });

  it('full cloud without rain is soft-overcast', () => {
    expect(resolveMood(sig({ weather: wx({ kind: 'overcast', cloudCover: 1 }) }))).toBe('soft-overcast');
  });

  it('no weather reading at all still resolves (clear defaults)', () => {
    expect(resolveMood(sig({ weather: null }))).toBe('bright-day');
  });

  it('the override wins for every consumer, and clears', () => {
    setMoodOverride('storm-watch');
    expect(resolveMood(sig({}))).toBe('storm-watch');
    setMoodOverride(null);
    expect(resolveMood(sig({}))).toBe('bright-day');
  });
});

describe('MoodHysteresis — no strobing at boundaries', () => {
  it('adopts the first reading immediately', () => {
    const h = new MoodHysteresis();
    expect(h.next('bright-day')).toBe('bright-day');
  });

  it('requires two consecutive readings to switch', () => {
    const h = new MoodHysteresis();
    h.next('bright-day');
    expect(h.next('cosy-rain')).toBe('bright-day'); // first dissent holds
    expect(h.next('cosy-rain')).toBe('cosy-rain'); // second confirms
  });

  it('a flickering boundary never switches', () => {
    const h = new MoodHysteresis();
    h.next('soft-overcast');
    expect(h.next('cosy-rain')).toBe('soft-overcast');
    expect(h.next('soft-overcast')).toBe('soft-overcast');
    expect(h.next('cosy-rain')).toBe('soft-overcast'); // streak was reset
  });

  it('snap adopts instantly (scrubber / mode change)', () => {
    const h = new MoodHysteresis();
    h.next('bright-day');
    h.snap('storm-watch');
    expect(h.value()).toBe('storm-watch');
  });
});

describe('mood copy', () => {
  it('every mood has a caption and a target feeling', () => {
    for (const m of WEATHER_MOODS) {
      expect(MOOD_CAPTION[m]).toBeTruthy();
      expect(MOOD_FEELING[m]).toBeTruthy();
    }
  });
});
