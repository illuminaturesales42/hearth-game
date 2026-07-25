/**
 * Emberhollow's scene graph: where each building stands and which delivered
 * order brings it back to life. The Home canvas composes these sprites into a
 * town that visibly grows piece by piece — the "layered asset architecture"
 * from the production docs. Positions are normalized (0..1) with y as the
 * ground anchor; draw order is by y (painter's algorithm).
 */
import { artUrl } from '../art-manifest';

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

/**
 * MAP V2 GATE. The new painted world (four time-of-day plates + full building
 * sets — see docs/map-v2-naming.md) ships with its own geography and therefore
 * its own anchors. The dawn plate only exists in the V2 art drop, so its
 * presence in the manifest flips the whole layout: commit the imported art and
 * the game switches; roll the art back and the old world returns. No code
 * changes needed on the art machine.
 */
export const MAP_V2 = artUrl('map_island_plate_dawn') !== null;

/** The original (V1) placement — user-specified; kept verbatim while V1 art ships. */
export const TOWN_BUILDINGS_V1: readonly TownPiece[] = [
  // 2026-07 re-lay (user-directed): cottage→old market plot, bakery→old cottage
  // plot, farm→old bakery plot, library→old farm plot (sprite flipped so the
  // door faces right/into town), market→old library plot, townhall↔workshop.
  { art: 'town_cottage', x: 0.535, y: 0.375, w: 0.148, unlockAt: 2, smoke: { dx: 0.18, dy: -0.72 }, ruinVariant: 0 },
  { art: 'town_bakery', x: 0.36, y: 0.425, w: 0.138, unlockAt: 4, smoke: { dx: -0.2, dy: -0.78 }, ruinVariant: 2 },
  { art: 'prop_well', x: 0.45, y: 0.49, w: 0.092, unlockAt: 6 },
  { art: 'town_market', x: 0.54, y: 0.59, w: 0.138, unlockAt: 8, ruinVariant: 7 },
  { art: 'town_garden', x: 0.775, y: 0.5, w: 0.148, unlockAt: 10, ruinVariant: 4 },
  { art: 'town_townhall', x: 0.2, y: 0.345, w: 0.148, unlockAt: 12, ruinVariant: 3 },
  { art: 'town_postoffice', x: 0.32, y: 0.3, w: 0.115, unlockAt: 13, ruinVariant: 5 },
  { art: 'town_workshop', x: 0.25, y: 0.825, w: 0.138, unlockAt: 15, smoke: { dx: 0.16, dy: -0.75 }, ruinVariant: 1 },
  { art: 'town_farm', x: 0.715, y: 0.31, w: 0.148, unlockAt: 16, ruinVariant: 5 },
  // Joss's hut is a stilted pier: it sits on the SE point with its deck over the
  // bay water, connected to land only at the house body (back). Anchor is
  // intentionally over water so the sprite's own water blends with the plate.
  { art: 'town_fisherhut', x: 0.82, y: 0.705, w: 0.148, unlockAt: 18, ruinVariant: 6, water: true },
  { art: 'town_sawmill', x: 0.43, y: 0.245, w: 0.148, unlockAt: 20, ruinVariant: 1 },
  { art: 'town_blacksmith', x: 0.36, y: 0.71, w: 0.143, unlockAt: 21, smoke: { dx: 0.05, dy: -0.8 }, ruinVariant: 2 },
  // the dock pier sits up at the bay's north-west shore so its own water meets
  // the plate's bay, not the grass
  { art: 'town_dock', x: 0.665, y: 0.685, w: 0.126, unlockAt: 22, ruinVariant: 5, water: true },
  { art: 'town_library', x: 0.225, y: 0.59, w: 0.148, unlockAt: 23, ruinVariant: 3 },
  // The Quarry — where Emberhollow's stone comes from. Cut into open ground
  // east of the well, clear of the garden's plot.
  { art: 'town_quarry', x: 0.65, y: 0.46, w: 0.12, unlockAt: 19, ruinVariant: 1 },
] as const;

/**
 * V2 placement — measured from the "Map times of dayFinal" reference painting
 * (⚑ staged: every anchor gets pixel-tuned against the real imported plate via
 * tools/compose_map_mock.py before the art commit ships to testers).
 * Composition per the reference: lighthouse alone on the NE headland; the
 * windmill(sawmill) on the north ridge; the church(townhall) crowning the
 * upper lanes; the greenhouse(garden) dome at the centre; the well at the
 * crossroads; the jetty(dock) running SE into the bay; cottages and workshops
 * down the west and south lanes; beach open along the south.
 */
