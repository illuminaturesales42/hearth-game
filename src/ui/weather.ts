/**
 * Real weather over Emberhollow: Open-Meteo current conditions (keyless, free
 * for non-commercial use) at the player's rough location. Everything is
 * best-effort — no permission, no network, no problem: the world just stays
 * clear. Coordinates are only ever used locally and are never sent anywhere
 * except the weather query itself.
 */
import { weatherFromWmo } from '../core/world-mood';
import type { WeatherExtra, WeatherKind, WeatherNow } from '../core/world-mood';
import type { SunTimes } from '../core/time-of-day';
import { phaseName } from '../data/moon';
import { appendSample, deriveAccumulation } from '../core/weather-history';
import type { Accumulation, WeatherSample } from '../core/weather-history';

const WEATHER_KEY = 'hearth:weather';
const WEATHER_LOG_KEY = 'hearth:weather-log';
const COORDS_KEY = 'hearth:coords';
const DENIED_KEY = 'hearth:loc-denied';
const SKY_PREF_KEY = 'hearth:sky-pref';
const WEATHER_TTL = 30 * 60 * 1000;
const COORDS_TTL = 6 * 60 * 60 * 1000;

interface StoredCoords {
  lat: number;
  lng: number;
  at: number;
  /** Human label for a manually-set town (from geocoding). */
  label?: string;
  /** True when the player typed a town — a manual choice never re-prompts GPS. */
  manual?: boolean;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* best-effort */
  }
}

async function getCoords(): Promise<StoredCoords | null> {
  const cached = readJson<StoredCoords>(COORDS_KEY);
  if (cached && Date.now() - cached.at < COORDS_TTL) return cached;
  if (cached?.manual) return cached; // a typed town never expires into a GPS re-prompt
  // Respect a prior decline: never nag. The player can opt in from Settings.
  try {
    if (localStorage.getItem(DENIED_KEY) === '1') return cached;
  } catch {
    /* ignore */
  }
  if (!('geolocation' in navigator)) return cached;
  const fresh = await new Promise<StoredCoords | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: COORDS_TTL },
    );
  });
  if (fresh) {
    writeJson(COORDS_KEY, fresh);
    return fresh;
  }
  try {
    localStorage.setItem(DENIED_KEY, '1'); // remember the decline; stop auto-prompting
  } catch {
    /* ignore */
  }
  return cached; // stale beats nothing
}

/**
 * Explicit opt-in from Settings: prompt for GPS now. Returns whether we got a
 * fix; on success clears the "declined" flag and the weather cache so the next
 * read refetches for the new spot.
 */
export async function requestGeolocation(): Promise<boolean> {
  if (!('geolocation' in navigator)) return false;
  const fresh = await new Promise<StoredCoords | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() }),
      () => resolve(null),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: COORDS_TTL },
    );
  });
  if (!fresh) return false;
  writeJson(COORDS_KEY, fresh);
  try {
    localStorage.removeItem(WEATHER_KEY);
    localStorage.removeItem(DENIED_KEY);
  } catch {
    /* ignore */
  }
  return true;
}

/** Look up a town name → coords via Open-Meteo's free geocoder (no key). */
async function geocodeCity(name: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const q = name.trim();
  if (!q) return null;
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: { latitude: number; longitude: number; name: string; country_code?: string }[];
    };
    const r = data.results?.[0];
    if (!r || typeof r.latitude !== 'number' || typeof r.longitude !== 'number') return null;
    return { lat: r.latitude, lng: r.longitude, label: [r.name, r.country_code].filter(Boolean).join(', ') };
  } catch {
    return null;
  }
}

/**
 * Manual location fallback (Settings): set the player's town by name. Returns
 * the resolved label on success, or null if the town wasn't found / offline.
 */
export async function setLocationByCity(name: string): Promise<string | null> {
  const g = await geocodeCity(name);
  if (!g) return null;
  writeJson(COORDS_KEY, { lat: g.lat, lng: g.lng, at: Date.now(), label: g.label, manual: true });
  try {
    localStorage.removeItem(WEATHER_KEY); // refetch for the new town
    localStorage.removeItem(DENIED_KEY);
  } catch {
    /* ignore */
  }
  return g.label;
}

