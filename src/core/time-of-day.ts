/**
 * The day's four phases, keyed off the real clock. This is the single source of
 * truth for "what time of day is it" — the Home map's sky/lighting (map-view)
 * and the corner time badge (ui/time-badge) both read it, so the little badge
 * and the whole scene always agree.
 */
export type TimeOfDay = 'sunrise' | 'midday' | 'sunset' | 'night';

export interface TimePhase {
  phase: TimeOfDay;
  /** Sliced badge art id (public/art/time_badge_<phase>.png). */
  art: string;
  /** Warm label under the badge. */
  label: string;
}

/** Badge art + label for each phase (shared by the time badge). */
export const PHASE_META: Record<TimeOfDay, TimePhase> = {
  sunrise: { phase: 'sunrise', art: 'time_badge_sunrise', label: 'Sunrise' },
  midday: { phase: 'midday', art: 'time_badge_midday', label: 'Midday' },
  sunset: { phase: 'sunset', art: 'time_badge_sunset', label: 'Sunset' },
  night: { phase: 'night', art: 'time_badge_night', label: 'Night' },
};
const PHASES = PHASE_META;

/**
 * The phase for a given hour (0..23). Fallback thresholds used only when we
 * don't yet know the player's real sun times (morning 5–11, midday 11–17, dusk
 * 17–21, else night).
 */
export function phaseForHour(hour: number): TimePhase {
  if (hour >= 5 && hour < 11) return PHASES.sunrise;
  if (hour >= 11 && hour < 17) return PHASES.midday;
  if (hour >= 17 && hour < 21) return PHASES.sunset;
  return PHASES.night;
}

/** The player's local sunrise/sunset as real instants (epoch ms), for today. */
export interface SunTimes {
  sunriseMs: number;
  sunsetMs: number;
}

/**
 * Blend weights for the four lighting washes. They deliberately OVERLAP near
 * transitions (e.g. at first light both `night` and `dawn` are non-zero) so the
 * scene crossfades smoothly instead of snapping between bands.
 */
export interface PhaseWeights {
  dawn: number;
  day: number;
  dusk: number;
  night: number;
}

const DAY_MS = 86_400_000;
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

function oneHot(p: TimeOfDay): PhaseWeights {
  return {
    dawn: p === 'sunrise' ? 1 : 0,
    day: p === 'midday' ? 1 : 0,
    dusk: p === 'sunset' ? 1 : 0,
    night: p === 'night' ? 1 : 0,
  };
}

function dominant(w: PhaseWeights): TimeOfDay {
  const max = Math.max(w.dawn, w.day, w.dusk, w.night);
  if (max === w.night) return 'night';
  if (max === w.day) return 'midday';
  if (max === w.dusk) return 'sunset';
  return 'sunrise';
}

/**
 * Continuous time-of-day from the player's REAL local sun times. Models a
 * sun-altitude proxy `alt` in [-1, 1] — 0 at sunrise/sunset, +1 at solar noon,
 * -1 at solar midnight — and turns it into crossfading wash weights plus a
 * discrete phase for the badge. So real dusk glow arrives at the player's true
 * sunset and real night falls when it's actually dark where they are.
 *
 * Falls back to the fixed clock bands when sun times are unknown (no location).
 */
export function phaseForTime(nowMs: number, sun: SunTimes | null): { phase: TimeOfDay; weights: PhaseWeights } {
  // A (yesterday's-sunset, today's-sunrise) pair arrives inverted — that's still
  // a meaningful "we are inside this night" signal, so model it rather than
  // falling back to clock bands.
  const wrappedNight = sun && sun.sunsetMs < sun.sunriseMs && nowMs >= sun.sunsetMs && nowMs <= sun.sunriseMs;
  if (!sun || (!wrappedNight && !(sun.sunsetMs > sun.sunriseMs))) {
    const phase = phaseForHour(new Date(nowMs).getHours()).phase;
    return { phase, weights: oneHot(phase) };
  }
  const { sunriseMs, sunsetMs } = sun;
  let alt: number;
  let rising: boolean;
  if (wrappedNight) {
    const v = clamp01((nowMs - sunsetMs) / (sunriseMs - sunsetMs)); // 0..1 across this night
    alt = -Math.sin(Math.PI * v);
    rising = v > 0.5;
  } else if (nowMs >= sunriseMs && nowMs <= sunsetMs) {
    const u = (nowMs - sunriseMs) / (sunsetMs - sunriseMs); // 0..1 across daytime
    alt = Math.sin(Math.PI * u);
    rising = u < 0.5;
  } else {
    const nightLen = DAY_MS - (sunsetMs - sunriseMs);
    const since = nowMs > sunsetMs ? nowMs - sunsetMs : nowMs + DAY_MS - sunsetMs; // since sunset (wraps)
    const v = clamp01(since / nightLen);
    alt = -Math.sin(Math.PI * v);
    rising = v > 0.5; // past solar midnight, climbing toward dawn
  }
  const day = clamp01(alt);
  const night = clamp01(-alt);
  const low = clamp01(1 - Math.abs(alt) / 0.4); // golden band: strongest at the horizon
  const dawn = rising ? low : 0;
  const dusk = rising ? 0 : low;
  const weights: PhaseWeights = { dawn, day, dusk, night };
  return { phase: dominant(weights), weights };
}
