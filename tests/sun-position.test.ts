import { describe, expect, it } from 'vitest';
import { sunPosition, sunTimes } from '../src/core/sun';

const rad = Math.PI / 180;
const LONDON = { lat: 51.5, lng: -0.12 };
// A fixed summer's day (no Date.now — deterministic).
const JUN_21 = Date.UTC(2026, 5, 21, 0, 0, 0);

describe('sunPosition — the real sun in the sky', () => {
  it('sits on the horizon (~0 altitude) at the computed sunrise and sunset', () => {
    const { sunrise, sunset } = sunTimes(JUN_21, LONDON);
    expect(sunPosition(sunrise, LONDON).altitude).toBeCloseTo(0, 1);
    expect(sunPosition(sunset, LONDON).altitude).toBeCloseTo(0, 1);
  });

  it('is highest at solar noon, and there faces due south from the north', () => {
    const { sunrise, sunset } = sunTimes(JUN_21, LONDON);
    const noon = (sunrise + sunset) / 2;
    const at = sunPosition(noon, LONDON);
    // London midsummer noon sun is high (~62°) and roughly due south (azimuth ~0).
    expect(at.altitude).toBeGreaterThan(55 * rad);
    expect(Math.abs(at.azimuth)).toBeLessThan(5 * rad);
    // And higher than mid-morning.
    const mid = sunPosition((sunrise + noon) / 2, LONDON);
    expect(at.altitude).toBeGreaterThan(mid.altitude);
  });

  it('rises in the east and sets in the west (azimuth crosses south through noon)', () => {
    const { sunrise, sunset } = sunTimes(JUN_21, LONDON);
    const noon = (sunrise + sunset) / 2;
    // SunCalc azimuth: negative = east side (morning), positive = west (evening).
    expect(sunPosition(sunrise + 30 * 60_000, LONDON).azimuth).toBeLessThan(0);
    expect(sunPosition(sunset - 30 * 60_000, LONDON).azimuth).toBeGreaterThan(0);
    expect(sunPosition(noon, LONDON).azimuth).toBeCloseTo(0, 1);
  });
});
