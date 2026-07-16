/**
 * The living world's mood: real weather outside the window plus the player's
 * own day decide how Emberhollow looks and how the sea behaves. Pure logic —
 * the map canvas reads a WorldMood each frame; fetching lives in the UI layer.
 *
 * Design rule (Hearth Test): the world *reflects*, it never punishes. A
 * restless sea is scenery and an invitation, not a penalty — nothing is
 * locked, slowed, or taken away by any mood value.
 */

export type WeatherKind = 'clear' | 'clouds' | 'overcast' | 'fog' | 'rain' | 'storm' | 'snow';

export interface WeatherNow {
  kind: WeatherKind;
  /** 0..1 */
  cloudCover: number;
  windKph: number;
  /** mm/h currently falling */
  precipMm: number;
  fetchedAt: number;
}

/** Map a WMO weather code (Open-Meteo `weather_code`) to a render category. */
export function weatherFromWmo(
  code: number,
  cloudCoverPct: number,
  windKph: number,
  precipMm: number,
  fetchedAt: number,
): WeatherNow {
  let kind: WeatherKind = 'clear';
  if (code >= 95) kind = 'storm';
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86) kind = 'snow';
  else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) kind = 'rain';
  else if (code === 45 || code === 48) kind = 'fog';
  else if (code === 3) kind = 'overcast';
  else if (code === 1 || code === 2) kind = 'clouds';
  return {
    kind,
    cloudCover: clamp01(cloudCoverPct / 100),
    windKph: Math.max(0, windKph),
    precipMm: Math.max(0, precipMm),
    fetchedAt,
  };
}

export interface WorldMood {
  weather: WeatherKind;
  /** 0..1 cloud layer density */
  cloudCover: number;
  /** 0..1 rain/snow intensity */
  precip: number;
  /** 0..1 wind — drives smoke drift, gull speed, cloud pace */
  wind: number;
  /** 0..1 sea choppiness — real wind, real weather, and an unquiet mind */
  sea: number;
  /** meditated today: the water settles */
  calm: boolean;
  /** 0..1 restlessness from days without meditation */
  restless: number;
  /** 0..1 warmth of the hearth glow (sleep + meditation) */
  glow: number;
  /**
   * Real-world actions reflected in the town (Vision Bible — "Real-World
   * Actions Affect the World"). Each 0..1 (or flag); the map reads these to
   * add gentle, non-punishing flourishes.
   */
  bloom: number; // nature photo / water → flowers bloom
  gardenLush: number; // water / stretch → gardens greener, vines grow
  wellSparkle: boolean; // drink water → wells sparkle
  villagersOut: number; // walk → more villagers ambling outdoors
  festive: number; // long streak → festival decorations appear
  butterflies: boolean; // a flourishing garden draws butterflies
  seaMist: number; // cold plunge → a cool mist drifts over the water (0..1)
  saunaWarm: boolean; // sauna → warmer chimney smoke curls up
  stargazed: boolean; // stargaze after dark → a constellation lights the bay (night only)
}

/** Whole days between two YYYY-MM-DD local day keys (b - a, ≥0 when b later). */
export function daysBetween(a: string, b: string): number {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  const da = Date.UTC(pa[0] ?? 1970, (pa[1] ?? 1) - 1, pa[2] ?? 1);
  const db = Date.UTC(pb[0] ?? 1970, (pb[1] ?? 1) - 1, pb[2] ?? 1);
  return Math.round((db - da) / 86400000);
}

/** Did any meditation happen today (guided sessions or a logged sit)? */
export function meditatedToday(counts: Record<string, number>): boolean {
  return Object.keys(counts).some((k) => (k.startsWith('med-') || k === 'log-meditation') && (counts[k] ?? 0) > 0);
}

/** Sum how many times any of these action ids fired today. */
function tally(counts: Record<string, number>, ids: readonly string[]): number {
  return ids.reduce((n, id) => n + (counts[id] ?? 0), 0);
}