const TOWN_BUILDINGS_V2_BASE: readonly TownPiece[] = [
  // Seated on the painted island's grassy clearings, ringing the central
  // landmarks the plate already carries (stone monument ~0.58/0.62, obelisk
  // ~0.42/0.57, painted well ~0.76/0.79) and clear of the north pine forest,
  // the south beach, and the water margins. Pixel-tuned against the real
  // midday plate via tools/compose_map_mock.py --layout v2.
  // Positions read directly off the user's placement reference
  // (art-src/Map/Map with buildings(refence).png), expressed as fractions of
  // the plate. Three landmarks anchor the frame — Town Hall upper-left,
  // Sawmill+Farm across the north ridge, Lighthouse alone on its NE islet;
  // the Garden dome and Well run the centre spine; Fisher Hut + Dock sit on the
  // east/SE water; the south beach and north forest stay clear.
  // y is the sprite's GROUND CONTACT (bottom-center) — the engine draws
  // drawImage(img, x*W - w/2, y*H - h) — so each y sits the building's base on
  // its plot rather than floating the whole sprite above it.
  // The Notice Board (order-1 story beat "The Letter") has no standalone painted
  // asset — it lives on the Town Hall, which carries a painted notice board at its
  // steps. The beat survives via the order chain (economy.ts) + Journal (world.ts).
  { art: 'town_cottage', x: 0.31, y: 0.511, w: 0.13, unlockAt: 2, smoke: { dx: 0.18, dy: -0.72 }, ruinVariant: 0 },
  { art: 'town_bakery', x: 0.68, y: 0.43, w: 0.125, unlockAt: 4, smoke: { dx: -0.2, dy: -0.78 }, ruinVariant: 2 },
  // ruinVariant marks the well for placement pre-restore (shows its own painted
  // prop_well_ruin/_wip storm art); it lives the day cycle via prop_well_dawn/_dusk/_night.
  { art: 'prop_well', x: 0.615, y: 0.508, w: 0.08, unlockAt: 6, ruinVariant: 4 },
  { art: 'town_market', x: 0.7, y: 0.615, w: 0.115, unlockAt: 8, ruinVariant: 7 },
  { art: 'town_garden', x: 0.55, y: 0.42, w: 0.135, unlockAt: 10, ruinVariant: 4 },
  { art: 'town_townhall', x: 0.3, y: 0.407, w: 0.14, unlockAt: 12, ruinVariant: 3 },
  // The Post Office — Wren the postmistress's home, referenced from the very first
  // order ("the post office took the other half"). Sits between the Town Hall
  // (0.30/0.407) and the Sawmill (0.47/0.291) on the upper diagonal; w < 0.12 keeps
  // it clear of the landmark-spacing rule. Restores at order 13, just after the hall.
  { art: 'town_postoffice', x: 0.405, y: 0.352, w: 0.115, unlockAt: 13, ruinVariant: 5 },
  { art: 'town_workshop', x: 0.53, y: 0.655, w: 0.125, unlockAt: 15, smoke: { dx: 0.16, dy: -0.75 }, ruinVariant: 1 },
  { art: 'town_farm', x: 0.65, y: 0.305, w: 0.135, unlockAt: 16, ruinVariant: 5 },
  // Joss's hut sits on the east shore, its stilt-deck out over the water
  { art: 'town_fisherhut', x: 0.85, y: 0.56, w: 0.125, unlockAt: 18, ruinVariant: 6, water: true },
  { art: 'town_sawmill', x: 0.47, y: 0.291, w: 0.13, unlockAt: 20, ruinVariant: 1 },
  { art: 'town_blacksmith', x: 0.47, y: 0.525, w: 0.125, unlockAt: 21, smoke: { dx: 0.05, dy: -0.8 }, ruinVariant: 2 },
  // the jetty runs from the SE point out into the bay
  { art: 'town_dock', x: 0.85, y: 0.71, w: 0.152, unlockAt: 22, ruinVariant: 5, water: true },
  { art: 'town_library', x: 0.39, y: 0.66, w: 0.13, unlockAt: 23, ruinVariant: 3 },
  // The Quarry — cut into the island's rocky western rim, where the boulders
  // meet the lanes. Its own painted ruin/wip art carries the pre-restore states
  // (ruinVariant is only the "show it before it's rebuilt" flag).
  { art: 'town_quarry', x: 0.18, y: 0.46, w: 0.12, unlockAt: 19, ruinVariant: 1 },
] as const;

