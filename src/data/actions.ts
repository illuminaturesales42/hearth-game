/**
 * The catalogue of ways a player relights their hearth from their real day.
 * Remote-config shaped (pure data). "featured" actions show in TODAY'S ENERGY;
 * the rest live under "More ways to earn energy".
 *
 * Energy is only ever earned here — never bought. That rule is the product.
 */
import type { EnergyAction } from '../core/types';

export const DAILY_GAUGE = 100; // display target for the energy ring; energy may exceed it

export const ACTIONS: readonly EnergyAction[] = [
  // ---- sensor (auto from HealthKit / Health Connect) ----
  {
    id: 'steps', label: '10,000 steps', sublabel: 'Counted while you walk · +5 past 12k',
    icon: '👟', energy: 20, timesPerDay: 1, kind: 'sensor', featured: true, sensor: 'steps',
  },
  {
    id: 'stairs', label: '10 flights of stairs', sublabel: 'Every climb counts',
    icon: '🪜', energy: 10, timesPerDay: 1, kind: 'sensor', featured: true, sensor: 'stairs',
  },
  {
    id: 'sleep', label: 'A full 8 hours of sleep', sublabel: '7h earns +10 · a full 8h earns +20',
    icon: '😴', energy: 20, timesPerDay: 1, kind: 'sensor', featured: true, sensor: 'sleep',
  },

  // ---- self-report (honour system, small caps) ----
  {
    id: 'water', label: 'Drink water (1.5L)', sublabel: 'A glass at a time',
    icon: '💧', energy: 10, timesPerDay: 1, kind: 'selfReport', featured: true,
  },

  // ---- photo (camera) ----
  {
    id: 'photo-outside', label: 'Take a photo outside', sublabel: 'Step out, capture the day',
    icon: '📷', energy: 10, timesPerDay: 1, kind: 'photo', featured: true,
    photoPrompt: 'Point at anything outdoors', photoWindow: 'day',
  },

  // ---- motion ----
  {
    id: 'squats', label: '15 squats', sublabel: 'Wake the legs up',
    icon: '🏋️', energy: 10, timesPerDay: 1, kind: 'motion', featured: true,
    motionReps: 15, motionVerb: 'Squat',
  },

  // ---- "More ways to earn energy" ----
  {
    id: 'sunrise-photo', label: 'Photograph the sunrise', sublabel: 'Only at first light',
    icon: '🌅', energy: 15, timesPerDay: 1, kind: 'photo', featured: false,
    photoPrompt: 'Catch the sunrise', photoWindow: 'sunrise',
  },
  {
    id: 'sunset-photo', label: 'Photograph the sunset', sublabel: 'Only as the light goes',
    icon: '🌇', energy: 15, timesPerDay: 1, kind: 'photo', featured: false,
    photoPrompt: 'Catch the sunset', photoWindow: 'sunset',
  },
  {
    id: 'nature-photo', label: 'Find something green', sublabel: 'A tree, a plant, the sea',
    icon: '🌿', energy: 10, timesPerDay: 1, kind: 'photo', featured: false,
    photoPrompt: 'Point at something living', photoWindow: 'day',
  },
  {
    id: 'stretch', label: 'Morning stretch', sublabel: 'Reach for the ceiling',
    icon: '🧘', energy: 8, timesPerDay: 1, kind: 'motion', featured: false,
    motionReps: 5, motionVerb: 'Stretch',
  },
  {
    id: 'breathe', label: 'Four slow breaths', sublabel: 'In for four, out for four',
    icon: '🌬️', energy: 6, timesPerDay: 2, kind: 'motion', featured: false,
    motionReps: 4, motionVerb: 'Breathe',
  },
  {
    id: 'gratitude', label: 'Note one good thing', sublabel: 'Kept in your Journal',
    icon: '📖', energy: 5, timesPerDay: 1, kind: 'selfReport', featured: false,
  },
] as const;

export function featuredActions(): EnergyAction[] {
  return ACTIONS.filter((a) => a.featured);
}
export function moreActions(): EnergyAction[] {
  return ACTIONS.filter((a) => !a.featured);
}
