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
  /** This piece stands in/over water (pier, moored hull): the renderer gives it
   *  a water reflection instead of an earth-coloured contact pad. */
  water?: true;
}

/**
 * Buildings, in story order. One returns roughly every two deliveries.
 *
 * Positions are laid to the painted island plate's real plots (Batch-15
 * PLOT_MASK_map_island_plate.png), NOT the idealized mask island — the final
 * plate carved a bay into the south-east, so anchors are validated on the actual
 * painted land and spaced so no two building sprites collide at the plate's
 * draw scale (see BUILDING_PLATE_SCALE — the lighthouse and Joss's hut used to
 * overlap). tests/town-layout.test.ts enforces the no-collision rule.
 */

/**
 * Buildings on the painted plate draw slightly larger than their raw `w` so they
 * fill the plate's plot rings and cast a grounding footprint. This is the single
 * source of truth for that factor (map-view reads it) — anchors above are spaced
 * for it, and the layout-sanity test uses it to prove no two buildings collide.
 */
export const BUILDING_PLATE_SCALE = 1.04;

export const TOWN_BUILDINGS: readonly TownPiece[] = [
  // 2026-07 environment pass v2: every building is SEATED in a painted plot-ring
  // on the plate — the ring centres were measured off the art, and each anchor's
  // baseline is planted just forward of its ring centre so the house sits IN its
  // clearing (not floating on the dirt paths between plots, the old fault). The
  // plate's rings are packed tighter than a full-size sprite, so buildings are
  // sized to their rings (~0.13) with the town hall the landmark exception.
  // Focal hierarchy: ① town hall on the big central plot, ② the lighthouse alone
  // against open sea, ③ the harbour cove. Ring letters map to tools/compose_map_mock.
  //
  // The notice board stands on the path at the market's mouth; its baseline sits
  // below the market's so it always draws on top of the awning.
  { art: 'prop_sign', x: 0.55, y: 0.67, w: 0.042, unlockAt: 1 },
  { art: 'town_cottage', x: 0.29, y: 0.34, w: 0.13, unlockAt: 2, smoke: { dx: 0.18, dy: -0.72 }, ruinVariant: 0 }, // ring B (west forest)
  { art: 'town_bakery', x: 0.255, y: 0.49, w: 0.125, unlockAt: 4, smoke: { dx: -0.2, dy: -0.78 }, ruinVariant: 2 }, // ring C
  { art: 'prop_well', x: 0.44, y: 0.45, w: 0.086, unlockAt: 6 }, // plaza path junction
  { art: 'town_market', x: 0.485, y: 0.66, w: 0.13, unlockAt: 8, ruinVariant: 7 }, // ring I (head of the harbour road)
  { art: 'town_garden', x: 0.75, y: 0.5, w: 0.13, unlockAt: 10, ruinVariant: 4 }, // ring G
  { art: 'town_townhall', x: 0.565, y: 0.37, w: 0.145, unlockAt: 12, ruinVariant: 3 }, // ring D (big central plot — the landmark)
  { art: 'town_workshop', x: 0.45, y: 0.8, w: 0.125, unlockAt: 15, smoke: { dx: 0.16, dy: -0.75 }, ruinVariant: 1 }, // ring J
  { art: 'town_farm', x: 0.675, y: 0.3, w: 0.13, unlockAt: 16, ruinVariant: 5 }, // ring F (NE meadow)
  // Joss's hut is a stilted pier: it sits inside the cove with its deck over the
  // bay water, connected to land only at the house body (back).
  { art: 'town_fisherhut', x: 0.795, y: 0.68, w: 0.14, unlockAt: 18, ruinVariant: 6, water: true },
  { art: 'town_sawmill', x: 0.46, y: 0.205, w: 0.135, unlockAt: 20, ruinVariant: 1 }, // ring A (north forest — timber)
  { art: 'town_blacksmith', x: 0.365, y: 0.58, w: 0.125, unlockAt: 21, smoke: { dx: 0.05, dy: -0.8 }, ruinVariant: 2 }, // ring E
  // the dock pier's base meets the cove's north-west sand arc so its deck runs
  // out over the bay water, not the grass
  { art: 'town_dock', x: 0.655, y: 0.645, w: 0.12, unlockAt: 22, ruinVariant: 5, water: true },
  { art: 'town_library', x: 0.315, y: 0.685, w: 0.13, unlockAt: 23, ruinVariant: 3 }, // ring H
] as const;

