/**
 * WeatherMood — the art-directed layer between raw weather data and rendering
 * (Living Weather spec §1). Raw readings answer "what is falling"; a mood
 * answers "what should this moment FEEL like". Two rainy evenings with
 * different wind and temperature are two different feelings, and every visual
 * and audio system downstream keys off the mood, so they always agree.
 *
 * Pure + deterministic: no Date.now, no DOM. Resolution is a priority ladder
 * (drama beats texture beats calm), then night variants override day variants.
 * A hysteresis helper stops boundary conditions flickering between moods.
 */
import type { WeatherNow } from './world-mood';
import type { PhaseWeights } from './time-of-day';

export type WeatherMood =
  | 'golden-calm' //   clear low sun — nostalgic warmth
  | 'bright-day' //    clear/partly midday — hopeful energy
  | 'fresh-morning' // clear-ish dawn — renewal
  | 'soft-overcast' // full cloud, dry — gentle calm
  | 'cosy-rain' //     rain, low drama — sheltered cosiness
  | 'wind-swept' //    strong dry wind — adventurous
  | 'misty' //         fog — mystery, quiet
  | 'storm-watch' //   heavy rain + gusts — safe drama
  | 'frosted' //       clear + freezing — crisp stillness
  | 'snow-glow' //     snowing / lying snow — wonder
  | 'moonlit-clear' // clear night, moon up — peaceful reflection
  | 'deep-night'; //   overcast/new-moon night — sleepy safety

export const WEATHER_MOODS: readonly WeatherMood[] = [
  'golden-calm',
  'bright-day',
  'fresh-morning',
  'soft-overcast',
  'cosy-rain',
  'wind-swept',
  'misty',
  'storm-watch',
  'frosted',
  'snow-glow',
  'moonlit-clear',
  'deep-night',
];

/** Everything the resolver reads. All derivable from the environment pass. */
export interface MoodSignals {
  weather: WeatherNow | null;
  weights: PhaseWeights;
  /** night × real moon illumination, 0..1 (from the environment) */
  moonAmount: number;
  /** 0..1 lying snow (weather memory) */
  snowDepth: number;
  /** 0..1 cold bite near/below freezing */
  frost: number;
}

/**
 * Visual-inspection override (the `hearthEnv()` console helper): forces the
 * resolved mood for every consumer. Session-only; a reload returns to real.
 */
let moodOverride: WeatherMood | null = null;

export function setMoodOverride(m: WeatherMood | null): void {
  moodOverride = m;
}

export function getMoodOverride(): WeatherMood | null {
  return moodOverride;
}

/**
 * The priority ladder. Order matters: drama (storm) beats precipitation kind
 * (snow/rain) beats obscurity (fog) beats wind beats temperature (frost) beats
 * cloud, and only then do the clear-sky time-of-day moods apply.
 */
export function resolveMood(s: MoodSignals): WeatherMood {
  if (moodOverride) return moodOverride;
  const w = s.weather;
  const kind = w?.kind ?? 'clear';
  const wind = w?.windKph ?? 0;
  const precip = w?.precipMm ?? 0;
  const cloud = w?.cloudCover ?? 0.2;
  const night = s.weights.night >= 0.5;

  // Drama first.
  if (kind === 'storm' || (kind === 'rain' && precip >= 2.5 && wind >= 25)) return 'storm-watch';
  // Snow falling, or a settled blanket, reads as snow even under clear skies.
  if (kind === 'snow' || s.snowDepth >= 0.4) return 'snow-glow';
  if (kind === 'fog') return 'misty';
  if (kind === 'rain') return 'cosy-rain';
  // Strong dry wind is its own state; below that it only modifies others.
  if (wind >= 28) return 'wind-swept';
  // Freezing clear air — day sparkle or crisp night.
  if (s.frost >= 0.5 && (kind === 'clear' || kind === 'clouds')) return 'frosted';
  if (night) {
    return cloud < 0.45 && s.moonAmount > 0.25 ? 'moonlit-clear' : 'deep-night';
  }
  if (kind === 'overcast' || cloud >= 0.8) return 'soft-overcast';
  // Clear-ish daylight: golden band at the horizons, bright in between.
  if (s.weights.dawn >= 0.4) return 'fresh-morning';
  if (s.weights.dusk + s.weights.evening >= 0.4) return 'golden-calm';
  return 'bright-day';
}

/**
 * Hysteresis: a candidate mood must hold for `holdFor` consecutive resolutions
 * (default 2 — i.e. two weather refreshes) before the public mood switches, so
 * readings that hover on a boundary don't strobe the whole presentation.
 * Deliberately a tiny class (not module state) so tests and multiple consumers
 * can hold their own.
 */
export class MoodHysteresis {
  private current: WeatherMood | null = null;
  private candidate: WeatherMood | null = null;
  private streak = 0;

  constructor(private readonly holdFor: number = 2) {}

  next(resolved: WeatherMood): WeatherMood {
    if (this.current === null) {
      this.current = resolved; // first reading adopts immediately
      return this.current;
    }
    if (resolved === this.current) {
      this.candidate = null;
      this.streak = 0;
      return this.current;
    }
    if (resolved === this.candidate) {
      this.streak += 1;
    } else {
      this.candidate = resolved;
      this.streak = 1;
    }
    if (this.streak >= this.holdFor) {
      this.current = resolved;
      this.candidate = null;
      this.streak = 0;
    }
    return this.current;
  }

  /** Force-adopt (scrubber / mode change) — no waiting. */
  snap(m: WeatherMood): void {
    this.current = m;
    this.candidate = null;
    this.streak = 0;
  }

  value(): WeatherMood | null {
    return this.current;
  }
}

/**
 * The HUD caption in Hearth's voice — never data-speak. One line per mood;
 * the medallion tooltip and share card read these.
 */
export const MOOD_CAPTION: Record<WeatherMood, string> = {
  'golden-calm': 'Golden light settles over the harbour',
  'bright-day': 'A bright, wide-awake day',
  'fresh-morning': 'The morning is new and the dew is bright',
  'soft-overcast': 'Soft grey skies, the village at ease',
  'cosy-rain': 'Rain on the rooftops, warmth in the windows',
  'wind-swept': 'A big wind is combing the island',
  misty: 'Mist has come in off the sea',
  'storm-watch': 'A storm is watching the harbour',
  frosted: 'Frost-bright air, sharp and still',
  'snow-glow': 'Snow-light softens everything',
  'moonlit-clear': 'The moon has the bay to itself',
  'deep-night': 'Deep night; the embers keep watch',
};

/** The one feeling each mood is engineered to land (spec §1.3) — the
 *  acceptance test for art/audio, and a debugging aid for the scrubber. */
export const MOOD_FEELING: Record<WeatherMood, string> = {
  'golden-calm': 'nostalgic warmth',
  'bright-day': 'hopeful energy',
  'fresh-morning': 'renewal',
  'soft-overcast': 'gentle calm',
  'cosy-rain': 'sheltered cosiness',
  'wind-swept': 'adventurous',
  misty: 'mystery, quiet',
  'storm-watch': 'safe drama',
  frosted: 'crisp stillness',
  'snow-glow': 'wonder',
  'moonlit-clear': 'peaceful reflection',
  'deep-night': 'sleepy safety',
};