/**
 * The Tailor's Cottage — home of the wardrobe/avatar picker (GDD §8.6). Weaver's
 * cottage on the quiet west lane. **Art-gated:** it joins the town only once its
 * sprite (`town_tailor`) exists, so nothing breaks before the art lands and the
 * no-collision test isn't triggered by an unplaced building. When the art ships,
 * validate this anchor against tests/town-layout.test.ts (spacing rule) and,
 * if needed, nudge x/y. Restores at order 14 (after the Post Office). See
 * docs/avatar-assets-to-generate.md for the sprite sheet spec.
 */
const TOWN_TAILOR: TownPiece = { art: 'town_tailor', x: 0.235, y: 0.6, w: 0.11, unlockAt: 14, ruinVariant: 1 };

export const TOWN_BUILDINGS_V2: readonly TownPiece[] = artUrl('town_tailor')
  ? [...TOWN_BUILDINGS_V2_BASE, TOWN_TAILOR]
  : TOWN_BUILDINGS_V2_BASE;

/** The ACTIVE world (all consumers read this; the gate picks per the art). */
export const TOWN_BUILDINGS: readonly TownPiece[] = MAP_V2 ? TOWN_BUILDINGS_V2 : TOWN_BUILDINGS_V1;

/**
 * Buildings that live outside TOWN_BUILDINGS (painted directly onto the scene,
 * not composited sprites) but still have a story return point. The lighthouse
 * relights at order 9 — the beacon story beat (see map-view's painted lighthouse).
 */