/**
 * Buildings that live outside TOWN_BUILDINGS (painted directly onto the scene,
 * not composited sprites) but still have a story return point. The lighthouse
 * relights at order 9 — the beacon story beat (see map-view's painted lighthouse).
 */
const SPECIAL_RETURNS: Record<string, number> = {
  prop_lighthouse: 9,
};

/**
 * The order at which a building returns to Emberhollow, or null if it isn't a
 * story building at all. Canonical source for "has this building come back?" —
 * used by the mini-game eligibility gate so each game opens with its building.
 */
export function returnsAt(art: string): number | null {
  const piece = TOWN_BUILDINGS.find((b) => b.art === art);
  if (piece) return piece.unlockAt;
  return SPECIAL_RETURNS[art] ?? null;
}

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
  prop_lighthouse: 'The Lighthouse',
};

/**
 * When each villager becomes worth meeting (delivered-order gate). Formerly the
 * `unlockAt` on each map walker; the walking figures were retired in the
 * environment pass (they read as sprites pasted on the painted plate), but the
 * story-gating they carried lives on here as the single source of truth for
 * discovery nudges (see core/discovery.ts). Keys are villager ids (`npc_<id>` →
 * `<id>`). Do not change these numbers — they gate existing players' nudges.
 */
export const VILLAGER_MEETS: Record<string, number> = {
  bran: 4,
  wren: 8,
  sorin: 9,
  marta: 12,
  child: 16,
  joss: 18,
  woman: 20,
  man: 22,
};

/** Boats moored and returning as the harbour comes back to life. */
// Moorings follow the harbours: the rowboat shelters inside the cove by the
// pier, the fishing boat works off the south-beach jetty, and the little sail
// keeps to the open west sea for the wide-shot silhouette.
export const TOWN_BOATS: readonly { art: string; x: number; y: number; w: number; stage: number }[] = [
  { art: 'boat_row', x: 0.73, y: 0.705, w: 0.09, stage: 2 },
  { art: 'boat_fishing_s', x: 0.575, y: 0.97, w: 0.12, stage: 3 },
  { art: 'boat_sail_s', x: 0.08, y: 0.96, w: 0.1, stage: 4 },
] as const;

/**
 * Nature and street furniture fill in as the town heals (by homestead stage).
 * Every anchor is validated against the painted plate: on land (except coastal
 * pieces), and clear of building sprite columns so nothing hides behind a roof.
 */
