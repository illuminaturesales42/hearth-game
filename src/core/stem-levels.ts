/**
 * Ambient audio stem levels derived from the world's mood + the real time of
 * day — the ear catches what the eye misses. Pure, so it's unit-testable; the
 * WebAudio side lives in ui/feedback.ts. Levels are 0..1 relative — feedback
 * scales them to its own (deliberately quiet) per-stem targets.
 *
 * Pillar guard: a stem only ever ADDS atmosphere. Absence of a habit means the
 * stem simply isn't there — never a sad or harsh cue. Rain stays cosy.
 */
import type { WorldMood } from './world-mood';
import type { PhaseWeights } from './time-of-day';

export interface StemLevels {
  /** Soft calm pad — the day's stillness after meditation. */
  calmPad: number;
  /** Gentle rain bed, scaled continuously by real intensity. */
  rain: number;
  /** Faint distant bustle when a good walk brings villagers out. */
  chatter: number;
  /** Airy wind, rising with the real wind speed. */
  wind: number;
  /** Coastal surf, rising with the sea's choppiness. */
  surf: number;
  /** Dawn chorus — soft birdsong around the real sunrise. */
  birds: number;
  /** Night crickets — a quiet bed once it's really dark. */
  crickets: number;
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/**
 * @param m the world mood (weather + the player's day)
 * @param phase real solar phase weights (dawn/night drive birds/crickets); when
 *              absent (no location yet) those stems simply stay silent.
 */
export function stemLevels(m: WorldMood, phase?: PhaseWeights | null): StemLevels {
  const wet = m.weather === 'rain' || m.weather === 'storm';
  // True continuous rain — no artificial floor. A drizzle is a whisper, a
  // downpour fills the bed; a storm adds a touch more body under the thunder.
  const rain = wet ? clamp01(m.precip + (m.weather === 'storm' ? 0.15 : 0)) : 0;
  const dawn = phase?.dawn ?? 0;
  const night = phase?.night ?? 0;
  // Birds and crickets hush under heavy weather (they don't sing in a downpour).
  const fair = clamp01(1 - m.precip);
  return {
    calmPad: m.calm ? 1 : 0,
    rain,
    chatter: clamp01(m.villagersOut),
    wind: clamp01(m.wind),
    surf: clamp01(m.sea),
    birds: clamp01(dawn * fair),
    crickets: clamp01(night * fair),
  };
}
