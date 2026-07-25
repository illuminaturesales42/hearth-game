import { describe, expect, it } from 'vitest';
import { appendSample, deriveAccumulation, LOG_MAX_AGE_MS } from '../src/core/weather-history';
import type { WeatherSample } from '../src/core/weather-history';

const H = 3600000;
const at = (hoursAgoFromT0: number) => hoursAgoFromT0 * H; // t0 = epoch, samples at hour marks

describe('appendSample — a bounded, sorted, de-duped log', () => {
  it('keeps readings in time order', () => {
    let log: WeatherSample[] = [];
    log = appendSample(log, { at: at(2), kind: 'rain', precipMm: 1 });
    log = appendSample(log, { at: at(0), kind: 'clear', precipMm: 0 });
    log = appendSample(log, { at: at(1), kind: 'clouds', precipMm: 0 });
    expect(log.map((s) => s.at)).toEqual([at(0), at(1), at(2)]);
  });

  it('drops samples older than the window relative to the newest', () => {
    let log: WeatherSample[] = [{ at: at(0), kind: 'rain', precipMm: 2 }];
    const now = at(0) + LOG_MAX_AGE_MS + H; // one hour past the window
    log = appendSample(log, { at: now, kind: 'clear', precipMm: 0 }, now);
    expect(log).toHaveLength(1);
    expect(log[0]?.at).toBe(now);
  });

  it('replaces a near-simultaneous reading rather than stacking it', () => {
    let log: WeatherSample[] = [{ at: 1000, kind: 'clear', precipMm: 0 }];
    log = appendSample(log, { at: 1000 + 30_000, kind: 'rain', precipMm: 3 }, 1000 + 30_000);
    expect(log).toHaveLength(1);
    expect(log[0]?.kind).toBe('rain');
  });

  it('does not mutate the input array', () => {
    const log: WeatherSample[] = [{ at: 0, kind: 'clear', precipMm: 0 }];
    appendSample(log, { at: H, kind: 'rain', precipMm: 1 }, H);
    expect(log).toHaveLength(1);
  });
});

describe('deriveAccumulation — wetness rises in rain and dries out', () => {
  it('is dry with an empty log', () => {
    expect(deriveAccumulation([], at(5))).toEqual({ wetness: 0, snowDepth: 0 });
  });

  it('wets the ground after a couple of rainy hours', () => {
    const log: WeatherSample[] = [{ at: at(0), kind: 'rain', precipMm: 2 }];
    const { wetness } = deriveAccumulation(log, at(2));
    expect(wetness).toBeGreaterThan(0.6);
  });

  it('dries back down over the hours after the rain stops', () => {
    const log: WeatherSample[] = [
      { at: at(0), kind: 'rain', precipMm: 3 },
      { at: at(1), kind: 'clear', precipMm: 0 },
    ];
    const justWet = deriveAccumulation(log, at(1)).wetness;
    const laterDry = deriveAccumulation(log, at(7)).wetness; // 6h of clear
    expect(justWet).toBeGreaterThan(0.5);
    expect(laterDry).toBeLessThan(justWet / 2);
  });

  it('a passing shower leaves puddles that linger, not vanish instantly', () => {
    const log: WeatherSample[] = [
      { at: at(0), kind: 'rain', precipMm: 2 },
      { at: at(1), kind: 'clouds', precipMm: 0 },
    ];
    expect(deriveAccumulation(log, at(2)).wetness).toBeGreaterThan(0.2);
  });
});

describe('deriveAccumulation — snow accumulates cold and melts warm', () => {
  it('lays down a blanket over a snowy, sub-zero day', () => {
    const log: WeatherSample[] = [{ at: at(0), kind: 'snow', precipMm: 1, tempC: -2 }];
    const { snowDepth } = deriveAccumulation(log, at(4));
    expect(snowDepth).toBeGreaterThan(0.5);
  });

  it('melts the blanket once it warms well above freezing', () => {
    const log: WeatherSample[] = [
      { at: at(0), kind: 'snow', precipMm: 1, tempC: -2 },
      { at: at(4), kind: 'clear', precipMm: 0, tempC: 6 },
    ];
    const fresh = deriveAccumulation(log, at(4)).snowDepth;
    const thawed = deriveAccumulation(log, at(10)).snowDepth; // 6h at +6°C
    expect(fresh).toBeGreaterThan(0.5);
    expect(thawed).toBeLessThan(fresh);
  });

  it('does not pile snow when it is falling but above freezing (wet snow/sleet)', () => {
    const log: WeatherSample[] = [{ at: at(0), kind: 'snow', precipMm: 1, tempC: 3 }];
    expect(deriveAccumulation(log, at(4)).snowDepth).toBe(0);
  });
});
