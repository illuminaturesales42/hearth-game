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
  /** Which Buildings2 ruin/scaffold row (0..7) represents this building before
   *  it's restored. Omitted for props, which fall back to the shade filter. */
  ruinVariant?: number;
  /** For transient dressing (storm debris, dead trees): the last homestead
   *  stage at which this piece still shows. Omit for permanent pieces. */
  untilStage?: number;
}

/** Buildings, in story order. One returns roughly every two deliveries. */
export const TOWN_BUILDINGS: readonly TownPiece[] = [
  { art: 'prop_sign', x: 0.535, y: 0.56, w: 0.045, unlockAt: 1 },
  { art: 'town_cottage', x: 0.27, y: 0.52, w: 0.17, unlockAt: 2, smoke: { dx: 0.18, dy: -0.72 }, ruinVariant: 0 },
  { art: 'town_bakery', x: 0.64, y: 0.485, w: 0.165, unlockAt: 4, smoke: { dx: -0.2, dy: -0.78 }, ruinVariant: 2 },
  { art: 'prop_well', x: 0.475, y: 0.635, w: 0.055, unlockAt: 6 },
  { art: 'town_market', x: 0.43, y: 0.44, w: 0.155, unlockAt: 8, ruinVariant: 7 },
  { art: 'town_garden', x: 0.73, y: 0.66, w: 0.17, unlockAt: 10, ruinVariant: 4 },
  { art: 'town_townhall', x: 0.505, y: 0.375, w: 0.185, unlockAt: 12, ruinVariant: 3 },
  { art: 'town_workshop', x: 0.155, y: 0.43, w: 0.16, unlockAt: 15, smoke: { dx: 0.16, dy: -0.75 }, ruinVariant: 1 },
  { art: 'town_farm', x: 0.095, y: 0.635, w: 0.17, unlockAt: 16, ruinVariant: 5 },
  { art: 'town_fisherhut', x: 0.865, y: 0.56, w: 0.165, unlockAt: 18, ruinVariant: 6 },
  { art: 'town_sawmill', x: 0.21, y: 0.76, w: 0.165, unlockAt: 20, ruinVariant: 1 },
  { art: 'town_blacksmith', x: 0.36, y: 0.72, w: 0.16, unlockAt: 21, smoke: { dx: 0.05, dy: -0.8 }, ruinVariant: 2 },
  { art: 'town_dock', x: 0.79, y: 0.84, w: 0.21, unlockAt: 22, ruinVariant: 5 },
  { art: 'town_library', x: 0.585, y: 0.74, w: 0.165, unlockAt: 23, ruinVariant: 3 },
] as const;

/** Friendly names + story links for tappable buildings. */
export const BUILDING_INFO: Record<string, string> = {
  prop_sign: 'The Notice Board',
  town_cottage: 'The Old Cottage',
  town_bakery: 'Bran’s Bakery',
  prop_well: 'The Village Well',
  town_market: 'Market Square',
  town_garden: 'The Garden',
  town_townhall: 'The Town Hall',
  town_workshop: 'The Workshop',
  town_farm: 'Meadow Farm',
  town_fisherhut: 'Joss’s Hut',
  town_sawmill: 'The Sawmill',
  town_blacksmith: 'The Forge',
  town_dock: 'North Docks',
  town_library: 'The Library',
};

/** Villagers walk the town once their part of the story has been told. */
export interface TownWalker {
  art: string;
  unlockAt: number;
  /** Waypoints ambled between (ping-pong), normalized coords. */
  path: readonly { x: number; y: number }[];
  /** Seconds for a full one-way walk. */
  period: number;
}

// Each villager keeps to their own corner — a short round near their home or
// workplace, pausing at the ends (the ping-pong dwells there). A place feels
// lived-in when people belong somewhere, not when they wander mid-map.
export const TOWN_WALKERS: readonly TownWalker[] = [
  { art: 'npc_bran', unlockAt: 4, period: 24, path: [{ x: 0.60, y: 0.535 }, { x: 0.67, y: 0.55 }, { x: 0.62, y: 0.53 }] }, // Bran tends the bakery step
  { art: 'npc_wren', unlockAt: 8, period: 28, path: [{ x: 0.49, y: 0.61 }, { x: 0.56, y: 0.585 }, { x: 0.52, y: 0.62 }] }, // Wren by the notice board
  { art: 'npc_sorin', unlockAt: 9, period: 32, path: [{ x: 0.82, y: 0.62 }, { x: 0.90, y: 0.61 }] }, // Sorin near his hut
  { art: 'npc_marta', unlockAt: 12, period: 30, path: [{ x: 0.30, y: 0.585 }, { x: 0.24, y: 0.61 }, { x: 0.29, y: 0.58 }] }, // Marta at the old cottage
  { art: 'npc_child', unlockAt: 16, period: 14, path: [{ x: 0.50, y: 0.68 }, { x: 0.60, y: 0.70 }, { x: 0.52, y: 0.73 }, { x: 0.45, y: 0.70 }] }, // the child romps by the well
  { art: 'npc_joss', unlockAt: 18, period: 26, path: [{ x: 0.72, y: 0.81 }, { x: 0.82, y: 0.83 }] }, // Joss works the docks
  { art: 'npc_woman', unlockAt: 20, period: 28, path: [{ x: 0.15, y: 0.68 }, { x: 0.22, y: 0.66 }] }, // by the farm
  { art: 'npc_man', unlockAt: 22, period: 26, path: [{ x: 0.32, y: 0.76 }, { x: 0.42, y: 0.78 }] }, // by the forge
] as const;

