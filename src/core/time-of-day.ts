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

const PHASES: Record<TimeOfDay, TimePhase> = {
  sunrise: { phase: 'sunrise', art: 'time_badge_sunrise', label: 'Sunrise' },
  midday: { phase: 'midday', art: 'time_badge_midday', label: 'Midday' },
  sunset: { phase: 'sunset', art: 'time_badge_sunset', label: 'Sunset' },
  night: { phase: 'night', art: 'time_badge_night', label: 'Night' },
};

/**
 * The phase for a given hour (0..23). Thresholds match the Home map's sky bands
 * in map-view (morning 5–11, midday 11–17, dusk 17–21, else night), so the
 * badge and the scene's lighting change together.
 */
export function phaseForHour(hour: number): TimePhase {
  if (hour >= 5 && hour < 11) return PHASES.sunrise;
  if (hour >= 11 && hour < 17) return PHASES.midday;
  if (hour >= 17 && hour < 21) return PHASES.sunset;
  return PHASES.night;
}