export const TOWN_NATURE: readonly (TownPiece & { stage: number })[] = [
  // ── permanent coastline + the open east headland the lighthouse path crosses
  { art: 'prop_rock', x: 0.055, y: 0.47, w: 0.045, unlockAt: 0, stage: 0 },
  { art: 'prop_rock', x: 0.885, y: 0.47, w: 0.04, unlockAt: 0, stage: 0 },
  { art: 'prop_shorerock', x: 0.115, y: 0.805, w: 0.05, unlockAt: 0, stage: 0 },
  { art: 'prop_tidepool', x: 0.56, y: 0.905, w: 0.07, unlockAt: 0, stage: 0 },
  { art: 'tree_pine', x: 0.76, y: 0.33, w: 0.04, unlockAt: 0, stage: 0 },
  { art: 'tree_bush', x: 0.8, y: 0.33, w: 0.045, unlockAt: 0, stage: 0 },
  { art: 'tree_oak', x: 0.795, y: 0.415, w: 0.06, unlockAt: 0, stage: 1 },
  { art: 'tree_pine', x: 0.85, y: 0.315, w: 0.044, unlockAt: 0, stage: 1 },
  // ── copses softening the seams between plots
  { art: 'tree_bush', x: 0.47, y: 0.47, w: 0.045, unlockAt: 0, stage: 2 },
  { art: 'tree_bush', x: 0.3, y: 0.56, w: 0.048, unlockAt: 0, stage: 2 },
  // ── lamplight + benches around the town square (well & notice board)
  { art: 'prop_lamp', x: 0.415, y: 0.52, w: 0.026, unlockAt: 0, stage: 2 },
  { art: 'prop_lamp', x: 0.47, y: 0.64, w: 0.026, unlockAt: 0, stage: 2 },
  // one lamp lights the harbour road down to the dock
  { art: 'prop_lamp', x: 0.6, y: 0.655, w: 0.026, unlockAt: 0, stage: 3 },
  { art: 'prop_bench', x: 0.43, y: 0.61, w: 0.052, unlockAt: 0, stage: 3 },
  { art: 'prop_bench', x: 0.52, y: 0.7, w: 0.052, unlockAt: 0, stage: 4 },
  // ── wildflower beds + flowering bushes brighten the open middle
  { art: 'terrain_flowers1', x: 0.6, y: 0.61, w: 0.055, unlockAt: 0, stage: 2 },
  { art: 'terrain_flowers2', x: 0.395, y: 0.56, w: 0.055, unlockAt: 0, stage: 2 },
  { art: 'terrain_flowers1', x: 0.72, y: 0.56, w: 0.05, unlockAt: 0, stage: 3 },
  { art: 'tree_flowerbush', x: 0.45, y: 0.55, w: 0.05, unlockAt: 0, stage: 3 },
  { art: 'tree_flowerbush', x: 0.42, y: 0.5, w: 0.048, unlockAt: 0, stage: 3 },
  { art: 'tree_flowerbush', x: 0.72, y: 0.64, w: 0.048, unlockAt: 0, stage: 4 },
  // ── fences frame the farm (ring F) and the garden (ring G) once they're tended
  { art: 'fence_wood', x: 0.62, y: 0.335, w: 0.1, unlockAt: 16, stage: 0 },
  { art: 'fence_wood', x: 0.7, y: 0.54, w: 0.095, unlockAt: 10, stage: 0 },
  // ── working clutter on the dock's landward side + the square
  { art: 'prop_barrel', x: 0.612, y: 0.628, w: 0.034, unlockAt: 0, stage: 4 },
  { art: 'prop_crate', x: 0.633, y: 0.617, w: 0.034, unlockAt: 0, stage: 4 },
  { art: 'prop_barrel', x: 0.42, y: 0.55, w: 0.032, unlockAt: 0, stage: 4 },
  // ── Storm wreckage: the island washed up broken but alive. Scattered on the
  //    open ground early, cleared away as Emberhollow is rebuilt (untilStage).
  { art: 'debris_a', x: 0.47, y: 0.56, w: 0.055, unlockAt: 0, stage: 0, untilStage: 1 },
  { art: 'debris_b', x: 0.6, y: 0.48, w: 0.052, unlockAt: 0, stage: 0, untilStage: 1 },
  { art: 'debris_c', x: 0.44, y: 0.66, w: 0.045, unlockAt: 0, stage: 0, untilStage: 0 },
  { art: 'debris_d', x: 0.5, y: 0.66, w: 0.035, unlockAt: 0, stage: 0, untilStage: 1 },
  { art: 'debris_e', x: 0.31, y: 0.545, w: 0.05, unlockAt: 0, stage: 0, untilStage: 0 },
  { art: 'debris_a', x: 0.56, y: 0.44, w: 0.045, unlockAt: 0, stage: 0, untilStage: 0 },
  // storm-bent dead trees give way to healthy ones as the land heals
  { art: 'tree_dead_a', x: 0.6, y: 0.42, w: 0.048, unlockAt: 0, stage: 0, untilStage: 2 },
  { art: 'tree_dead_b', x: 0.44, y: 0.6, w: 0.045, unlockAt: 0, stage: 0, untilStage: 2 },
  { art: 'tree_dead_c', x: 0.36, y: 0.5, w: 0.048, unlockAt: 0, stage: 0, untilStage: 1 },
] as const;

