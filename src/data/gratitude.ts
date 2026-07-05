/**
 * Gratitude journal: write one good thing about your day for energy. Entries
 * are kept, and later resurface as "flashbacks" for a warm boost — the game
 * reminding you of a good day you'd half-forgotten.
 */
import type { GratitudeState } from '../core/types';
import { localDayKey } from '../core/energy';

export const GRATITUDE = {
  id: 'gratitude-journal',
  baseEnergy: 6,
  flashbackBoost: 5,
  flashbackMinDays: 3,
  maxLen: 280,
} as const;

const DAY = 86_400_000;

/** Seed a couple of past entries so a flashback is available to feel straight away. */
export function initialGratitude(now: number): GratitudeState {
  return {
    entries: [
      {
        id: 'seed-1',
        day: localDayKey(now - 5 * DAY),
        text: 'The sea was calm and the light on the water looked like it was breathing.',
        createdAt: now - 5 * DAY,
      },
      {
        id: 'seed-2',
        day: localDayKey(now - 12 * DAY),
        text: 'Shared warm bread with a neighbour and we laughed about nothing for an hour.',
        createdAt: now - 12 * DAY,
      },
    ],
    lastFlashbackDay: null,
  };
}