/** A human label for the current location, or null when none is set. */
export function latestLocationLabel(): string | null {
  const c = readJson<StoredCoords>(COORDS_KEY);
  if (!c) return null;
  return c.label ?? 'Your location';
}

const WEATHER_WORD: Record<WeatherKind, string> = {
  clear: 'clear skies',
  clouds: 'light cloud',
  overcast: 'grey skies',
  fog: 'sea fog',
  rain: 'rain',
  storm: 'a storm',
  snow: 'snow',
};

/**
 * A short, legible "your sky right now" stamp for the shared town card:
 * town · weather · temperature · (moon phase at night). Empty when no reading.
 */
export function skyStamp(): string {
  const w = readJson<WeatherNow>(WEATHER_KEY);
  if (!w) return '';
  const parts: string[] = [];
  const loc = latestLocationLabel();
  if (loc && loc !== 'Your location') parts.push(loc);
  parts.push(WEATHER_WORD[w.kind]);
  if (typeof w.tempC === 'number') parts.push(`${Math.round(w.tempC)}°`);
  if (w.isDay === false) parts.push(phaseName(Date.now()).toLowerCase());
  return parts.join(' · ');
}

/**
 * Current weather, cached for 30 minutes. Returns the cache when offline or
 * blocked; null when we've never managed a reading (world renders clear).
 */
