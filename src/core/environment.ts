/**
 * The single environmental truth for the whole game — the "Environment
 * Controller" data model from the design guide. Given the player's real clock,
 * sun times and weather, it derives normalized values (0..1) plus two blended
 * key/ambient colours that every visual system can read: the map lighting, the
 * UI theme (see ui/environment-controller), and — later — audio.
 *
 * Pure + deterministic: `now` is injected, and it composes the existing solar
 * model (phaseForTime, which already honours the hearthSky() override) with the
 * real moon (illumination). No DOM, no Date.now, no side effects.
 */
import { phaseForTime, type PhaseWeights, type SunTimes, type TimeOfDay } from './time-of-day';
import { illumination } from '../data/moon';
import type { WeatherNow } from './world-mood';

export interface WorldEnvironment {
  /** dominant phase label — for the badge aria + debugging */
  phase: TimeOfDay;
  /** the continuous four-way crossfade (from the solar model) */
  weights: PhaseWeights;
  /** 1 − night */
  daylight: number;
  /** how deep into night, 0..1 */
  nightAmount: number;
  /** golden-hour strength (dawn or dusk), 0..1 */
  goldenHour: number;
  /** authored warmth curve, 0..1 (dusk warmest, night coolest) */
  warmth: number;
  /** night × real moon illumination tonight, 0..1 */
  moonAmount: number;
  /** blended key-light hex (#rrggbb) */
  light: string;
  /** blended ambient/shadow hex (#rrggbb) */
  ambient: string;
  /** how much cloud flattens the look, 0..1 */
  cloudFlat: number;
}

interface Stop {
  light: [number, number, number];
  ambient: [number, number, number];
  /** authored warmth for this phase */
  warmth: number;
}

// Per-phase palette anchors (guide §5). Blended by the live phase weights.
const STOPS: Record<keyof PhaseWeights, Stop> = {
  dawn: { light: [255, 210, 170], ambient: [106, 123, 160], warmth: 0.7 },
  day: { light: [255, 244, 214], ambient: [124, 148, 166], warmth: 0.55 },
  dusk: { light: [242, 160, 82], ambient: [115, 90, 114], warmth: 1 },
  // deep twilight sits BETWEEN dusk and night (dusk-leaning ~60/40) — warm ember
  // still in the light, ambient cooling toward navy, but never as dark as night
  evening: { light: [202, 162, 129], ambient: [84, 74, 100], warmth: 0.66 },
  night: { light: [143, 164, 200], ambient: [38, 49, 79], warmth: 0.15 },
};

const NEUTRAL: [number, number, number] = [201, 201, 196]; // overcast grey

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Blend the four phase stops' channel by the (normalized) weights. */
function blendChannel(weights: PhaseWeights, pick: (s: Stop) => number): number {
  const total = weights.dawn + weights.day + weights.dusk + weights.evening + weights.night || 1;
  return (
    (pick(STOPS.dawn) * weights.dawn +
      pick(STOPS.day) * weights.day +
      pick(STOPS.dusk) * weights.dusk +
      pick(STOPS.evening) * weights.evening +
      pick(STOPS.night) * weights.night) /
    total
  );
}

function blendRgb(weights: PhaseWeights, pick: (s: Stop) => [number, number, number]): [number, number, number] {
  return [
    blendChannel(weights, (s) => pick(s)[0]),
    blendChannel(weights, (s) => pick(s)[1]),
    blendChannel(weights, (s) => pick(s)[2]),
  ];
}

function hex(rgb: [number, number, number]): string {
  return (
    '#' +
    rgb
      .map((c) =>
        Math.round(clamp01(c / 255) * 255)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** Linear-interpolate two #rrggbb colours. Exposed for the controller's mixes. */
export function lerpHex(a: string, b: string, t: number): string {
  const pa = parseHex(a);
  const pb = parseHex(b);
  const k = clamp01(t);
  return hex([pa[0] + (pb[0] - pa[0]) * k, pa[1] + (pb[1] - pa[1]) * k, pa[2] + (pb[2] - pa[2]) * k]);
}

function parseHex(s: string): [number, number, number] {
  const h = s.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * The whole environment for `now`. `sun` null → the solar model falls back to
 * clock bands; `weather` null → clear (no flattening).
 */
export function computeEnvironment(now: number, sun: SunTimes | null, weather: WeatherNow | null): WorldEnvironment {
  const { phase, weights } = phaseForTime(now, sun);
  const nightAmount = clamp01(weights.night);
  const cloudFlat = clamp01((weather?.cloudCover ?? 0) * 0.6);

  let light = blendRgb(weights, (s) => s.light);
  const ambient = blendRgb(weights, (s) => s.ambient);
  // Heavy cloud drains the key toward neutral grey (a flat overcast look) and
  // cools the ambient a touch — bounded so the UI never turns dreary/unreadable.
  light = [
    light[0] + (NEUTRAL[0] - light[0]) * cloudFlat,
    light[1] + (NEUTRAL[1] - light[1]) * cloudFlat,
    light[2] + (NEUTRAL[2] - light[2]) * cloudFlat,
  ];

  return {
    phase,
    weights,
    daylight: clamp01(1 - nightAmount),
    nightAmount,
    goldenHour: clamp01(Math.max(weights.dawn, weights.dusk)),
    warmth: clamp01(blendChannel(weights, (s) => s.warmth)),
    moonAmount: clamp01(nightAmount * illumination(now)),
    light: hex(light),
    ambient: hex(ambient),
    cloudFlat,
  };
}
