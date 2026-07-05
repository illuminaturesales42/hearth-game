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
  // Labels are framed as helping Emberhollow (per the visual-identity direction);
  // sublabels keep the literal real-world action clear.
  {
    id: 'steps', label: 'Walk the Coast Road', sublabel: '10,000 steps, counted as you walk · +5 past 12k',
    icon: '👟', energy: 20, timesPerDay: 1, kind: 'sensor', featured: true, sensor: 'steps',
  },
  {
    id: 'stairs', label: 'Climb the Cliff Steps', sublabel: 'Flights of stairs climbed',
    icon: '🪜', energy: 10, timesPerDay: 1, kind: 'sensor', featured: true, sensor: 'stairs',
  },
  {
    id: 'sleep', label: 'Rest by the Fire', sublabel: 'A full 8 hours of sleep · 7h earns +10',
    icon: '😴', energy: 20, timesPerDay: 1, kind: 'sensor', featured: true, sensor: 'sleep',
  },

  // ---- self-report (honour system, small caps) ----
  {
    id: 'water', label: 'Fill the Well', sublabel: 'Drink water through the day (1.5L)',
    icon: '💧', energy: 10, timesPerDay: 1, kind: 'selfReport', featured: true,
  },

  // ---- photo (camera) ----
  {
    id: 'photo-outside', label: 'Find Beauty', sublabel: 'Take a photo outdoors',
    icon: '📷', energy: 10, timesPerDay: 1, kind: 'photo', featured: true,
    photoPrompt: 'Point at anything outdoors', photoWindow: 'day',
  },

  // ---- motion ----
  {
    id: 'squats', label: 'Turn the Millstone', sublabel: '15 squats',
    icon: '🏋️', energy: 10, timesPerDay: 1, kind: 'motion', featured: true,
    motionReps: 15, motionVerb: 'Squat',
  },

  // ---- "More ways to earn energy" ----
  {
    id: 'sunrise-photo', label: 'Welcome the Morning', sublabel: 'Photograph the sunrise · only at first light',
    icon: '🌅', energy: 15, timesPerDay: 1, kind: 'photo', featured: false,
    photoPrompt: 'Catch the sunrise', photoWindow: 'sunrise',
  },
  {
    id: 'sunset-photo', label: 'Bid the Sun Goodnight', sublabel: 'Photograph the sunset · only as the light goes',
    icon: '🌇', energy: 15, timesPerDay: 1, kind: 'photo', featured: false,
    photoPrompt: 'Catch the sunset', photoWindow: 'sunset',
  },
  {
    id: 'nature-photo', label: 'Seek the Wild', sublabel: 'Find something green — a tree, a plant, the sea',
    icon: '🌿', energy: 10, timesPerDay: 1, kind: 'photo', featured: false,
    photoPrompt: 'Point at something living', photoWindow: 'day',
  },
  {
    id: 'stretch', label: 'Wake the Garden', sublabel: 'A morning stretch',
    icon: '🧘', energy: 8, timesPerDay: 1, kind: 'motion', featured: false,
    motionReps: 5, motionVerb: 'Stretch',
  },
  {
    id: 'breathe', label: 'Catch the Sea Breeze', sublabel: 'Four slow breaths, in for four out for four',
    icon: '🌬️', energy: 6, timesPerDay: 2, kind: 'motion', featured: false,
    motionReps: 4, motionVerb: 'Breathe',
  },
  // Note: "write one good thing" now lives in the Journal's Good Days tab with a
  // streak multiplier + flashbacks, not as a flat self-report action here.
] as const;

export function featuredActions(): EnergyAction[] {
  return ACTIONS.filter((a) => a.featured);
}
export function moreActions(): EnergyAction[] {
  return ACTIONS.filter((a) => !a.featured);
}
