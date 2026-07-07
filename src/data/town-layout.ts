/**
 * Emberhollow's scene graph: where each building stands and which delivered
 * order brings it back to life. The Home canvas composes these sprites into a
 * town that visibly grows piece by piece — the "layered asset architecture"
 * from the production docs. Positions are normalized (0..1) with y as the
 * ground anchor; draw order is by y (painter's algorithm).
 */

export interface TownPiece {
  art: string; // sliced sprite id
  x: number; // anchor centre, 0..1 of canvas width
  y: number; // anchor baseline, 0..1 of canvas height
  w: number; // width as fraction of canvas width
  /** Orders delivered before this piece appears. */
  unlockAt: number;
  /** Chimney smoke offset (fraction of sprite size) for cosy stages. */
  smoke?: { dx: number; dy: number };
}

/** Buildings, in story order. One returns roughly every two deliveries. */
export const TOWN_BUILDINGS: readonly TownPiece[] = [
  { art: 'prop_sign', x: 0.535, y: 0.56, w: 0.045, unlockAt: 1 },
  { art: 'town_cottage', x: 0.27, y: 0.52, w: 0.17, unlockAt: 2, smoke: { dx: 0.18, dy: -0.72 } },
  { art: 'town_bakery', x: 0.64, y: 0.485, w: 0.165, unlockAt: 4, smoke: { dx: -0.2, dy: -0.78 } },
  { art: 'prop_well', x: 0.475, y: 0.635, w: 0.055, unlockAt: 6 },
  { art: 'town_market', x: 0.43, y: 0.44, w: 0.155, unlockAt: 8 },
  { art: 'town_garden', x: 0.73, y: 0.66, w: 0.17, unlockAt: 10 },
  { art: 'town_townhall', x: 0.505, y: 0.375, w: 0.185, unlockAt: 12 },
  { art: 'town_workshop', x: 0.155, y: 0.43, w: 0.16, unlockAt: 15, smoke: { dx: 0.16, dy: -0.75 } },
  { art: 'town_farm', x: 0.095, y: 0.635, w: 0.17, unlockAt: 16 },
  { art: 'town_fisherhut', x: 0.865, y: 0.56, w: 0.165, unlockAt: 18 },
  { art: 'town_sawmill', x: 0.21, y: 0.76, w: 0.165, unlockAt: 20 },
  { art: 'town_blacksmith', x: 0.36, y: 0.72, w: 0.16, unlockAt: 21, smoke: { dx: 0.05, dy: -0.8 } },
  { art: 'town_dock', x: 0.79, y: 0.84, w: 0.21, unlockAt: 22 },
  { art: 'town_library', x: 0.585, y: 0.74, w: 0.165, unlockAt: 23 },
] as const;

/** Nature and street furniture fill in as the town heals (by homestead stage). */
export const TOWN_NATURE: readonly (TownPiece & { stage: number })[] = [
  { art: 'prop_rock', x: 0.05, y: 0.47, w: 0.05, unlockAt: 0, stage: 0 },
  { art: 'prop_rock', x: 0.94, y: 0.68, w: 0.045, unlockAt: 0, stage: 0 },
  { art: 'tree_pine', x: 0.045, y: 0.4, w: 0.05, unlockAt: 0, stage: 1 },
  { art: 'tree_oak', x: 0.665, y: 0.395, w: 0.07, unlockAt: 0, stage: 1 },
  { art: 'tree_pine', x: 0.315, y: 0.37, w: 0.05, unlockAt: 0, stage: 2 },
  { art: 'prop_lamp', x: 0.565, y: 0.47, w: 0.028, unlockAt: 0, stage: 2 },
  { art: 'prop_lamp', x: 0.44, y: 0.56, w: 0.028, unlockAt: 0, stage: 2 },
  { art: 'tree_oak', x: 0.935, y: 0.45, w: 0.065, unlockAt: 0, stage: 2 },
  { art: 'tree_bush', x: 0.35, y: 0.585, w: 0.055, unlockAt: 0, stage: 3 },
  { art: 'tree_flowerbush', x: 0.6, y: 0.6, w: 0.06, unlockAt: 0, stage: 3 },
  { art: 'prop_bench', x: 0.52, y: 0.665, w: 0.06, unlockAt: 0, stage: 3 },
  { art: 'tree_flowerbush', x: 0.15, y: 0.52, w: 0.06, unlockAt: 0, stage: 4 },
  { art: 'prop_barrel', x: 0.71, y: 0.755, w: 0.035, unlockAt: 0, stage: 4 },
  { art: 'prop_crate', x: 0.685, y: 0.77, w: 0.035, unlockAt: 0, stage: 4 },
] as const;