/** Boats moored and returning as the harbour comes back to life. */
export const TOWN_BOATS: readonly { art: string; x: number; y: number; w: number; stage: number }[] = [
  { art: 'boat_row', x: 0.92, y: 0.93, w: 0.09, stage: 2 },
  { art: 'boat_fishing_s', x: 0.68, y: 0.965, w: 0.12, stage: 3 },
  { art: 'boat_sail_s', x: 0.08, y: 0.96, w: 0.1, stage: 4 },
] as const;

/** Nature and street furniture fill in as the town heals (by homestead stage). */
export const TOWN_NATURE: readonly (TownPiece & { stage: number })[] = [
  { art: 'prop_rock', x: 0.05, y: 0.47, w: 0.05, unlockAt: 0, stage: 0 },
  { art: 'prop_rock', x: 0.94, y: 0.68, w: 0.045, unlockAt: 0, stage: 0 },
  // the storm bent the trees but didn't take them — a fresh island still lives
  { art: 'tree_pine', x: 0.105, y: 0.485, w: 0.045, unlockAt: 0, stage: 0 },
  { art: 'tree_pine', x: 0.705, y: 0.44, w: 0.04, unlockAt: 0, stage: 0 },
  { art: 'tree_bush', x: 0.875, y: 0.5, w: 0.05, unlockAt: 0, stage: 0 },
  { art: 'tree_bush', x: 0.24, y: 0.62, w: 0.045, unlockAt: 0, stage: 0 },
  { art: 'prop_rock', x: 0.31, y: 0.815, w: 0.04, unlockAt: 0, stage: 0 },
  { art: 'prop_barrel', x: 0.585, y: 0.55, w: 0.03, unlockAt: 0, stage: 0 },
  { art: 'tree_pine', x: 0.05, y: 0.47, w: 0.05, unlockAt: 0, stage: 1 },
  { art: 'tree_oak', x: 0.665, y: 0.425, w: 0.07, unlockAt: 0, stage: 1 },
  { art: 'tree_pine', x: 0.315, y: 0.425, w: 0.05, unlockAt: 0, stage: 2 },
  { art: 'prop_lamp', x: 0.565, y: 0.47, w: 0.028, unlockAt: 0, stage: 2 },
  { art: 'prop_lamp', x: 0.44, y: 0.56, w: 0.028, unlockAt: 0, stage: 2 },
  { art: 'tree_oak', x: 0.935, y: 0.48, w: 0.065, unlockAt: 0, stage: 2 },
  { art: 'tree_bush', x: 0.35, y: 0.585, w: 0.055, unlockAt: 0, stage: 3 },
  { art: 'tree_flowerbush', x: 0.6, y: 0.6, w: 0.06, unlockAt: 0, stage: 3 },
  { art: 'prop_bench', x: 0.52, y: 0.665, w: 0.06, unlockAt: 0, stage: 3 },
  { art: 'tree_flowerbush', x: 0.15, y: 0.52, w: 0.06, unlockAt: 0, stage: 4 },
  { art: 'prop_barrel', x: 0.71, y: 0.755, w: 0.035, unlockAt: 0, stage: 4 },
  { art: 'prop_crate', x: 0.685, y: 0.77, w: 0.035, unlockAt: 0, stage: 4 },
  // fences frame the farm and the garden once they're tended
  { art: 'fence_wood', x: 0.095, y: 0.685, w: 0.11, unlockAt: 16, stage: 0 },
  { art: 'fence_wood', x: 0.73, y: 0.705, w: 0.11, unlockAt: 10, stage: 0 },
  // ── Storm wreckage: the island washed up broken but alive. Scattered at the
  //    edges early, cleared away as Emberhollow is rebuilt (untilStage).
  { art: 'debris_a', x: 0.62, y: 0.70, w: 0.06, unlockAt: 0, stage: 0, untilStage: 1 },
  { art: 'debris_b', x: 0.35, y: 0.665, w: 0.055, unlockAt: 0, stage: 0, untilStage: 1 },
  { art: 'debris_c', x: 0.50, y: 0.72, w: 0.045, unlockAt: 0, stage: 0, untilStage: 0 },
  { art: 'debris_d', x: 0.815, y: 0.70, w: 0.035, unlockAt: 0, stage: 0, untilStage: 1 },
  { art: 'debris_e', x: 0.19, y: 0.71, w: 0.05, unlockAt: 0, stage: 0, untilStage: 0 },
  { art: 'debris_a', x: 0.44, y: 0.50, w: 0.045, unlockAt: 0, stage: 0, untilStage: 0 },
  // storm-bent dead trees give way to healthy ones as the land heals
  { art: 'tree_dead_a', x: 0.885, y: 0.43, w: 0.05, unlockAt: 0, stage: 0, untilStage: 2 },
  { art: 'tree_dead_b', x: 0.145, y: 0.55, w: 0.045, unlockAt: 0, stage: 0, untilStage: 2 },
  { art: 'tree_dead_c', x: 0.60, y: 0.31, w: 0.05, unlockAt: 0, stage: 0, untilStage: 1 },
  // permanent coastal detail
  { art: 'prop_tidepool', x: 0.90, y: 0.90, w: 0.08, unlockAt: 0, stage: 0 },
  { art: 'prop_shorerock', x: 0.06, y: 0.84, w: 0.05, unlockAt: 0, stage: 0 },
] as const;

