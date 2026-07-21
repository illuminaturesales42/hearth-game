import { describe, expect, it } from 'vitest';
import { phaseForHour, phaseForTime, type SunTimes } from '../src/core/time-of-day';

const H = 3_600_000;

// A concrete day: sunrise at instant T, sunset 14h later (a long summer day).
const T = 1_750_000_000_000; // arbitrary fixed epoch ms
const sun: SunTimes = { sunriseMs: T, sunsetMs: T + 14 * H };

describe('phaseForTime — real solar time of day', () => {
  it('solar noon is full daylight', () => {
    const { phase, weights } = phaseForTime(T + 7 * H, sun);
    expect(phase).toBe('midday');
    expect(weights.day).toBeGreaterThan(0.95);
    expect(weights.night).toBe(0);
  });

  it('sunrise is dawn, sunset is dusk', () => {
    expect(phaseForTime(T, sun).phase).toBe('sunrise');
    expect(phaseForTime(T + 14 * H, sun).phase).toBe('sunset');
  });

  it('solar midnight is deep night', () => {
    const midnight = T + 14 * H + 5 * H; // 5h into a 10h night = solar midnight
    const { phase, weights } = phaseForTime(midnight, sun);
    expect(phase).toBe('night');
    expect(weights.night).toBeGreaterThan(0.95);
    expect(weights.day).toBe(0);
  });

  it('dusk glow lingers just after sunset before night takes over', () => {
    const { phase, weights } = phaseForTime(T + 14 * H + 0.5 * H, sun);
    expect(phase).toBe('sunset');
    expect(weights.dusk).toBeGreaterThan(weights.night);
  });

  it('crossfades smoothly — no hard band jump across a transition', () => {
    // Through the morning golden hour, day rises and dawn falls monotonically.
    const dawn0 = phaseForTime(T + 0.25 * H, sun).weights;
    const dawn1 = phaseForTime(T + 1 * H, sun).weights;
    expect(dawn1.day).toBeGreaterThan(dawn0.day); // getting brighter
    expect(dawn1.dawn).toBeLessThan(dawn0.dawn); // dawn wash receding
  });

  it('night falls at the real sunset, not a fixed clock hour', () => {
    // A far-northern winter day: sunset at ~15:30 local. At 16:00 it is night,
    // which a fixed "night = hour>=21" band would get wrong.
    const winter: SunTimes = { sunriseMs: T + 9 * H, sunsetMs: T + 15.5 * H };
    const { phase } = phaseForTime(T + 18 * H, winter); // ~2.5h after sunset
    expect(phase).toBe('night');
  });

  it('falls back to fixed clock bands when sun times are unknown', () => {
    const noon = new Date(2026, 0, 1, 13, 0, 0).getTime(); // local 13:00
    const midnight = new Date(2026, 0, 1, 2, 0, 0).getTime(); // local 02:00
    expect(phaseForTime(noon, null).phase).toBe('midday');
    expect(phaseForTime(midnight, null).phase).toBe('night');
    // fallback weights are one-hot (no blend without a solar model)
    expect(phaseForTime(noon, null).weights).toEqual({ dawn: 0, day: 1, dusk: 0, night: 0 });
  });

  it('rejects a malformed sun window (sunset not after sunrise) and falls back', () => {
    const bad: SunTimes = { sunriseMs: T + 10 * H, sunsetMs: T };
    const noon = new Date(2026, 0, 1, 13, 0, 0).getTime();
    expect(phaseForTime(noon, bad).phase).toBe('midday'); // used clock fallback
  });
});

describe('phaseForHour — legacy fallback bands', () => {
  it('maps hours to the four phases', () => {
    expect(phaseForHour(7).phase).toBe('sunrise');
    expect(phaseForHour(13).phase).toBe('midday');
    expect(phaseForHour(19).phase).toBe('sunset');
    expect(phaseForHour(23).phase).toBe('night');
    expect(phaseForHour(3).phase).toBe('night');
  });
});
