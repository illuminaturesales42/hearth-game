import { describe, expect, it } from 'vitest';
import {
  TOWN_BUILDINGS_V1,
  TOWN_BUILDINGS_V2,
  TOWN_TERRAIN_V1,
  TOWN_TERRAIN_V2,
  TOWN_BOATS_V1,
  TOWN_BOATS_V2,
  TOWN_TERRAIN,
  BUILDING_INFO,
  BUILDING_PLATE_SCALE,
  VILLAGER_MEETS,
  returnsAt,
  anchorOf,
} from '../src/data/town-layout';
import { VILLAGERS } from '../src/data/world';

/**
 * The map's composition is data — this pins the invariants a human would
 * otherwise have to eyeball on the painted plate: pieces stay on-canvas,
 * landmark buildings don't collide, water pieces sit in water, and every
 * effect/story hook still resolves to a real piece. Both worlds are covered:
 * V1 (the shipped plate) and V2 (the painted time-of-day world — active the
 * moment its imported art lands in the manifest).
 */

// Per-world water geography. V1: SE cove + south shallows. V2 (from the
// reference painting): the bay wraps the SE around the jetty, beach south,
// open sea at every margin.
const inWaterV1 = (x: number, y: number): boolean =>
  (x >= 0.6 && x <= 0.86 && y >= 0.56 && y <= 0.78) ||
  (x >= 0.3 && x <= 0.62 && y >= 0.86) ||
  x < 0.14 ||
  x > 0.88 ||
  y > 0.92;
const inWaterV2 = (x: number, y: number): boolean =>
  (x >= 0.55 && y >= 0.62) || // SE bay off the jetty
  x < 0.1 ||
  x > 0.93 ||
  y > 0.85; // open sea margins

const WORLDS = [
  { name: 'V1', buildings: TOWN_BUILDINGS_V1, terrain: TOWN_TERRAIN_V1, boats: TOWN_BOATS_V1, inWater: inWaterV1 },
  { name: 'V2', buildings: TOWN_BUILDINGS_V2, terrain: TOWN_TERRAIN_V2, boats: TOWN_BOATS_V2, inWater: inWaterV2 },
] as const;

for (const world of WORLDS) {
  describe(`${world.name} — everything stays on the painted canvas`, () => {
    it('every building sits within the frame with its scaled footprint', () => {
      for (const b of world.buildings) {
        const half = (b.w * BUILDING_PLATE_SCALE) / 2;
        expect(b.x - half, `${b.art} left`).toBeGreaterThanOrEqual(0);
        expect(b.x + half, `${b.art} right`).toBeLessThanOrEqual(1);
        expect(b.y, `${b.art} y`).toBeGreaterThan(0);
        expect(b.y, `${b.art} y`).toBeLessThanOrEqual(1);
        expect(b.w, `${b.art} w`).toBeGreaterThan(0);
      }
    });

    it('no two landmark buildings overlap (roughly same row → clear of each other)', () => {
      const big = world.buildings.filter((b) => b.w >= 0.12);
      for (let i = 0; i < big.length; i++) {
        for (let j = i + 1; j < big.length; j++) {
          const a = big[i]!;
          const b = big[j]!;
          if (Math.abs(a.y - b.y) >= 0.07) continue;
          const minGap = (((a.w + b.w) * BUILDING_PLATE_SCALE) / 2) * 0.82;
          expect(Math.abs(a.x - b.x), `${world.name}: ${a.art} vs ${b.art} too close`).toBeGreaterThanOrEqual(minGap);
        }
      }
    });

    it('water-flagged pieces and every boat sit in real water', () => {
      for (const b of [...world.buildings, ...world.terrain]) {
        if (b.water) expect(world.inWater(b.x, b.y), `${world.name}: ${b.art} should be in water`).toBe(true);
      }
      for (const b of world.boats) {
        expect(world.inWater(b.x, b.y), `${world.name}: ${b.art} should float`).toBe(true);
      }
    });

    it('both worlds place the full cast (same story ids, same unlock orders)', () => {
      const ids = (list: readonly { art: string; unlockAt: number }[]) =>
        [...list].map((b) => `${b.art}@${b.unlockAt}`).sort();
      expect(ids(world.buildings)).toEqual(ids(TOWN_BUILDINGS_V1));
    });
  });
}

describe('story + effect hooks all resolve (active world)', () => {
  it('returnsAt resolves for every tappable building', () => {
    for (const art of Object.keys(BUILDING_INFO)) {
      expect(returnsAt(art), `${art} has no return order`).not.toBeNull();
    }
  });

  it('every meetable villager has a VILLAGER_MEETS gate', () => {
    for (const v of VILLAGERS) {
      expect(VILLAGER_MEETS[v.id], `villager ${v.id}`).toBeTypeOf('number');
    }
  });

  it('anchorOf resolves the pieces effects track', () => {
    for (const art of ['town_garden', 'prop_well', 'town_market', 'town_blacksmith']) {
      const a = anchorOf(art);
      expect(a, `${art} anchor`).not.toBeNull();
      expect(a!.x).toBeGreaterThan(0);
    }
  });

  it('anchorOf resolves terrain pieces when present, null for the unknown', () => {
    if (TOWN_TERRAIN.length > 0) expect(anchorOf(TOWN_TERRAIN[0]!.art)).not.toBeNull();
    expect(anchorOf('nope_not_a_piece')).toBeNull();
  });
});