const SPECIAL_RETURNS: Record<string, number> = {
  prop_lighthouse: 9,
  // The Tailor's Cottage returns at order 14. Declared here too so returnsAt()
  // resolves it even while the building is art-gated out of TOWN_BUILDINGS.
  town_tailor: 14,
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
  town_cottage: 'The Old Cottage',
  town_bakery: 'Bran’s Bakery',
  prop_well: 'The Village Well',
  town_market: 'Market Square',
  town_garden: 'The Garden',
  town_townhall: 'The Town Hall',
  town_postoffice: 'The Post Office',
  town_workshop: 'The Workshop',
  town_farm: 'Meadow Farm',
  town_fisherhut: 'Joss’s Hut',
  town_sawmill: 'The Sawmill',
  town_blacksmith: 'The Forge',
  town_dock: 'North Docks',
  town_library: 'The Library',
  town_quarry: 'The Quarry',
  town_tailor: 'The Tailor’s Cottage',
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
interface BoatPiece {
  art: string;
  x: number;
  y: number;
  w: number;
  stage: number;
}
export const TOWN_BOATS_V1: readonly BoatPiece[] = [
  { art: 'boat_row', x: 0.92, y: 0.93, w: 0.09, stage: 2 },
  { art: 'boat_fishing_s', x: 0.68, y: 0.965, w: 0.12, stage: 3 },
  { art: 'boat_sail_s', x: 0.08, y: 0.96, w: 0.1, stage: 4 },
] as const;
/** V2: the painted plates already carry the working harbour (the dock sprite
 * ships with its own moored boat), so the free-floating boat props are retired
 * for the V2 world — they read as clutter on the open sea. */
export const TOWN_BOATS_V2: readonly BoatPiece[] = [] as const;
export const TOWN_BOATS: readonly BoatPiece[] = MAP_V2 ? TOWN_BOATS_V2 : TOWN_BOATS_V1;

/**
 * Nature and street furniture fill in as the town heals (by homestead stage).
 * Every anchor is validated against the painted plate: on land (except coastal
 * pieces), and clear of building sprite columns so nothing hides behind a roof.
 */
export const TOWN_NATURE_V1: readonly (TownPiece & { stage: number })[] = [
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
  { art: 'prop_lamp', x: 0.55, y: 0.665, w: 0.026, unlockAt: 0, stage: 3 },
  { art: 'prop_lamp', x: 0.47, y: 0.68, w: 0.026, unlockAt: 0, stage: 3 },
  { art: 'prop_bench', x: 0.43, y: 0.61, w: 0.052, unlockAt: 0, stage: 3 },
  { art: 'prop_bench', x: 0.52, y: 0.7, w: 0.052, unlockAt: 0, stage: 4 },
  // ── wildflower beds + flowering bushes brighten the open middle
  { art: 'terrain_flowers1', x: 0.6, y: 0.61, w: 0.055, unlockAt: 0, stage: 2 },
  { art: 'terrain_flowers2', x: 0.395, y: 0.56, w: 0.055, unlockAt: 0, stage: 2 },
  { art: 'terrain_flowers1', x: 0.72, y: 0.56, w: 0.05, unlockAt: 0, stage: 3 },
  { art: 'tree_flowerbush', x: 0.45, y: 0.55, w: 0.05, unlockAt: 0, stage: 3 },
  { art: 'tree_flowerbush', x: 0.42, y: 0.5, w: 0.048, unlockAt: 0, stage: 3 },
  { art: 'tree_flowerbush', x: 0.72, y: 0.64, w: 0.048, unlockAt: 0, stage: 4 },
  // ── fences frame the farm and the garden once they're tended
  { art: 'fence_wood', x: 0.135, y: 0.655, w: 0.1, unlockAt: 16, stage: 0 },
  { art: 'fence_wood', x: 0.7, y: 0.555, w: 0.095, unlockAt: 10, stage: 0 },
  // ── working clutter by the dock + the square
  { art: 'prop_barrel', x: 0.53, y: 0.78, w: 0.034, unlockAt: 0, stage: 4 },
  { art: 'prop_crate', x: 0.55, y: 0.792, w: 0.034, unlockAt: 0, stage: 4 },
  { art: 'prop_barrel', x: 0.44, y: 0.64, w: 0.032, unlockAt: 0, stage: 4 },
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
export const TOWN_TERRAIN_V1: readonly TownPiece[] = [
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
  // A small jetty grounds on the south-east beach. (The old dock_straight +
  // dock_end pair was removed — on the painted plate it floated as a stray raft
  // of planks out in open water, disconnected from any shore; the town_dock
  // building is the real working pier.)
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
  { art: 'terrain_flowers1', name: 'Wildflower bed', cost: 30, w: 0.06 },
  { art: 'tree_oak', name: 'Old oak', cost: 45, w: 0.07 },
  { art: 'prop_tidepool', name: 'Tide pool', cost: 40, w: 0.07 },
  { art: 'prop_shorerock', name: 'Shore rocks', cost: 20, w: 0.05 },
] as const;

/**
 * V2 dressing is deliberately minimal — the painted plates carry the terrain,
 * paths, trees and beach; the game only adds working props. ⚑ tuned in the
 * refinement pass against the real imported plate.
 */
export const TOWN_NATURE_V2: readonly (TownPiece & { stage: number })[] = [
  // The plates carry the terrain/paths/trees; the only dressing the game adds is
  // STREET LANTERNS at the path junctions — they light the town at dusk/night
  // (warm ground pool + glowing head + glow re-emit, see map-view prop_lamp),
  // and read as quiet posts by day. They come on as the town heals (stage).
  // Buildings-only at night: the free-standing lamp posts drew too small to read
  // against the painted plate, so their head-glows floated as orphaned dots that
  // didn't line up with anything. Night light now comes ONLY from the buildings'
  // own painted lanterns/windows (measured per-light in map-view).
] as const;
export const TOWN_TERRAIN_V2: readonly TownPiece[] = [] as const;

export const TOWN_NATURE: readonly (TownPiece & { stage: number })[] = MAP_V2 ? TOWN_NATURE_V2 : TOWN_NATURE_V1;
export const TOWN_TERRAIN: readonly TownPiece[] = MAP_V2 ? TOWN_TERRAIN_V2 : TOWN_TERRAIN_V1;

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
 * Named scene anchors that aren't tied to a single sprite. Effects that draw at
 * a "place" read from here (or anchorOf) so they track the composition.
 */

/** The civic plaza — the well/market heart, for the night hearth-lift + glow. */
export const PLAZA = MAP_V2 ? ({ x: 0.57, y: 0.48 } as const) : ({ x: 0.5, y: 0.52 } as const);

/** The painted-in lighthouse (4-state ladder): V1 east point / V2 NE islet. */
export const LIGHTHOUSE_ANCHOR = MAP_V2
  ? ({ x: 0.82, y: 0.335, w: 0.13 } as const)
  : ({ x: 0.94, y: 0.59, w: 0.15 } as const);

/** Sky-space effects (viewport fractions). */
export const SKY_ANCHORS = {
  godRays: { x: 0.78, y: 0.14 },
  stargaze: { x: 0.8, y: 0.16 },
} as const;

/** Open-ground bands for weather-memory scatter (clear of the buildings). */
export const GROUND_BANDS = {
  snowDrifts: { x0: 0.08, x1: 0.94, y0: 0.72, y1: 0.8 },
  puddles: { x0: 0.18, x1: 0.6, y0: 0.66, y1: 0.8 },
  bloomShore: { x0: 0.24, x1: 0.62, y0: 0.82, y1: 0.88 },
} as const;