/**
 * The island itself (Batch-2 usage note: "combine terrain, props, and
 * buildings"). Always present — the storm bent the trees and scattered the
 * rocks, but the land was never lost. Stone paths knit in with rebuilding.
 */
export const TOWN_TERRAIN: readonly TownPiece[] = [
  // rocky coast ring
  { art: 'terrain_rocks', x: 0.05, y: 0.52, w: 0.09, unlockAt: 0 },
  { art: 'terrain_rocks', x: 0.92, y: 0.638, w: 0.085, unlockAt: 0 },
  { art: 'terrain_rocks', x: 0.24, y: 0.9, w: 0.08, unlockAt: 0 },
  { art: 'terrain_rocks', x: 0.098, y: 0.77, w: 0.07, unlockAt: 0 },
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
  // A small fishing jetty runs off the SOUTH BEACH sand, where the fishing boat
  // moors — it used to sit on the rocky SE shore, planks on stone. (The old
  // dock_straight + dock_end pair stays retired: the cove already holds the
  // town_dock working pier, and a third structure would crowd it; a properly
  // painted pier set is briefed in the environment-pass art brief.)
  { art: 'dock_small', x: 0.505, y: 0.945, w: 0.065, unlockAt: 0, water: true },
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
  { art: 'terrain_flowers1', name: 'Wildflower bed', cost: 30, w: 0.06 },
  { art: 'tree_oak', name: 'Old oak', cost: 45, w: 0.07 },
  { art: 'prop_tidepool', name: 'Tide pool', cost: 40, w: 0.07 },
  { art: 'prop_shorerock', name: 'Shore rocks', cost: 20, w: 0.05 },
] as const;

/**
 * The live position of a laid-out piece by art id (buildings first, then terrain,
 * then nature dressing). This is the single lookup the map's effects use so a
 * glow/wash/sparkle always tracks the building it belongs to — move a piece here
 * and its effects follow, instead of drifting off a hardcoded literal.
 */
export function anchorOf(art: string): { x: number; y: number; w: number } | null {
  const p =
    TOWN_BUILDINGS.find((b) => b.art === art) ??
    TOWN_TERRAIN.find((b) => b.art === art) ??
    TOWN_NATURE.find((b) => b.art === art);
  return p ? { x: p.x, y: p.y, w: p.w } : null;
}

/**
 * Named scene anchors that aren't tied to a single sprite. Everything the map
 * draws at a "place" reads from here or from anchorOf() — never from literals
 * buried in map-view (those drifted every time the layout moved).
 */

/** The civic plaza — path convergence where the well, sign and market gather.
 *  Centres the night hearth-lift and the sleep-warmth glow. */
export const PLAZA = { x: 0.46, y: 0.5 } as const;

/** The lighthouse is painted-in specially (4-state ladder), not a layout piece —
 *  but its anchor is still data. Pulled slightly in from the frame edge so the
 *  beam and halo aren't clipped at narrow aspect ratios. */
export const LIGHTHOUSE_ANCHOR = { x: 0.925, y: 0.59, w: 0.15 } as const;

/** Sky-space effects (viewport fractions, not ground positions). */
export const SKY_ANCHORS = {
  /** god-rays fan from the sun's painted corner */
  godRays: { x: 0.78, y: 0.14 },
  /** the stargaze reaction's little constellation over the bay */
  stargaze: { x: 0.8, y: 0.16 },
} as const;

/** Open-ground bands for weather-memory scatter (clear of buildings so puddles
 *  and drifts never sit on a roof). */
export const GROUND_BANDS = {
  snowDrifts: { x0: 0.08, x1: 0.94, y0: 0.72, y1: 0.8 },
  puddles: { x0: 0.18, x1: 0.6, y0: 0.66, y1: 0.8 },
  bloomShore: { x0: 0.24, x1: 0.62, y0: 0.82, y1: 0.88 },
} as const;
