/**
 * Seasonal constellations + real meteor showers for the night sky over the bay.
 * Pure data + date math (unit-testable); the canvas rendering lives in
 * ui/map-view. Positions are stylised (recognisable asterism shapes in a
 * normalised 0..1 box), not astronomically placed — the point is that the sky
 * carries the shape of *your* season, and shooting stars fall on the nights a
 * real shower peaks.
 */

export interface Star {
  x: number;
  y: number;
}
export interface Constellation {
  name: string;
  stars: Star[];
  /** index pairs to connect with faint lines */
  lines: [number, number][];
}

const ORION: Constellation = {
  name: 'Orion',
  stars: [
    { x: 0.25, y: 0.12 }, // Betelgeuse (shoulder)
    { x: 0.72, y: 0.18 }, // Bellatrix (shoulder)
    { x: 0.42, y: 0.5 }, // belt
    { x: 0.52, y: 0.53 }, // belt
    { x: 0.62, y: 0.56 }, // belt
    { x: 0.32, y: 0.9 }, // Rigel (foot)
    { x: 0.78, y: 0.86 }, // Saiph (foot)
  ],
  lines: [
    [0, 2],
    [2, 3],
    [3, 4],
    [4, 1],
    [2, 5],
    [4, 6],
  ],
};

const BIG_DIPPER: Constellation = {
  name: 'the Plough',
  stars: [
    { x: 0.18, y: 0.32 },
    { x: 0.34, y: 0.26 },
    { x: 0.4, y: 0.46 },
    { x: 0.24, y: 0.52 },
    { x: 0.55, y: 0.4 },
    { x: 0.7, y: 0.34 },
    { x: 0.86, y: 0.28 },
  ],
  lines: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [2, 4],
    [4, 5],
    [5, 6],
  ],
};

const CYGNUS: Constellation = {
  name: 'Cygnus',
  stars: [
    { x: 0.5, y: 0.1 },
    { x: 0.5, y: 0.55 },
    { x: 0.5, y: 0.9 },
    { x: 0.2, y: 0.48 },
    { x: 0.8, y: 0.44 },
  ],
  lines: [
    [0, 1],
    [1, 2],
    [3, 1],
    [1, 4],
  ],
};

const CASSIOPEIA: Constellation = {
  name: 'Cassiopeia',
  stars: [
    { x: 0.1, y: 0.32 },
    { x: 0.3, y: 0.62 },
    { x: 0.5, y: 0.36 },
    { x: 0.7, y: 0.66 },
    { x: 0.9, y: 0.34 },
  ],
  lines: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
  ],
};

const SOUTHERN_CROSS: Constellation = {
  name: 'the Southern Cross',
  stars: [
    { x: 0.5, y: 0.08 },
    { x: 0.52, y: 0.9 },
    { x: 0.18, y: 0.52 },
    { x: 0.82, y: 0.46 },
  ],
  lines: [
    [0, 1],
    [2, 3],
  ],
};

const SCORPIUS: Constellation = {
  name: 'Scorpius',
  stars: [
    { x: 0.14, y: 0.2 },
    { x: 0.3, y: 0.3 },
    { x: 0.45, y: 0.42 },
    { x: 0.58, y: 0.56 },
    { x: 0.66, y: 0.72 },
    { x: 0.78, y: 0.82 },
    { x: 0.88, y: 0.7 },
  ],
  lines: [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 6],
  ],
};

/** The season's constellation, hemisphere-aware. Southern skies get their icons. */
export function constellationFor(month: number, southern: boolean): Constellation {
  const m = ((Math.trunc(month) % 12) + 12) % 12;
  if (southern) {
    // Southern winter (Jun–Aug) → Scorpius rides high; otherwise the Cross.
    return m >= 5 && m <= 7 ? SCORPIUS : SOUTHERN_CROSS;
  }
  if (m === 11 || m <= 1) return ORION; // winter
  if (m <= 4) return BIG_DIPPER; // spring
  if (m <= 7) return CYGNUS; // summer
  return CASSIOPEIA; // autumn
}

export interface MeteorShower {
  name: string;
  /** peak date (month 0..11, day of month) */
  month: number;
  day: number;
}

/** Major annual showers at their peak nights (northern-calendar dates). */
export const METEOR_SHOWERS: readonly MeteorShower[] = [
  { name: 'the Quadrantids', month: 0, day: 3 },
  { name: 'the Lyrids', month: 3, day: 22 },
  { name: 'the Eta Aquariids', month: 4, day: 6 },
  { name: 'the Perseids', month: 7, day: 12 },
  { name: 'the Orionids', month: 9, day: 21 },
  { name: 'the Leonids', month: 10, day: 17 },
  { name: 'the Geminids', month: 11, day: 14 },
  { name: 'the Ursids', month: 11, day: 22 },
];

/**
 * If a real meteor shower is near its peak tonight, its name + an intensity
 * 0..1 (triangular window, ±2 days, peaking on the date). Null otherwise.
 * Uses the LOCAL date of `now`.
 */
export function activeMeteorShower(now: number): { name: string; intensity: number } | null {
  const d = new Date(now);
  const month = d.getMonth();
  const day = d.getDate();
  let best: { name: string; intensity: number } | null = null;
  for (const s of METEOR_SHOWERS) {
    if (s.month !== month) continue;
    const gap = Math.abs(day - s.day);
    if (gap > 2) continue;
    const intensity = 1 - gap / 3; // 1 on the peak, ~0.33 two days out
    if (!best || intensity > best.intensity) best = { name: s.name, intensity };
  }
  return best;
}
