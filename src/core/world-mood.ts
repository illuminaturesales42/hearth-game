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
export function weatherFromWmo(code: number, cloudCoverPct: number, windKph: number, precipMm: number, fetchedAt: number): WeatherNow {
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

export interface MoodInputs {
  weather: WeatherNow | null;
  meditatedToday: boolean;
  /** last day with any meditation (null = never yet) */
  lastCalmDay: string | null;
  /** today's local day key */
  today: string;
  sleptWell: boolean;
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

  return { weather: kind, cloudCover, precip, wind, sea, calm: inp.meditatedToday, restless, glow };
}

/** A short scene note for the progress label ("· soft rain, calm seas"). */
export function moodCaption(m: WorldMood): string {
  const weather =
    m.weather === 'rain' ? 'soft rain' :
    m.weather === 'storm' ? 'a brooding storm' :
    m.weather === 'snow' ? 'quiet snow' :
    m.weather === 'fog' ? 'sea fog' :
    m.weather === 'overcast' ? 'grey skies' : '';
  const sea = m.calm ? 'still water' : m.sea >= 0.6 ? 'restless seas' : '';
  return [weather, sea].filter(Boolean).join(', ');
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
function clamp(lo: number, hi: number, v: number): number {
  return Math.max(lo, Math.min(hi, v));
}
