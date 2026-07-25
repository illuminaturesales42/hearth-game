import { afterEach, describe, expect, it } from 'vitest';
import { computeEnvironment, lerpHex } from '../src/core/environment';
import { setPhaseOverride, type SunTimes } from '../src/core/time-of-day';
import { illumination } from '../src/data/moon';

const H = 3_600_000;
const T = 1_750_000_000_000;
const sun: SunTimes = { sunriseMs: T, sunsetMs: T + 14 * H }; // long summer day

const lum = (hex: string): number => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.299 * r! + 0.587 * g! + 0.114 * b!;
};

describe('computeEnvironment — the world truth', () => {
  afterEach(() => setPhaseOverride(null));

  it('solar noon is full daylight, warm-neutral key, no night', () => {
    const e = computeEnvironment(T + 7 * H, sun, null);
    expect(e.phase).toBe('midday');
    expect(e.nightAmount).toBeCloseTo(0, 2);
    expect(e.daylight).toBeCloseTo(1, 2);
    expect(e.warmth).toBeCloseTo(0.55, 1);
    expect(lum(e.light)).toBeGreaterThan(230); // bright key
  });

  it('deep night is dark, cool, and carries the real moon', () => {
    const midnight = T + 14 * H + (24 * H - 14 * H) / 2; // solar midnight
    const e = computeEnvironment(midnight, sun, null);
    expect(e.phase).toBe('night');
    expect(e.nightAmount).toBeGreaterThan(0.9);
    expect(lum(e.ambient)).toBeLessThan(70); // dark navy ambient
    expect(e.moonAmount).toBeCloseTo(illumination(midnight), 5);
    expect(e.warmth).toBeLessThan(0.25);
  });

  it('crossfades continuously — adjacent minutes never jump', () => {
    const t0 = T + 13.5 * H; // late golden hour
    const a = computeEnvironment(t0, sun, null);
    const b = computeEnvironment(t0 + 60_000, sun, null);
    expect(Math.abs(lum(a.light) - lum(b.light))).toBeLessThan(4);
    expect(Math.abs(a.warmth - b.warmth)).toBeLessThan(0.05);
  });

  it('cloud flattens the key toward grey but stays bounded', () => {
    const noon = T + 7 * H;
    const clear = computeEnvironment(noon, sun, null);
    const heavy = computeEnvironment(noon, sun, {
      kind: 'overcast',
      cloudCover: 1,
      windKph: 10,
      precipMm: 0,
      fetchedAt: noon,
    });
    expect(heavy.cloudFlat).toBeGreaterThan(0.5);
    // key desaturates toward neutral grey — its warmth (r−b) shrinks vs clear
    const warmth = (hex: string) => parseInt(hex.slice(1, 3), 16) - parseInt(hex.slice(5, 7), 16);
    expect(warmth(heavy.light)).toBeLessThan(warmth(clear.light));
    expect(lum(heavy.light)).toBeGreaterThan(150); // never dreary-dark
  });

  it('follows a hearthSky() phase override', () => {
    setPhaseOverride('night');
    const e = computeEnvironment(T + 7 * H, sun, null); // real solar noon, forced night
    expect(e.phase).toBe('night');
    expect(e.nightAmount).toBe(1);
    expect(e.daylight).toBe(0);
  });

  it('falls back to clock bands with no sun times', () => {
    const noonLocal = new Date(2026, 0, 1, 13, 0, 0).getTime();
    expect(computeEnvironment(noonLocal, null, null).phase).toBe('midday');
  });
});

describe('lerpHex', () => {
  it('interpolates endpoints and midpoints', () => {
    expect(lerpHex('#000000', '#ffffff', 0)).toBe('#000000');
    expect(lerpHex('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(lerpHex('#000000', '#ffffff', 0.5)).toBe('#808080');
  });
  it('clamps t out of range', () => {
    expect(lerpHex('#102030', '#405060', -1)).toBe('#102030');
    expect(lerpHex('#102030', '#405060', 2)).toBe('#405060');
  });
});
