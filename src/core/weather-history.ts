/**
 * Weather's *memory* — the piece that makes the mirror feel really real. A
 * single reading can only ever say "it's raining now"; accumulation says "it
 * rained here earlier" (puddles still drying) and "it's been snowing all day"
 * (a blanket that deepens, then melts when the sun warms). We keep a short,
 * day-spanning log of readings and fold it forward into two derived depths.
 *
 * Pure + deterministic (no Date.now / Math.random): every function takes `now`
 * explicitly, so accumulation is unit-testable from fixed fixtures. The UI owns
 * persistence (localStorage) and clock; this module owns the physics.
 */
import type { WeatherKind } from './world-mood';

export interface WeatherSample {
  /** epoch ms of the reading */
  at: number;
  kind: WeatherKind;
  /** mm/h falling at the reading */
  precipMm: number;
  /** °C, when known — drives snow accumulation vs. melt */
  tempC?: number;
}

export interface Accumulation {
  /** 0..1 wet ground — rises in rain, dries over a few hours */
  wetness: number;
  /** 0..1 lying snow — builds through a snowy spell, melts when it warms */
  snowDepth: number;
}

/** How far back the log reaches — long enough to hold a full day's snow. */
export const LOG_MAX_AGE_MS = 36 * 60 * 60 * 1000;
const MAX_SAMPLES = 240;
/** Two readings closer than this are the same fetch — keep the newer. */
const DEDUP_MS = 60 * 1000;

/**
 * Append a reading to the log: drops samples older than the window, de-dupes
 * near-simultaneous readings, keeps it sorted and bounded. Pure — returns a new
 * array, never mutates the input.
 */
export function appendSample(log: readonly WeatherSample[], s: WeatherSample, now: number = s.at): WeatherSample[] {
  const out = log.filter((e) => now - e.at <= LOG_MAX_AGE_MS && Math.abs(e.at - s.at) > DEDUP_MS);
  out.push(s);
  out.sort((a, b) => a.at - b.at);
  return out.length > MAX_SAMPLES ? out.slice(out.length - MAX_SAMPLES) : out;
}

const isWet = (k: WeatherKind) => k === 'rain' || k === 'storm';

/**
 * Fold the log forward to `now` into wetness + snow depth. Each reading's
 * condition is taken to hold until the next reading (or until `now` for the
 * last one), so we integrate real durations rather than counting samples —
 * a gappy log and a dense one over the same spell give the same result.
 */
export function deriveAccumulation(log: readonly WeatherSample[], now: number): Accumulation {
  const ordered = log.filter((s) => s.at <= now).sort((a, b) => a.at - b.at);
  let wet = 0;
  let snow = 0;
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    if (!s) continue;
    const next = ordered[i + 1];
    const end = next ? Math.min(next.at, now) : now;
    const hours = Math.max(0, (end - s.at) / 3600000);
    if (hours <= 0) continue;
    const intensity = clamp01(s.precipMm / 2); // ~2mm/h reads as "steady"
    const cold = s.tempC === undefined ? s.kind === 'snow' : s.tempC <= 1;

    if (s.kind === 'snow' && cold) {
      // A snowy hour lays snow down; the ground beneath it stays frozen (not wet).
      snow += 0.55 * hours * (0.35 + intensity);
    } else if (isWet(s.kind)) {
      // Rain wets the ground toward saturation; a downpour gets there faster.
      wet = 1 - (1 - wet) * Math.exp(-2.5 * hours * (0.3 + intensity));
      // Rain on lying snow eats into it.
      if (snow > 0) snow -= 0.25 * hours;
    } else {
      // Dry(ish) spell: puddles fade (half-life ~3h), fog/overcast hold moisture
      // a little longer, sun and warmth clear it faster.
      const dryK = s.kind === 'fog' || s.kind === 'overcast' ? 0.16 : s.kind === 'clear' ? 0.3 : 0.23;
      wet *= Math.exp(-dryK * hours);
    }

    // Melt: above freezing, snow gives way and briefly wets the ground.
    if (snow > 0 && s.tempC !== undefined && s.tempC > 1 && s.kind !== 'snow') {
      const melt = Math.min(snow, 0.14 * hours * Math.min(6, s.tempC - 1));
      snow -= melt;
      wet = Math.min(1, wet + melt * 0.5);
    }
    snow = clamp01(snow);
    wet = clamp01(wet);
  }
  return { wetness: round3(wet), snowDepth: round3(snow) };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
function round3(v: number): number {
  return Math.round(v * 1000) / 1000;
}
