import { describe, expect, it } from 'vitest';
import { effectiveWeather, presetAccumulation } from '../src/ui/weather';
import type { WeatherNow } from '../src/core/world-mood';

const real: WeatherNow = {
  kind: 'rain',
  cloudCover: 0.9,
  windKph: 20,
  precipMm: 2,
  fetchedAt: 1000,
  isDay: true,
  sunriseMs: 500,
  sunsetMs: 5000,
  tempC: 14,
  southern: true,
};

describe('effectiveWeather — "pick your sky" overrides weather, keeps the solar clock', () => {
  it("'real' returns the live reading untouched", () => {
    expect(effectiveWeather(real, 'real')).toBe(real);
    expect(effectiveWeather(null, 'real')).toBeNull();
  });

  it('a chosen mood repaints the weather but inherits real sun times + hemisphere', () => {
    const clear = effectiveWeather(real, 'clear')!;
    expect(clear.kind).toBe('clear');
    expect(clear.precipMm).toBe(0);
    // the honest bits stay real, so daylight/seasons still track the player
    expect(clear.sunriseMs).toBe(500);
    expect(clear.sunsetMs).toBe(5000);
    expect(clear.southern).toBe(true);
    expect(clear.tempC).toBe(14);
  });

  it("'rain' brings real rain over the island", () => {
    const r = effectiveWeather(real, 'rain')!;
    expect(r.kind).toBe('rain');
    expect(r.precipMm).toBeGreaterThan(0);
  });

  it("'snow' forces a cold reading so it settles and reads wintry", () => {
    const s = effectiveWeather({ ...real, tempC: 18 }, 'snow')!;
    expect(s.kind).toBe('snow');
    expect(s.tempC).toBeLessThanOrEqual(-1);
  });

  it('still paints a chosen mood with no live reading at all', () => {
    const s = effectiveWeather(null, 'snow')!;
    expect(s.kind).toBe('snow');
  });
});

describe("'interpret' — reality, softened (Mirror / Interpret / Sanctuary)", () => {
  it('keeps the weather KIND but caps the oppressive tail', () => {
    const wild: WeatherNow = { ...real, kind: 'storm', cloudCover: 1, windKph: 60, precipMm: 8 };
    const soft = effectiveWeather(wild, 'interpret')!;
    expect(soft.kind).toBe('storm'); // safe drama survives
    expect(soft.cloudCover).toBeLessThanOrEqual(0.85);
    expect(soft.windKph).toBeLessThanOrEqual(32);
    expect(soft.precipMm).toBeLessThanOrEqual(2.2);
    // the honest bits stay real
    expect(soft.sunriseMs).toBe(500);
    expect(soft.southern).toBe(true);
  });

  it('leaves gentle weather completely untouched', () => {
    const mild: WeatherNow = { ...real, kind: 'clouds', cloudCover: 0.4, windKph: 12, precipMm: 0 };
    expect(effectiveWeather(mild, 'interpret')).toEqual(mild);
  });

  it('invents nothing — no reading stays no reading', () => {
    expect(effectiveWeather(null, 'interpret')).toBeNull();
  });
});

describe('presetAccumulation — a chosen mood shows a settled, believable amount', () => {
  it('rain leaves the ground wet, snow lays a blanket, clear is dry', () => {
    expect(presetAccumulation('rain').wetness).toBeGreaterThan(0.5);
    expect(presetAccumulation('rain').snowDepth).toBe(0);
    expect(presetAccumulation('snow').snowDepth).toBeGreaterThan(0.5);
    expect(presetAccumulation('clear')).toEqual({ wetness: 0, snowDepth: 0 });
  });
});
