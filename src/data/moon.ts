/**
 * Moon phase from the calendar/date, and the Stargaze action's rewards. Used to
 * make "stare at the moon" feel tied to the real sky — a full moon is worth more.
 */
const SYNODIC = 29.530588853; // days in a lunar cycle
const NEW_MOON_EPOCH = Date.UTC(2000, 0, 6, 18, 14); // a known new moon

export const STARGAZE = {
  id: 'stargaze',
  baseEnergy: 12,
  fullMoonBonus: 6,
} as const;

/** Days since the last new moon, 0..SYNODIC. */
export function moonAge(now: number): number {
  const days = (now - NEW_MOON_EPOCH) / 86_400_000;
  return ((days % SYNODIC) + SYNODIC) % SYNODIC;
}

/** Illuminated fraction, 0 (new) .. 1 (full). */
export function illumination(now: number): number {
  return (1 - Math.cos((2 * Math.PI * moonAge(now)) / SYNODIC)) / 2;
}

export function phaseName(now: number): string {
  const a = moonAge(now);
  if (a < 1.85) return 'New Moon';
  if (a < 5.5) return 'Waxing Crescent';
  if (a < 9.2) return 'First Quarter';
  if (a < 12.9) return 'Waxing Gibbous';
  if (a < 16.6) return 'Full Moon';
  if (a < 20.3) return 'Waning Gibbous';
  if (a < 24.0) return 'Last Quarter';
  if (a < 27.7) return 'Waning Crescent';
  return 'New Moon';
}

/** Whether the moon is currently waxing (growing). */
export function isWaxing(now: number): boolean {
  return moonAge(now) < SYNODIC / 2;
}

/** Bonus energy near a full moon: 0, scaling up to fullMoonBonus at 100% lit. */
export function fullMoonBonus(now: number): number {
  const ill = illumination(now);
  return ill > 0.85 ? Math.round(((ill - 0.85) / 0.15) * STARGAZE.fullMoonBonus) : 0;
}
