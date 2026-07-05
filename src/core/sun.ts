/**
 * Sunrise / sunset calculation (ported from the SunCalc algorithm, MIT).
 * Pure and testable. Used to time-gate the "photograph the sunrise" action
 * to the player's actual local sunrise — a gate that can't be cheated by
 * changing the phone clock the way a plain timer can.
 */

const rad = Math.PI / 180;
const dayMs = 86_400_000;
const J1970 = 2440588;
const J2000 = 2451545;
const obliquity = rad * 23.4397;

const toJulian = (t: number) => t / dayMs - 0.5 + J1970;
const fromJulian = (j: number) => (j + 0.5 - J1970) * dayMs;
const toDays = (t: number) => toJulian(t) - J2000;

const solarMeanAnomaly = (d: number) => rad * (357.5291 + 0.98560028 * d);

const eclipticLongitude = (m: number) => {
  const c = rad * (1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m));
  const perihelion = rad * 102.9372;
  return m + c + perihelion + Math.PI;
};

const declination = (l: number) => Math.asin(Math.sin(obliquity) * Math.sin(l));

const J0 = 0.0009;
const julianCycle = (d: number, lw: number) => Math.round(d - J0 - lw / (2 * Math.PI));
const approxTransit = (ht: number, lw: number, n: number) => J0 + (ht + lw) / (2 * Math.PI) + n;
const solarTransitJ = (ds: number, m: number, l: number) =>
  J2000 + ds + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * l);
const hourAngle = (h: number, phi: number, dec: number) =>
  Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));

export interface Coords {
  lat: number;
  lng: number;
}

/** Sunrise and sunset as epoch-ms for the local day containing `now`. */
export function sunTimes(now: number, coords: Coords): { sunrise: number; sunset: number } {
  const lw = rad * -coords.lng;
  const phi = rad * coords.lat;
  const d = toDays(now);
  const n = julianCycle(d, lw);
  const ds = approxTransit(0, lw, n);
  const m = solarMeanAnomaly(ds);
  const l = eclipticLongitude(m);
  const dec = declination(l);
  const jNoon = solarTransitJ(ds, m, l);
  const h0 = -0.833 * rad; // standard sunrise/sunset altitude
  const w = hourAngle(h0, phi, dec);
  const jSet = solarTransitJ(approxTransit(w, lw, n), m, l);
  const jRise = jNoon - (jSet - jNoon);
  return { sunrise: fromJulian(jRise), sunset: fromJulian(jSet) };
}

export type SunKind = 'sunrise' | 'sunset';

/**
 * The window during which a sunrise/sunset photo counts. With coords we use
 * the real event; without, a sensible local-clock fallback so the game still
 * works offline / before location permission.
 */
export function sunWindow(kind: SunKind, now: number, coords?: Coords): { start: number; end: number } {
  if (coords) {
    const t = sunTimes(now, coords);
    const base = kind === 'sunrise' ? t.sunrise : t.sunset;
    if (Number.isFinite(base)) {
      return kind === 'sunrise'
        ? { start: base - 30 * 60_000, end: base + 90 * 60_000 }
        : { start: base - 90 * 60_000, end: base + 30 * 60_000 };
    }
  }
  const d = new Date(now);
  const at = (h: number, m = 0) => {
    const x = new Date(d);
    x.setHours(h, m, 0, 0);
    return x.getTime();
  };
  return kind === 'sunrise' ? { start: at(5), end: at(9) } : { start: at(17), end: at(20) };
}

export function isWithinWindow(kind: SunKind, now: number, coords?: Coords): boolean {
  const w = sunWindow(kind, now, coords);
  return now >= w.start && now <= w.end;
}

/** Human "HH:MM" of the window opening, for the "come back at…" message. */
export function windowOpensLabel(kind: SunKind, now: number, coords?: Coords): string {
  const w = sunWindow(kind, now, coords);
  const d = new Date(w.start);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