// Which real-world gestures map to which action ids (see src/data/actions.ts).
const WATER_IDS = ['water'] as const; // Fill the Well
const WALK_IDS = ['steps', 'stairs'] as const; // Walk the Coast Road, Climb the Cliff Steps
const STRETCH_IDS = ['stretch', 'squats'] as const; // Wake the Garden, Turn the Millstone
const NATURE_IDS = ['nature-photo', 'photo-outside', 'sunrise-photo', 'sunset-photo'] as const;
const COLD_IDS = ['log-cold-plunge'] as const; // Brave the Cold Water → sea mist
const SAUNA_IDS = ['log-sauna'] as const; // Sit in the Heat → warm chimney smoke
const STAR_IDS = ['stargaze'] as const; // Stargaze after dark → a constellation

export interface MoodInputs {
  weather: WeatherNow | null;
  meditatedToday: boolean;
  /** last day with any meditation (null = never yet) */
  lastCalmDay: string | null;
  /** today's local day key */
  today: string;
  sleptWell: boolean;
  /** today's action tally (game.snapshot.actions.counts) — drives the reactions */
  counts?: Record<string, number>;
  /** did today's steps arrive from health/steps as well? (walk → busier town) */
  walkedToday?: boolean;
  /** current daily streak length — long streaks bring festival decor */
  streak?: number;
}

export function computeMood(inp: MoodInputs): WorldMood {
  const w = inp.weather;
  const wind = w ? clamp01(w.windKph / 40) : 0.15;
  const precip = w ? clamp01(w.precipMm / 4) : 0;
  const cloudCover = w ? w.cloudCover : 0.2;
  const kind: WeatherKind = w?.kind ?? 'clear';

  // An unquiet mind: never meditated → a slightly lively sea (new players see
  // a normal harbour); skipped days ramp gently; today's sit stills the water.
  let restless: number;
  if (inp.meditatedToday) restless = 0;
  else if (!inp.lastCalmDay) restless = 0.25;
  else restless = clamp01((daysBetween(inp.lastCalmDay, inp.today) - 1) / 4 + 0.25);

  const weatherSea = kind === 'storm' ? 0.35 : kind === 'rain' ? 0.15 : kind === 'snow' ? 0.1 : 0;
  const sea = clamp(0.05, 1, 0.18 + wind * 0.45 + weatherSea + restless * 0.3 - (inp.meditatedToday ? 0.22 : 0));

  const glow = clamp01(0.25 + (inp.sleptWell ? 0.4 : 0) + (inp.meditatedToday ? 0.3 : 0));

  // Real-world actions reflected in the town. Every reaction is additive and
  // gentle — the world only ever brightens; skipping a day removes a flourish,
  // it never darkens the scene (Hearth Test: reflect, never punish).
  const counts = inp.counts ?? {};
  const water = tally(counts, WATER_IDS);
  const stretch = tally(counts, STRETCH_IDS);
  const nature = tally(counts, NATURE_IDS);
  const walk = tally(counts, WALK_IDS) + (inp.walkedToday ? 1 : 0);
  const streak = inp.streak ?? 0;

  // Drink water → wells sparkle and gardens look healthier.
  const wellSparkle = water > 0;
  // Nature photo + water → flowers bloom along the shore and in the gardens.
  const bloom = clamp01((nature > 0 ? 0.6 : 0) + Math.min(0.4, water * 0.4));
  // Water + stretch → gardens greener, vines creep a little further up the walls.
  const gardenLush = clamp01(Math.min(0.55, water * 0.35) + (stretch > 0 ? 0.4 : 0));
  // Walk → more villagers out on the roads (0..1 extra crowd).
  const villagersOut = clamp01(walk >= 2 ? 1 : walk === 1 ? 0.6 : 0);
  // Long streak → festival decorations gather over ~a week of showing up.
  const festive = clamp01((streak - 5) / 9);
  // A flourishing, watered garden draws butterflies by day.
  const butterflies = bloom >= 0.6 && gardenLush >= 0.4;
  // Cold plunge → a cool mist gathers over the water; more plunges, more mist.
  const seaMist = clamp01(tally(counts, COLD_IDS) * 0.6);
  // Sauna → the chimneys curl warmer smoke.
  const saunaWarm = tally(counts, SAUNA_IDS) > 0;
  // Stargaze → a constellation lights the bay (the map shows it only after dark).
  const stargazed = tally(counts, STAR_IDS) > 0;

  return {
    weather: kind,
    cloudCover,
    precip,
    wind,
    sea,
    calm: inp.meditatedToday,
    restless,
    glow,
    bloom,
    gardenLush,
    wellSparkle,
    villagersOut,
    festive,
    butterflies,
    seaMist,
    saunaWarm,
    stargazed,
  };
}

