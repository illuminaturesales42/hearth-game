/**
 * Per-mood colour-grade parameters for the WebGL compositor (Living Weather
 * spec §3/§5). These are DELTAS over the canvas pipeline's own time-of-day
 * grading — the 2D washes keep owning "what time is it", the compositor owns
 * "what does this weather feel like" — so every value here is deliberately
 * subtle and centred on neutral (1.0 / 0.0).
 *
 * Pure data + math, no DOM: unit-testable, and the compositor lerps between
 * these targets with the damper so mood changes breathe.
 */
import type { WeatherMood } from './weather-mood';

export interface GradeParams {
  /** brightness multiplier, 1 = neutral */
  exposure: number;
  /** saturation multiplier, 1 = neutral */
  saturation: number;
  /** −1 cool … +1 warm channel tilt */
  temp: number;
  /** contrast about mid-grey, 1 = neutral */
  contrast: number;
  /** 0..1 bloom strength (bright windows/lanterns halo) */
  bloom: number;
  /** 0..1 god-ray permission (env gates it further by golden hour × clear sky) */
  rays: number;
  /** 0..1 edge vignette depth */
  vignette: number;
  /** 0..1 film-grain amount */
  grain: number;
}

export const NEUTRAL_GRADE: GradeParams = {
  exposure: 1,
  saturation: 1,
  temp: 0,
  contrast: 1,
  bloom: 0.2,
  rays: 0,
  vignette: 0.12,
  grain: 0.04,
};

/** The feeling matrix, §1.3, translated into glass and light. */
export const MOOD_GRADE: Record<WeatherMood, GradeParams> = {
  'golden-calm': { exposure: 1.04, saturation: 1.08, temp: 0.35, contrast: 1.02, bloom: 0.5, rays: 1, vignette: 0.18, grain: 0.05 },
  'bright-day': { exposure: 1.02, saturation: 1.05, temp: 0.05, contrast: 1.03, bloom: 0.15, rays: 0.2, vignette: 0.1, grain: 0.03 },
  'fresh-morning': { exposure: 1.02, saturation: 1.0, temp: 0.12, contrast: 0.98, bloom: 0.3, rays: 0.5, vignette: 0.12, grain: 0.04 },
  'soft-overcast': { exposure: 0.97, saturation: 0.85, temp: -0.08, contrast: 0.94, bloom: 0.1, rays: 0, vignette: 0.15, grain: 0.05 },
  'cosy-rain': { exposure: 0.95, saturation: 0.9, temp: -0.15, contrast: 0.97, bloom: 0.45, rays: 0, vignette: 0.22, grain: 0.06 },
  'wind-swept': { exposure: 1.0, saturation: 0.98, temp: -0.05, contrast: 1.04, bloom: 0.15, rays: 0.1, vignette: 0.14, grain: 0.05 },
  misty: { exposure: 0.96, saturation: 0.8, temp: -0.05, contrast: 0.88, bloom: 0.35, rays: 0.2, vignette: 0.2, grain: 0.05 },
  'storm-watch': { exposure: 0.88, saturation: 0.82, temp: -0.25, contrast: 1.05, bloom: 0.55, rays: 0, vignette: 0.3, grain: 0.08 },
  frosted: { exposure: 1.02, saturation: 0.95, temp: -0.2, contrast: 1.06, bloom: 0.35, rays: 0.4, vignette: 0.12, grain: 0.04 },
  'snow-glow': { exposure: 1.05, saturation: 0.9, temp: -0.1, contrast: 0.95, bloom: 0.4, rays: 0.1, vignette: 0.12, grain: 0.05 },
  'moonlit-clear': { exposure: 0.96, saturation: 0.9, temp: -0.15, contrast: 1.03, bloom: 0.6, rays: 0, vignette: 0.25, grain: 0.05 },
  'deep-night': { exposure: 0.92, saturation: 0.8, temp: -0.2, contrast: 1.02, bloom: 0.65, rays: 0, vignette: 0.3, grain: 0.06 },
};

/** Environmental gating on top of the mood table: bloom belongs to the dark
 *  half of the day (lit windows), god rays to a clear golden hour. */
export function gradeFor(
  mood: WeatherMood,
  env: { goldenHour: number; nightAmount: number; cloudFlat: number },
): GradeParams {
  const g = MOOD_GRADE[mood];
  const dark = Math.max(env.nightAmount, env.goldenHour * 0.6);
  return {
    ...g,
    bloom: g.bloom * (0.35 + 0.65 * dark),
    rays: g.rays * env.goldenHour * (1 - env.cloudFlat),
  };
}

/** Lerp every channel — the compositor damps current → target with this. */
export function lerpGrade(a: GradeParams, b: GradeParams, t: number): GradeParams {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  const mix = (x: number, y: number) => x + (y - x) * k;
  return {
    exposure: mix(a.exposure, b.exposure),
    saturation: mix(a.saturation, b.saturation),
    temp: mix(a.temp, b.temp),
    contrast: mix(a.contrast, b.contrast),
    bloom: mix(a.bloom, b.bloom),
    rays: mix(a.rays, b.rays),
    vignette: mix(a.vignette, b.vignette),
    grain: mix(a.grain, b.grain),
  };
}
