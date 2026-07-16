/**
 * Ambient audio stem levels derived from the world's mood — the ear catches
 * what the eye misses. Pure, so it's unit-testable; the WebAudio side lives in
 * ui/feedback.ts. Levels are 0..1 relative — feedback scales them to its own
 * (deliberately quiet) per-stem targets.
 *
 * Pillar guard: a stem only ever ADDS atmosphere. Absence of a habit means the
 * stem simply isn't there — never a sad or harsh cue. Rain stays cosy.
 */
import type { WorldMood } from './world-mood';

export interface StemLevels {
  /** Soft calm pad — the day's stillness after meditation. */
  calmPad: number;
  /** Gentle rain bed, scaled by intensity. */
  rain: number;
  /** Faint distant bustle when a good walk brings villagers out. */
  chatter: number;
}

export function stemLevels(m: WorldMood): StemLevels {
  const rain = m.weather === 'rain' || m.weather === 'storm' ? Math.max(0.35, Math.min(1, m.precip)) : 0;
  return {
    calmPad: m.calm ? 1 : 0,
    rain,
    chatter: Math.max(0, Math.min(1, m.villagersOut)),
  };
}