/** A short scene note for the progress label ("· soft rain, calm seas"). */
export function moodCaption(m: WorldMood): string {
  const weather =
    m.weather === 'rain'
      ? 'soft rain'
      : m.weather === 'storm'
        ? 'a brooding storm'
        : m.weather === 'snow'
          ? 'quiet snow'
          : m.weather === 'fog'
            ? 'sea fog'
            : m.weather === 'overcast'
              ? 'grey skies'
              : '';
  const sea = m.calm ? 'still water' : m.seaMist > 0 ? 'a cool mist' : m.sea >= 0.6 ? 'restless seas' : '';
  // One earned flourish, if any — the most "special" the day unlocked.
  const care =
    m.festive >= 0.5
      ? 'festival banners'
      : m.stargazed
        ? 'a constellation aglow'
        : m.butterflies
          ? 'butterflies about'
          : m.bloom >= 0.6
            ? 'flowers blooming'
            : m.wellSparkle
              ? 'wells sparkling'
              : m.saunaWarm
                ? 'warm chimney smoke'
                : m.gardenLush >= 0.6
                  ? 'gardens greening'
                  : '';
  return [weather, sea, care].filter(Boolean).join(', ');
}

/**
 * The list of flourishes the player's day has actually brought the town — for the
 * gentle "Emberhollow today" return-and-notice recap. Only ever what *happened*
 * (never "you skipped X"). Ordered most-special first. Empty on a resting day.
 */
export function earnedFlourishes(m: WorldMood): string[] {
  const out: string[] = [];
  if (m.calm) out.push('The seas settled as you breathed.');
  if (m.villagersOut >= 0.9) out.push('The lanes filled with folk after your walks.');
  else if (m.villagersOut > 0) out.push('A neighbour took the air after your walk.');
  if (m.wellSparkle) out.push('The wells sparkled — you drank with them.');
  if (m.bloom >= 0.6) out.push('Flowers bloomed along the shore.');
  else if (m.gardenLush >= 0.4) out.push('The gardens greened where you stretched.');
  if (m.butterflies) out.push('Butterflies found the flowering gardens.');
  if (m.seaMist > 0) out.push('A cool mist gathered off the water.');
  if (m.saunaWarm) out.push('Warm smoke curled from the chimneys.');
  if (m.stargazed) out.push('A constellation lit the bay while you watched the sky.');
  if (m.festive >= 0.5) out.push('Festival banners gathered over the rooftops.');
  return out;
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** The player's real-world (northern-hemisphere) season for a 0-indexed month.
 *  Pure — the map reads it from the live date to tint the town's ambience so the
 *  world echoes the season the player is actually living in. */
export function seasonForMonth(month: number): Season {
  const m = ((Math.trunc(month) % 12) + 12) % 12;
  if (m === 11 || m <= 1) return 'winter'; // Dec, Jan, Feb
  if (m <= 4) return 'spring'; // Mar, Apr, May
  if (m <= 7) return 'summer'; // Jun, Jul, Aug
  return 'autumn'; // Sep, Oct, Nov
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
function clamp(lo: number, hi: number, v: number): number {
  return Math.max(lo, Math.min(hi, v));
}