/**
 * The island itself (Batch-2 usage note: "combine terrain, props, and
 * buildings"). Always present — the storm bent the trees and scattered the
 * rocks, but the land was never lost. Stone paths knit in with rebuilding.
 */
export const TOWN_TERRAIN: readonly TownPiece[] = [
  // rocky coast ring
  { art: 'terrain_rocks', x: 0.05, y: 0.52, w: 0.09, unlockAt: 0 },
  { art: 'terrain_rocks', x: 0.955, y: 0.66, w: 0.085, unlockAt: 0 },
  { art: 'terrain_rocks', x: 0.24, y: 0.9, w: 0.08, unlockAt: 0 },
  { art: 'terrain_rocks', x: 0.045, y: 0.755, w: 0.07, unlockAt: 0 },
  { art: 'terrain_rocks', x: 0.895, y: 0.455, w: 0.065, unlockAt: 0 },
  // wooded edges — y positions follow the COASTLINE headlands (map-view.ts)
  // so every copse stands on land, never in the sky or the sea
  { art: 'terrain_trees_l', x: 0.1, y: 0.48, w: 0.1, unlockAt: 0 },
  { art: 'terrain_trees_s', x: 0.235, y: 0.465, w: 0.085, unlockAt: 0 },
  { art: 'terrain_trees_l', x: 0.615, y: 0.41, w: 0.095, unlockAt: 0 },
  { art: 'terrain_trees_s', x: 0.735, y: 0.425, w: 0.08, unlockAt: 0 },
  { art: 'terrain_trees_l', x: 0.93, y: 0.5, w: 0.09, unlockAt: 0 },
  { art: 'terrain_bush', x: 0.165, y: 0.575, w: 0.06, unlockAt: 0 },
  { art: 'terrain_bush', x: 0.62, y: 0.565, w: 0.06, unlockAt: 0 },
  // meadow softness
  { art: 'terrain_grass', x: 0.42, y: 0.6, w: 0.075, unlockAt: 0 },
  { art: 'terrain_grass', x: 0.665, y: 0.775, w: 0.075, unlockAt: 0 },
  { art: 'terrain_flowers1', x: 0.3, y: 0.665, w: 0.06, unlockAt: 0 },
  { art: 'terrain_flowers2', x: 0.845, y: 0.63, w: 0.06, unlockAt: 0 },
  // (the old scattered cobble patches are gone — the map now draws worn dirt
  // lanes that grow with the town; see the routes table in map-view.ts)
  // the harbour reaches into the water at the south-east
  { art: 'dock_straight', x: 0.775, y: 0.905, w: 0.1, unlockAt: 0 },
  { art: 'dock_end', x: 0.865, y: 0.925, w: 0.075, unlockAt: 0 },
  { art: 'dock_small', x: 0.7, y: 0.875, w: 0.065, unlockAt: 0 },
] as const;

/** Decorations the player can buy and place — coins buy beauty, never power. */
export interface DecorDef {
  art: string;
  name: string;
  cost: number;
  /** map width as a fraction of canvas width */
  w: number;
}

export const DECOR_CATALOG: readonly DecorDef[] = [
  { art: 'prop_bench', name: 'Harbour bench', cost: 40, w: 0.06 },
  { art: 'prop_lamp', name: 'Lamp post', cost: 30, w: 0.028 },
  { art: 'tree_flowerbush', name: 'Flowering bush', cost: 25, w: 0.06 },
  { art: 'fence_wood', name: 'Fence run', cost: 35, w: 0.11 },
  { art: 'prop_barrel', name: 'Rain barrel', cost: 20, w: 0.035 },
  { art: 'tree_pine', name: 'Pine sapling', cost: 30, w: 0.05 },
  { art: 'prop_well', name: 'Wishing well', cost: 60, w: 0.055 },
] as const;
