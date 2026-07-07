import { describe, expect, it } from 'vitest';
import { computeMood, daysBetween, meditatedToday, moodCaption, weatherFromWmo } from '../src/core/world-mood';
import type { WeatherNow } from '../src/core/world-mood';

const w = (over: Partial<WeatherNow>): WeatherNow => ({
  kind: 'clear', cloudCover: 0, windKph: 5, precipMm: 0, fetchedAt: 0, ...over,
});

describe('weatherFromWmo', () => {
  it('maps WMO codes to render categories', () => {
    expect(weatherFromWmo(0, 10, 5, 0, 0).kind).toBe('clear');
    expect(weatherFromWmo(2, 50, 5, 0, 0).kind).toBe('clouds');
    expect(weatherFromWmo(3, 100, 5, 0, 0).kind).toBe('overcast');
    expect(weatherFromWmo(45, 80, 5, 0, 0).kind).toBe('fog');
    expect(weatherFromWmo(61, 90, 12, 1.2, 0).kind).toBe('rain');
    expect(weatherFromWmo(81, 90, 12, 2, 0).kind).toBe('rain');
    expect(weatherFromWmo(73, 90, 8, 1, 0).kind).toBe('snow');
    expect(weatherFromWmo(96, 100, 30, 5, 0).kind).toBe('storm');
  });

  it('normalizes and clamps inputs', () => {
    const now = weatherFromWmo(0, 250, -3, -1, 7);
    expect(now.cloudCover).toBe(1);
    expect(now.windKph).toBe(0);
    expect(now.precipMm).toBe(0);
    expect(now.fetchedAt).toBe(7);
  });
});

describe('computeMood — the sea carries the day', () => {
  const base = { weather: null, meditatedToday: false, lastCalmDay: null, today: '2026-07-07', sleptWell: false };

  it('real wind roughens the sea monotonically', () => {
    const calm = computeMood({ ...base, weather: w({ windKph: 2 }) });
    const gale = computeMood({ ...base, weather: w({ windKph: 38 }) });
    expect(gale.sea).toBeGreaterThan(calm.sea);
    expect(gale.wind).toBeGreaterThan(calm.wind);
  });

  it('meditating today stills the water', () => {
    const restless = computeMood({ ...base, weather: w({ windKph: 15 }) });
    const still = computeMood({ ...base, weather: w({ windKph: 15 }), meditatedToday: true, lastCalmDay: '2026-07-07' });
    expect(still.sea).toBeLessThan(restless.sea);
    expect(still.calm).toBe(true);
    expect(still.restless).toBe(0);
  });

  it('days without meditation make the sea more restless, gently', () => {
    const yesterday = computeMood({ ...base, lastCalmDay: '2026-07-06' });
    const threeDays = computeMood({ ...base, lastCalmDay: '2026-07-04' });
    expect(threeDays.restless).toBeGreaterThan(yesterday.restless);
    expect(threeDays.sea).toBeGreaterThan(yesterday.sea);
  });

  it('a brand-new player sees a normal harbour (never punished)', () => {
    const fresh = computeMood(base);
    expect(fresh.restless).toBeLessThanOrEqual(0.25);
    expect(fresh.sea).toBeLessThan(0.6);
  });

  it('storms outrank rain outrank clear, all clamped to 0..1', () => {
    const clear = computeMood({ ...base, weather: w({ kind: 'clear' }) });
    const rain = computeMood({ ...base, weather: w({ kind: 'rain', precipMm: 2 }) });
    const storm = computeMood({ ...base, weather: w({ kind: 'storm', windKph: 60, precipMm: 8 }) });
    expect(rain.sea).toBeGreaterThan(clear.sea);
    expect(storm.sea).toBeGreaterThan(rain.sea);
    for (const m of [clear, rain, storm]) {
      expect(m.sea).toBeGreaterThanOrEqual(0);
      expect(m.sea).toBeLessThanOrEqual(1);
      expect(m.precip).toBeLessThanOrEqual(1);
    }
  });

  it('sleep and meditation warm the hearth glow', () => {
    const flat = computeMood(base);
    const rested = computeMood({ ...base, sleptWell: true, meditatedToday: true });
    expect(rested.glow).toBeGreaterThan(flat.glow);
  });
});

describe('mood helpers', () => {
  it('daysBetween counts whole days across months', () => {
    expect(daysBetween('2026-07-06', '2026-07-07')).toBe(1);
    expect(daysBetween('2026-06-30', '2026-07-02')).toBe(2);
    expect(daysBetween('2026-07-07', '2026-07-07')).toBe(0);
  });

  it('meditatedToday sees guided sessions and logged sits', () => {
    expect(meditatedToday({})).toBe(false);
    expect(meditatedToday({ 'med-box': 1 })).toBe(true);
    expect(meditatedToday({ 'log-meditation': 1 })).toBe(true);
    expect(meditatedToday({ 'water': 2 })).toBe(false);
  });

  it('moodCaption narrates notable weather only', () => {
    const quiet = computeMood({ weather: w({}), meditatedToday: false, lastCalmDay: '2026-07-07', today: '2026-07-07', sleptWell: false });
    expect(typeof moodCaption(quiet)).toBe('string');
    const rainy = computeMood({ weather: w({ kind: 'rain', precipMm: 2 }), meditatedToday: false, lastCalmDay: null, today: '2026-07-07', sleptWell: false });
    expect(moodCaption(rainy)).toContain('rain');
  });
});
