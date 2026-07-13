/**
 * Real weather over Emberhollow: Open-Meteo current conditions (keyless, free
 * for non-commercial use) at the player's rough location. Everything is
 * best-effort — no permission, no network, no problem: the world just stays
 * clear. Coordinates are only ever used locally and are never sent anywhere
 * except the weather query itself.
 */
import { weatherFromWmo } from '../core/world-mood';
import type { WeatherNow } from '../core/world-mood';

const WEATHER_KEY = 'hearth:weather';
const COORDS_KEY = 'hearth:coords';
const WEATHER_TTL = 30 * 60 * 1000;
const COORDS_TTL = 6 * 60 * 60 * 1000;

interface StoredCoords {
  lat: number;
  lng: number;
  at: number;
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
  return cached; // stale beats nothing
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
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat.toFixed(3)}&longitude=${coords.lng.toFixed(3)}` +
      `&current=weather_code,cloud_cover,wind_speed_10m,precipitation&wind_speed_unit=kmh`;
    const res = await fetch(url);
    if (!res.ok) return cached;
    const data = (await res.json()) as {
      current?: { weather_code?: number; cloud_cover?: number; wind_speed_10m?: number; precipitation?: number };
    };
    const c = data.current;
    if (!c || typeof c.weather_code !== 'number') return cached;
    const now = weatherFromWmo(
      c.weather_code,
      c.cloud_cover ?? 0,
      c.wind_speed_10m ?? 0,
      c.precipitation ?? 0,
      Date.now(),
    );
    writeJson(WEATHER_KEY, now);
    return now;
  } catch {
    return cached;
  }
}