export async function currentWeather(): Promise<WeatherNow | null> {
  const cached = readJson<WeatherNow>(WEATHER_KEY);
  if (cached && Date.now() - cached.fetchedAt < WEATHER_TTL) return cached;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return cached;
  const coords = await getCoords();
  if (!coords) return cached;
  try {
    // `is_day` gives an authoritative day/night flag; the daily sunrise/sunset
    // (unixtime = real instants, timezone=auto so they're the location's local
    // day) let the island's light track the player's actual solar clock.
    // Attribution: weather data by Open-Meteo.com (CC BY 4.0).
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat.toFixed(3)}&longitude=${coords.lng.toFixed(3)}` +
      `&current=weather_code,cloud_cover,wind_speed_10m,wind_direction_10m,precipitation,is_day,temperature_2m,apparent_temperature` +
      `&daily=sunrise,sunset&timezone=auto&timeformat=unixtime&wind_speed_unit=kmh`;
    const res = await fetch(url);
    if (!res.ok) return cached;
    const data = (await res.json()) as {
      current?: {
        weather_code?: number;
        cloud_cover?: number;
        wind_speed_10m?: number;
        wind_direction_10m?: number;
        precipitation?: number;
        is_day?: number;
        temperature_2m?: number;
        apparent_temperature?: number;
      };
      daily?: { sunrise?: number[]; sunset?: number[] };
    };
    const c = data.current;
    if (!c || typeof c.weather_code !== 'number') return cached;
    const sr = data.daily?.sunrise?.[0];
    const ss = data.daily?.sunset?.[0];
    const extra: WeatherExtra = {};
    if (c.is_day !== undefined) extra.isDay = c.is_day === 1;
    if (typeof sr === 'number') extra.sunriseMs = sr * 1000;
    if (typeof ss === 'number') extra.sunsetMs = ss * 1000;
    if (typeof c.wind_direction_10m === 'number') extra.windDir = c.wind_direction_10m;
    if (typeof c.temperature_2m === 'number') extra.tempC = c.temperature_2m;
    if (typeof c.apparent_temperature === 'number') extra.feelsLikeC = c.apparent_temperature;
    extra.southern = coords.lat < 0; // hemisphere bit only — flips the seasons
    const now = weatherFromWmo(
      c.weather_code,
      c.cloud_cover ?? 0,
      c.wind_speed_10m ?? 0,
      c.precipitation ?? 0,
      Date.now(),
      extra,
    );
    writeJson(WEATHER_KEY, now);
    logReading(now);
    return now;
  } catch {
    return cached;
  }
}

/**
 * Fold each fresh reading into the day-spanning log so the ground can *remember*
 * weather — puddles that linger after rain, snow that settles over a cold day.
 * Best-effort and self-pruning; a corrupt log just resets.
 */
function logReading(w: WeatherNow): void {
  const sample: WeatherSample = { at: w.fetchedAt, kind: w.kind, precipMm: w.precipMm };
  if (typeof w.tempC === 'number') sample.tempC = w.tempC;
  const log = readJson<WeatherSample[]>(WEATHER_LOG_KEY) ?? [];
  writeJson(WEATHER_LOG_KEY, appendSample(Array.isArray(log) ? log : [], sample, w.fetchedAt));
}

/**
 * Weather's memory right now: wet ground + lying snow derived from the reading
 * log. Zeroed when there's no history (a first-ever dry world). Pure read.
 */
export function latestAccumulation(now: number = Date.now()): Accumulation {
  const log = readJson<WeatherSample[]>(WEATHER_LOG_KEY);
  if (!Array.isArray(log) || log.length === 0) return { wetness: 0, snowDepth: 0 };
  return deriveAccumulation(log, now);
}

/**
 * The last known local sun times (from the cached reading), for callers that
 * need the solar clock without holding a WeatherNow — e.g. the corner time
 * badge, so it and the map's lighting read the SAME sunrise/sunset. Null until
 * a reading with sun times has landed.
 */
export function latestSunTimes(): SunTimes | null {
  const w = readJson<WeatherNow>(WEATHER_KEY);
  if (w && typeof w.sunriseMs === 'number' && typeof w.sunsetMs === 'number') {
    return { sunriseMs: w.sunriseMs, sunsetMs: w.sunsetMs };
  }
  return null;
}

/** Whether the player is in the southern hemisphere (from the cached reading). */
export function latestSouthern(): boolean {
  return readJson<WeatherNow>(WEATHER_KEY)?.southern === true;
}

// ---------- "pick your sky" — the opt-out for grey-climate players ----------
// Real-weather sync is the magic, but a player stuck under a fortnight of drizzle
// deserves a way out (the Animal Crossing time-travel lesson). A chosen mood keeps
// the real *solar clock* (dawn/day/dusk/night still track the player's true
// sunrise/sunset — that stays honest and lovely) but paints a preferred weather.

export type SkyPref = 'real' | 'clear' | 'rain' | 'snow';

const SKY_PREFS: readonly SkyPref[] = ['real', 'clear', 'rain', 'snow'];

/** The player's sky preference (default: follow the real weather). */
export function getSkyPref(): SkyPref {
  try {
    const v = localStorage.getItem(SKY_PREF_KEY);
    return SKY_PREFS.includes(v as SkyPref) ? (v as SkyPref) : 'real';
  } catch {
    return 'real';
  }
}

/** Store the player's sky preference. */
export function setSkyPref(p: SkyPref): void {
  try {
    localStorage.setItem(SKY_PREF_KEY, p);
  } catch {
    /* best-effort */
  }
}

/**
 * The weather the island should actually render, honouring "pick your sky". On
 * 'real' it's the live reading untouched; a chosen mood overrides the weather
 * fields while inheriting the real sun times, temperature and hemisphere so the
 * daylight, seasons and clock stay true to where the player is.
 */
export function effectiveWeather(real: WeatherNow | null, pref: SkyPref = getSkyPref()): WeatherNow | null {
  if (pref === 'real') return real;
  const base: WeatherNow = real
    ? { ...real }
    : { kind: 'clear', cloudCover: 0.2, windKph: 6, precipMm: 0, fetchedAt: Date.now() };
  if (pref === 'clear') return { ...base, kind: 'clear', cloudCover: 0.12, precipMm: 0 };
  if (pref === 'rain') return { ...base, kind: 'rain', cloudCover: 0.85, precipMm: 1.2 };
  // snow — force a cold reading so it settles and reads wintry
  return { ...base, kind: 'snow', cloudCover: 0.9, precipMm: 0.8, tempC: Math.min(base.tempC ?? -1, -1) };
}

/**
 * The ground accumulation to render for a chosen mood (real weather uses the
 * derived history instead). A steady preset shows a settled, believable amount.
 */
export function presetAccumulation(pref: SkyPref): Accumulation {
  if (pref === 'rain') return { wetness: 0.7, snowDepth: 0 };
  if (pref === 'snow') return { wetness: 0, snowDepth: 0.7 };
  return { wetness: 0, snowDepth: 0 }; // clear
}
