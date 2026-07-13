/**
 * Guided meditation sessions. Each is a breathing-paced session the player
 * follows in the in-app player; completing one relights the hearth. Pure data
 * — the narrated-audio track drops in with the M2 audio pass; for now the
 * player guides with an animated breath pacer + ambient tone.
 */
export interface Meditation {
  id: string;
  title: string;
  sublabel: string;
  /** Total session length. Kept short for this build; tune with real audio. */
  durationSec: number;
  /** Breath cadence, seconds per phase. A zero-length phase is skipped. */
  inhaleSec: number;
  holdSec: number;
  exhaleSec: number;
  holdOutSec: number;
  energy: number;
  timesPerDay: number;
}

export const MEDITATIONS: readonly Meditation[] = [
  {
    id: 'med-morning',
    title: 'Morning Calm',
    sublabel: 'Ease into the day',
    durationSec: 180,
    inhaleSec: 4,
    holdSec: 2,
    exhaleSec: 6,
    holdOutSec: 0,
    energy: 10,
    timesPerDay: 1,
  },
  {
    id: 'med-box',
    title: 'Box Breathing',
    sublabel: 'Steady the mind, anytime',
    durationSec: 120,
    inhaleSec: 4,
    holdSec: 4,
    exhaleSec: 4,
    holdOutSec: 4,
    energy: 8,
    timesPerDay: 2,
  },
  {
    id: 'med-478',
    title: '4·7·8 Wind-down',
    sublabel: 'For the evening',
    durationSec: 180,
    inhaleSec: 4,
    holdSec: 7,
    exhaleSec: 8,
    holdOutSec: 0,
    energy: 12,
    timesPerDay: 1,
  },
  {
    id: 'med-bodyscan',
    title: 'Body Scan',
    sublabel: 'Release the whole day',
    durationSec: 300,
    inhaleSec: 5,
    holdSec: 0,
    exhaleSec: 7,
    holdOutSec: 0,
    energy: 16,
    timesPerDay: 1,
  },
] as const;

export function findMeditation(id: string): Meditation | undefined {
  return MEDITATIONS.find((m) => m.id === id);
}

/** Manual "I meditated for N minutes" logging. Once per day, gently capped. */
export const LOG_MEDITATION = {
  id: 'log-meditation',
  energyPerMinute: 0.5,
  maxEnergy: 15,
  options: [5, 10, 15, 20, 30] as const,
} as const;

export function loggedMinutesToEnergy(minutes: number): number {
  return Math.max(0, Math.min(LOG_MEDITATION.maxEnergy, Math.round(minutes * LOG_MEDITATION.energyPerMinute)));
}
