import { describe, expect, it } from 'vitest';
import { computeMood, daysBetween, meditatedToday, moodCaption, weatherFromWmo } from '../src/core/world-mood';
import type { WeatherNow } from '../src/core/world-mood';

const w = (over: Partial<WeatherNow>): WeatherNow => ({
  kind: 'clear',
  cloudCover: 0,
  windKph: 5,
  precipMm: 0,
  fetchedAt: 0,
  ...over,
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
    const still = computeMood({
      ...base,
      weather: w({ windKph: 15 }),
      meditatedToday: true,
      lastCalmDay: '2026-07-07',
    });
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
    expect(meditatedToday({ water: 2 })).toBe(false);
  });

  it('moodCaption narrates notable weather only', () => {
    const quiet = computeMood({
      weather: w({}),
      meditatedToday: false,
      lastCalmDay: '2026-07-07',
      today: '2026-07-07',
      sleptWell: false,
    });
    expect(typeof moodCaption(quiet)).toBe('string');
    const rainy = computeMood({
      weather: w({ kind: 'rain', precipMm: 2 }),
      meditatedToday: false,
      lastCalmDay: null,
      today: '2026-07-07',
      sleptWell: false,
    });
    expect(moodCaption(rainy)).toContain('rain');
  });
});

describe('computeMood — real-world actions bloom the town', () => {
  const base = { weather: null, meditatedToday: false, lastCalmDay: null, today: '2026-07-07', sleptWell: false };

  it('a quiet day leaves the world at rest (no reactions, no punishment)', () => {
    const m = computeMood(base);
    expect(m.wellSparkle).toBe(false);
    expect(m.bloom).toBe(0);
    expect(m.gardenLush).toBe(0);
    expect(m.villagersOut).toBe(0);
    expect(m.festive).toBe(0);
    expect(m.butterflies).toBe(false);
  });

  it('drinking water sparkles the well and greens the gardens', () => {
    const m = computeMood({ ...base, counts: { water: 1 } });
    expect(m.wellSparkle).toBe(true);
    expect(m.gardenLush).toBeGreaterThan(0);
    expect(m.bloom).toBeGreaterThan(0);
  });

  it('a nature photo blooms flowers; water + photo draws butterflies', () => {
    const photo = computeMood({ ...base, counts: { 'nature-photo': 1 } });
    expect(photo.bloom).toBeGreaterThanOrEqual(0.6);
    const flourishing = computeMood({ ...base, counts: { 'nature-photo': 1, water: 1, stretch: 1 } });
    expect(flourishing.butterflies).toBe(true);
  });

  it('a stretch makes the gardens visibly lusher', () => {
    const still = computeMood(base);
    const stretched = computeMood({ ...base, counts: { stretch: 1 } });
    expect(stretched.gardenLush).toBeGreaterThan(still.gardenLush);
  });

  it('walking — logged or from health — busies the roads', () => {
    const stepped = computeMood({ ...base, counts: { steps: 1 } });
    expect(stepped.villagersOut).toBeGreaterThan(0);
    const healthWalk = computeMood({ ...base, walkedToday: true });
    expect(healthWalk.villagersOut).toBeGreaterThan(0);
  });

  it('festival banners gather only over a long streak', () => {
    expect(computeMood({ ...base, streak: 3 }).festive).toBe(0);
    const week = computeMood({ ...base, streak: 8 }).festive;
    const fortnight = computeMood({ ...base, streak: 14 }).festive;
    expect(fortnight).toBeGreaterThan(week);
    expect(fortnight).toBeLessThanOrEqual(1);
  });

  it('every reaction stays within 0..1 (reflect, never overwhelm)', () => {
    const loud = computeMood({
      ...base,
      counts: { water: 5, stretch: 3, 'nature-photo': 2, steps: 4, stairs: 2 },
      walkedToday: true,
      streak: 40,
    });
    for (const v of [loud.bloom, loud.gardenLush, loud.villagersOut, loud.festive]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('moodCaption surfaces the day’s finest earned flourish', () => {
    const bloomy = computeMood({ ...base, counts: { 'nature-photo': 1 } });
    expect(moodCaption(bloomy)).toContain('flowers');
    const festivy = computeMood({ ...base, streak: 20 });
    expect(moodCaption(festivy)).toContain('festival');
  });
});
