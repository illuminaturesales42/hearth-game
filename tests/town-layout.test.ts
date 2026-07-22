import { describe, expect, it } from 'vitest';
import {
  TOWN_BUILDINGS,
  TOWN_TERRAIN,
  TOWN_BOATS,
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
 * effect/story hook still resolves to a real piece.
 */

describe('TOWN_BUILDINGS — everything stays on the painted canvas', () => {
  it('every building sits within the frame with its scaled footprint', () => {
    for (const b of TOWN_BUILDINGS) {
      const half = (b.w * BUILDING_PLATE_SCALE) / 2;
      expect(b.x - half, `${b.art} left`).toBeGreaterThanOrEqual(0);
      expect(b.x + half, `${b.art} right`).toBeLessThanOrEqual(1);
      expect(b.y, `${b.art} y`).toBeGreaterThan(0);
      expect(b.y, `${b.art} y`).toBeLessThanOrEqual(1);
      expect(b.w, `${b.art} w`).toBeGreaterThan(0);
    }
  });

  it('no two landmark buildings overlap (roughly same row → clear of each other)', () => {
    const big = TOWN_BUILDINGS.filter((b) => b.w >= 0.12); // real buildings, not props
    for (let i = 0; i < big.length; i++) {
      for (let j = i + 1; j < big.length; j++) {
        const a = big[i]!;
        const b = big[j]!;
        if (Math.abs(a.y - b.y) >= 0.07) continue; // different depth rows never collide
        const minGap = (((a.w + b.w) * BUILDING_PLATE_SCALE) / 2) * 0.82; // allow a little visual tuck
        expect(Math.abs(a.x - b.x), `${a.art} vs ${b.art} too close`).toBeGreaterThanOrEqual(minGap);
      }
    }
  });
});

describe('water pieces sit in water, land pieces on land', () => {
  // The plate's real waters: the SE cove (turquoise + sand arc), the shallows
  // off the south beach, and the open sea beyond the island's rim.
  const COVE = { x0: 0.6, x1: 0.86, y0: 0.56, y1: 0.78 };
  const inCove = (x: number, y: number) => x >= COVE.x0 && x <= COVE.x1 && y >= COVE.y0 && y <= COVE.y1;
  const inWater = (x: number, y: number) =>
    inCove(x, y) ||
    (x >= 0.3 && x <= 0.62 && y >= 0.86) || // south-beach shallows
    x < 0.14 ||
    x > 0.88 ||
    y > 0.92; // open sea past the island's rim

  it('any piece flagged water:true is anchored in real water (cove/shallows/sea)', () => {
    for (const b of [...TOWN_BUILDINGS, ...TOWN_TERRAIN]) {
      if (b.water) expect(inWater(b.x, b.y), `${b.art} should be in water`).toBe(true);
    }
  });

  it('every boat floats in real water', () => {
    for (const b of TOWN_BOATS) {
      expect(inWater(b.x, b.y), `${b.art} should float in water`).toBe(true);
    }
  });

  it('land buildings are not anchored in the middle of the cove water', () => {
    for (const b of TOWN_BUILDINGS) {
      if (b.water) continue;
      // props (well/sign) may edge the shore; only flag clearly-land buildings
      if (b.w < 0.12) continue;
      const deepInCove = b.x > 0.66 && b.x < 0.8 && b.y > 0.6 && b.y < 0.74;
      expect(deepInCove, `${b.art} is a land building stranded in water`).toBe(false);
    }
  });
});

describe('story + effect hooks all resolve', () => {
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

  it('anchorOf resolves terrain pieces too, and null for the unknown', () => {
    expect(anchorOf(TOWN_TERRAIN[0]!.art)).not.toBeNull();
    expect(anchorOf('nope_not_a_piece')).toBeNull();
  });
});
