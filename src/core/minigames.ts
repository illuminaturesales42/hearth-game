/**
 * Village Life — the post-story mini-game layer. Once Emberhollow's story is
 * told, its buildings open their doors: tap one on the map to play a small,
 * building-themed game. Pure + seeded so every outcome is deterministic and
 * testable, and — like the rest of Hearth — attempts come from time and living
 * well, never money. Exactly one guaranteed "heart" reward per run; everything
 * kept, nothing gambled.
 *
 * This file is the engine (game maths + shared unlock/token/reward rules); the
 * catalogue lives in ../data/minigames, and Game wires it into the save.
 */
import type { ChainId, MinigameState } from './types';

// ---- tuning (remote-config shaped; real values are the source of truth) ----
/** Energy to enter one mini-game — a real late-game sink (a producer tap is 1). */
export const MINIGAME_ENERGY_COST = 4;
/** Free attempts granted each day — generous enough to actually learn a game. */
export const MINIGAME_BASE_TOKENS = 3;
/** Attempts never bank higher than this — a gentle daily ceiling. */
export const MINIGAME_MAX_TOKENS = 6;
/** Energy a day of mini-games can pay out, so play never out-earns real life. */
export const MINIGAME_EMBER_CAP = 15;

function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------- shared state helpers (all pure) ----------

export function initialMinigames(day: string): MinigameState {
  return { unlocked: [], lastUnlockDay: null, day, tokens: MINIGAME_BASE_TOKENS, emberToday: 0, wishes: [], bests: {} };
}

/** Record a personal best (keeps the higher value). Pure. */
export function recordBest(s: MinigameState, id: string, score: number): { state: MinigameState; isBest: boolean } {
  const prev = s.bests?.[id] ?? -Infinity;
  if (score <= prev) return { state: s, isBest: false };
  return { state: { ...s, bests: { ...(s.bests ?? {}), [id]: score } }, isBest: true };
}

/** Reset the daily token + ember pool when the day turns. Idempotent. */
export function rolloverMinigames(s: MinigameState, today: string): MinigameState {
  if (s.day === today) return s;
  return { ...s, day: today, tokens: MINIGAME_BASE_TOKENS, emberToday: 0 };
}

/** The story is complete once every order has been delivered. */
export function storyComplete(orderIndex: number, storyLength: number): boolean {
  return orderIndex >= storyLength;
}

/**
 * Whether a game's building is eligible to open. Games unlock progressively as
 * Emberhollow rebuilds: 'story' games open the moment their building returns
 * (the well at order 6, the beacon at 9); 'l2' games ask that their returned
 * building also be cared for (upgraded), which keeps coins meaningful.
 */
export function isEligible(unlock: 'story' | 'l2', buildingReturned: boolean, upgradeTier: number): boolean {
  if (!buildingReturned) return false;
  return unlock === 'story' || upgradeTier >= 1;
}

export type UnlockOutcome = 'opened' | 'already' | 'ineligible';

/**
 * Open a game's doors once its building is eligible. Pacing comes from the
 * eligibility gate itself — 'story' games open when their building returns,
 * 'l2' games when their building is cared for (a coin-paced upgrade) — so
 * there's no extra daily throttle to frustrate a player who's earned the
 * unlock. (`lastUnlockDay` is still stamped for save compatibility, but
 * nothing reads it any more — vestigial from the removed one-per-day gate.)
 */
export function tryUnlock(
  s: MinigameState,
  gameId: string,
  eligible: boolean,
  today: string,
): { state: MinigameState; outcome: UnlockOutcome } {
  if (s.unlocked.includes(gameId)) return { state: s, outcome: 'already' };
  if (!eligible) return { state: s, outcome: 'ineligible' };
  return {
    state: { ...s, unlocked: [...s.unlocked, gameId], lastUnlockDay: today },
    outcome: 'opened',
  };
}

export function isUnlocked(s: MinigameState, gameId: string): boolean {
  return s.unlocked.includes(gameId);
}

/** Top up an attempt for living well (a real-world action). Capped. */
export function grantToken(s: MinigameState): MinigameState {
  if (s.tokens >= MINIGAME_MAX_TOKENS) return s;
  return { ...s, tokens: s.tokens + 1 };
}

export function spendToken(s: MinigameState): MinigameState {
  return { ...s, tokens: Math.max(0, s.tokens - 1) };
}

/** Bank ember energy up to today's cap; returns how much was actually granted. */
export function addEmber(s: MinigameState, want: number): { state: MinigameState; granted: number } {
  const granted = Math.max(0, Math.min(want, MINIGAME_EMBER_CAP - s.emberToday));
  return { state: { ...s, emberToday: s.emberToday + granted }, granted };
}

// ---------- shared feel helpers ----------

/**
 * The cosy combo rule: a hit climbs one step; a miss drops ONE step, never to
 * zero-from-height ("soft decay") — streaks feel alive without a miss ever
 * reading as punishment. Pure; every timed game shares it.
 */
export function comboStep(combo: number, hit: boolean): number {
  return hit ? combo + 1 : Math.max(0, combo - 1);
}

// ---------- rewards ----------

export interface MgReward {
  coins: number;
  items: { chain: ChainId; level: number }[];
  ember: number;
  /** A short line naming the run's one guaranteed keepsake (for the result card). */
  heart: string;
}

// ---------- 1) Wishing Well — three pebbles, rising wishes ----------
// One go = three pebbles. Each centre hit deepens the wish-multiplier that
// applies to the WHOLE run's payout — bank after two, or reach for the third
// (the only "risk" is that the multiplier could have been higher). Floor
// guaranteed, ceiling earned. A wish "takes root" as a seed.

export interface WellResult extends MgReward {
  centres: number; // how many pebbles found the heart ring
  wishIndex: number; // into the data WISHES table
}

export const WELL_SLOTS = 5;
export const WELL_PEBBLES = 3;
/** Per-ring coin value — visible on the water so the reach is legible. */
export const WELL_COINS = [4, 6, 10, 6, 4];
/** The run's wish-multiplier by centre hits: ×1 → ×1.5 → ×2 → ×2.5. */
export const WELL_MULT = [1, 1.5, 2, 2.5];

/**
 * The whole run's reward: the slots each pebble landed (0..4, centre = 2),
 * summed, then the centre-streak multiplier deepens everything. Banking after
 * fewer pebbles just sums fewer — still no-fail; every run roots a seed.
 */
export function wishingWellReward(slots: readonly number[], seed: number, wishCount: number): WellResult {
  const rand = lcg(seed);
  const clamped = slots.map((s) => Math.max(0, Math.min(WELL_SLOTS - 1, Math.round(s))));
  const centres = clamped.filter((s) => s === 2).length;
  const mult = WELL_MULT[Math.min(centres, WELL_MULT.length - 1)]!;
  const base = clamped.reduce((n, s) => n + WELL_COINS[s]!, 0);
  const coins = Math.max(6, Math.round(base * mult));
  const items: { chain: ChainId; level: number }[] = [
    {
      chain: 'seeds',
      level: centres >= 3 ? 3 : centres === 2 ? 2 : centres === 1 ? (rand() < 0.5 ? 2 : 1) : rand() < 0.4 ? 1 : 0,
    },
  ];
  if (centres >= 2) items.push({ chain: 'seeds', level: 1 });
  const ember = centres >= 1 ? 2 : 1;
  const wishIndex = wishCount > 0 ? Math.floor(rand() * wishCount) : -1;
  return {
    coins,
    items,
    ember,
    heart:
      centres >= 3
        ? 'Three true drops — the wish took the deepest root of all.'
        : centres >= 1
          ? 'The wish took deep root — a fine seedling.'
          : 'A wish taken root — a seed to plant.',
    centres,
    wishIndex,
  };
}

/** 0..100 personal best — centres dominate, close rings still count. */
export function wellScore(slots: readonly number[]): number {
  const ring = slots.reduce((n, s) => n + (25 - Math.abs(Math.max(0, Math.min(4, Math.round(s))) - 2) * 8), 0);
  const centres = slots.filter((s) => Math.round(s) === 2).length;
  return Math.min(100, ring + centres * 9);
}

// ---------- 2) Beacon Drop — a light-ember plinkos down to the boats -------
// Lighthouse-themed. The ember bounces down peg rows into a slot; the centre is
// the day's heart. Coastal reward → the fish chain (revived).

export const BEACON_ROWS = 8;
export const BEACON_SLOTS = BEACON_ROWS + 1;

/** The seeded left/right bounce sequence — the 3 seconds of suspense. */
export function beaconPath(seed: number, rows = BEACON_ROWS): (0 | 1)[] {
  const rand = lcg(seed);
  return Array.from({ length: rows }, () => (rand() < 0.5 ? 0 : 1));
}

/** Final slot 0..rows from a bounce path (number of rights). */
export function beaconSlot(path: readonly (0 | 1)[]): number {
  return path.reduce<number>((n, d) => n + d, 0);
}

/**
 * Player-aimed drop: the ember is released from a chosen slot (0..8) and the
 * seed adds a small bounce drift, so aim dominates but a little luck remains.
 * Mostly lands where aimed; occasionally drifts ±1, rarely ±2. Deterministic
 * given (targetSlot, seed).
 */
export function beaconDrop(targetSlot: number, seed: number): number {
  const rand = lcg(seed);
  const r = rand();
  const mag = r < 0.6 ? 0 : r < 0.88 ? 1 : 2;
  const dir = rand() < 0.5 ? -1 : 1;
  return Math.max(0, Math.min(BEACON_ROWS, Math.round(targetSlot + dir * mag)));
}

/** 0..100 "how close to the heart" — the beacon's personal-best metric (centre = 100). */
export function beaconScore(slot: number, goldenHit = false): number {
  const centre = BEACON_ROWS / 2;
  return Math.min(100, Math.round((1 - Math.abs(slot - centre) / centre) * 88) + (goldenHit ? 12 : 0));
}

export function beaconReward(slot: number, goldenHit = false, rows = BEACON_ROWS): MgReward {
  const centre = rows / 2;
  const dist = Math.abs(slot - centre); // 0 at centre, up to rows/2 at an edge
  const closeness = 1 - dist / centre; // 1 centre → 0 edge
  const coins = 6 + Math.round(closeness * 12) + (goldenHit ? 8 : 0); // 6..26
  // Fish revived: centre lands a fine catch (heart); the golden peg deepens it.
  const baseLevel = dist === 0 ? 2 : dist <= 2 ? 1 : 0;
  const items: { chain: ChainId; level: number }[] = [
    { chain: 'fish', level: Math.min(3, baseLevel + (goldenHit ? 1 : 0)) },
  ];
  const ember = dist === 0 || goldenHit ? 2 : 1;
  return {
    coins,
    items,
    ember,
    heart:
      goldenHit && dist === 0
        ? 'The golden light, dead centre — a catch for the chronicle.'
        : goldenHit
          ? 'The ember kissed the golden peg — the light burned brighter.'
          : dist === 0
            ? 'Dead centre — the finest catch the light drew in.'
            : 'The light drew a good catch to the boats.',
  };
}

// -- the pegfield: a fresh, hand-feeling board every drop --

export interface BeaconPeg {
  x: number; // 0..1 of board width
  y: number; // 0..1 of the pegfield's height band
  r: number; // radius as a fraction of board width
  kind: 'peg' | 'bumper' | 'golden' | 'mover';
}

/** Ember radius as a fraction of board width — pegfield spacing derives from it. */
export const BEACON_EMBER_R = 0.027;

/**
 * A seeded, MIRROR-SYMMETRIC pegfield: a clean quincunx (staggered rows,
 * left-right symmetric about the centre line) rather than a jittered scatter,
 * with a symmetric PAIR of round BUMPERS, one centred MOVER (the UI swings it
 * side to side), and one centred GOLDEN beacon peg (bonus when struck). The seed
 * tunes spacing / row-count / quincunx phase so replays still differ, but every
 * board reads as a balanced, symmetric arrangement. Deterministic per seed.
 * Invariants (tested): spacing ≥ ember-diameter × 1.6 between peg surfaces,
 * everything inside [0.06, 0.94] × [0, 1], exactly one golden, ≥2 bumpers.
 */
export function beaconPegField(seed: number): BeaconPeg[] {
  const rand = lcg(seed);
  let pegs: BeaconPeg[] = [];
  const PEG_R = 0.018;
  const clearance = BEACON_EMBER_R * 2 * 1.6;
  const clashes = (x: number, y: number, r: number): boolean =>
    pegs.some((p) => Math.hypot(p.x - x, (p.y - y) * 1.15) - (p.r + r) < clearance);
  const add = (x: number, y: number, r: number, kind: BeaconPeg['kind']): void => {
    if (!clashes(x, y, r)) pegs.push({ x, y, r, kind });
  };
  // clear a symmetric slot for a special peg, then it always fits
  const clearAround = (x: number, y: number, r: number): void => {
    pegs = pegs.filter((p) => Math.hypot(p.x - x, (p.y - y) * 1.15) - (p.r + r) >= clearance);
  };

  // Seed-tuned but symmetric: spacing, row count, and which rows carry a centre peg.
  const rows = rand() < 0.5 ? 7 : 8;
  const gap = 0.14 + rand() * 0.02; // horizontal peg spacing (≥ min clearance)
  const phase = rand() < 0.5 ? 0 : 1;
  const half = 0.42; // pegs within 0.5 ± 0.42 → x ∈ [0.08, 0.92]

  for (let row = 0; row < rows; row++) {
    const y = (row + 0.6) / (rows + 0.4);
    const centred = (row + phase) % 2 === 0;
    if (centred) {
      add(0.5, y, PEG_R, 'peg');
      for (let k = 1; k * gap <= half + 1e-9; k++) {
        add(0.5 - k * gap, y, PEG_R, 'peg');
        add(0.5 + k * gap, y, PEG_R, 'peg');
      }
    } else {
      for (let k = 0; (k + 0.5) * gap <= half + 1e-9; k++) {
        add(0.5 - (k + 0.5) * gap, y, PEG_R, 'peg');
        add(0.5 + (k + 0.5) * gap, y, PEG_R, 'peg');
      }
    }
  }

  // A symmetric PAIR of bumpers, mid-board, off the centre line.
  const bumpY = 0.42 + rand() * 0.1;
  const bumpX = 0.24 + rand() * 0.06;
  for (const bx of [0.5 - bumpX, 0.5 + bumpX]) {
    clearAround(bx, bumpY, 0.045);
    pegs.push({ x: bx, y: bumpY, r: 0.045, kind: 'bumper' });
  }

  // one centred mover, upper-mid — the UI swings it; physics reads its live position
  const movY = 0.16 + rand() * 0.08;
  clearAround(0.5, movY, 0.026);
  pegs.push({ x: 0.5, y: movY, r: 0.026, kind: 'mover' });

  // one centred golden beacon peg — promote the centre peg nearest mid-board,
  // or plant one on the axis if this run's mid rows are offset.
  const centreCandidates = pegs
    .filter((p) => p.kind === 'peg' && Math.abs(p.x - 0.5) < 1e-6 && p.y > 0.35 && p.y < 0.78)
    .sort((a, b) => Math.abs(a.y - 0.56) - Math.abs(b.y - 0.56));
  if (centreCandidates.length) {
    const pick = centreCandidates[0]!;
    pick.kind = 'golden';
    pick.r = 0.024;
  } else {
    clearAround(0.5, 0.56, 0.024);
    pegs.push({ x: 0.5, y: 0.56, r: 0.024, kind: 'golden' });
  }
  return pegs;
}

// ---------- 3) Strike While Hot — the forge whack-a-mole ----------
// Blacksmith-themed. Hotspots bloom on the forge grid; strike them before they
// cool. No punishment for a miss. Copper revived; accuracy earns more.

export const FORGE_CELLS = 9; // 3×3 forge grid
export const FORGE_DURATION_MS = 18_000;
/** The sweet-heat glow: the middle stretch of a lump's life when a strike is "perfect". */
export const FORGE_SWEET_FRAC = 0.4;

export interface ForgeSpawn {
  cell: number; // 0..FORGE_CELLS-1
  atMs: number; // when it lights
  ttlMs: number; // how long it stays hot
}

/**
 * A deterministic bloom schedule in three rising waves — the forge finds its
 * rhythm: spawns arrive quicker and cool faster as the round builds, and the
 * last stretch is a white-hot finale with pairs blooming together.
 */
export function forgeSchedule(seed: number, count = 20, durationMs = FORGE_DURATION_MS): ForgeSpawn[] {
  const rand = lcg(seed);
  const out: ForgeSpawn[] = [];
  let last = -1;
  const finaleStart = durationMs - 4000;
  const rampCount = count - 4; // the last 4 are the finale pairs
  for (let i = 0; i < rampCount; i++) {
    const t = i / rampCount;
    // ease-in density: early spawns spread, late spawns crowd (the ramp)
    const atMs = Math.round((finaleStart - 1400) * (1 - Math.pow(1 - t, 1.6))) + Math.floor(rand() * 240);
    let cell = Math.floor(rand() * FORGE_CELLS);
    if (cell === last) cell = (cell + 1) % FORGE_CELLS; // avoid immediate repeats
    last = cell;
    const ttlMs = Math.round(1400 - t * 550) + Math.floor(rand() * 220); // 1400 → ~850
    out.push({ cell, atMs, ttlMs });
  }
  // the white-hot finale: two simultaneous pairs
  for (let p = 0; p < 2; p++) {
    const atMs = finaleStart + p * 1600 + Math.floor(rand() * 200);
    const a = Math.floor(rand() * FORGE_CELLS);
    let b = Math.floor(rand() * FORGE_CELLS);
    if (b === a) b = (b + 4) % FORGE_CELLS;
    out.push({ cell: a, atMs, ttlMs: 950 }, { cell: b, atMs: atMs + 120, ttlMs: 950 });
  }
  return out.sort((x, y) => x.atMs - y.atMs);
}

/**
 * Reward: floor guaranteed, ceiling earned. Accuracy sets the coins; PERFECT
 * strikes (on the sweet-heat glow) forge the finer copper; a long streak adds
 * an extra ingot. Best play ≈ 4× the floor.
 */
export function forgeReward(hits: number, count: number, perfects = 0, bestCombo = 0): MgReward {
  const acc = count > 0 ? Math.min(1, hits / count) : 0;
  const coins = 6 + Math.round(acc * 14) + Math.min(6, perfects); // 6..26
  const items: { chain: ChainId; level: number }[] = [{ chain: 'copper', level: 1 }];
  if (perfects >= 8 && acc >= 0.7) items.push({ chain: 'copper', level: 3 });
  else if (perfects >= 4 || acc >= 0.8) items.push({ chain: 'copper', level: 2 });
  else if (acc >= 0.5) items.push({ chain: 'copper', level: 1 });
  if (bestCombo >= 6) items.push({ chain: 'copper', level: 2 }); // the streak ingot
  const ember = acc >= 0.6 ? 2 : 1;
  return {
    coins,
    items,
    ember,
    heart:
      perfects >= 8 && acc >= 0.7
        ? 'Every strike on the glow — masterwork copper.'
        : acc >= 0.8
          ? 'Struck true — a bar of bright copper.'
          : 'Good, honest work at the forge.',
  };
}

/** Personal best: hits + perfects + streak all count. */
export function forgeScore(hits: number, perfects: number, bestCombo: number): number {
  return hits * 5 + perfects * 4 + bestCombo * 2;
}

// ---------- 4) Joss's Catch (fisher hut) — bobber timing ----------
// Cast, wait for the dip, strike. The closer to the dip, the deeper the fish.

export function fishBite(seed: number): { delayMs: number; windowMs: number } {
  const rand = lcg(seed);
  // tighter dead-air: the tell comes sooner, the tension stays
  return { delayMs: 1200 + Math.floor(rand() * 1600), windowMs: 700 };
}

/** The reel stage: a perfect-zone drifts across a bar for ~2s after the strike. */
export const CATCH_REEL_MS = 2000;
export const CATCH_REEL_ZONE = 0.22; // the zone's width as a fraction of the bar
export const CATCH_REEL_PERFECT = 0.07; // the smaller inner band → the prize catch

/**
 * quality 0..1 = the strike; reelQuality 0..1 = the reel stage. The catch is
 * their blend. A dead-centre reel (the inner band, `bullseye`) hauls up a prize.
 * A botched catch pays NO coin — just seaweed, a usable item for later — so a
 * loss still gives something, but not money.
 */
export function catchReward(quality: number, reelQuality = 0, bullseye = false): MgReward {
  const q = Math.max(0, Math.min(1, quality));
  const r = Math.max(0, Math.min(1, reelQuality));
  const blend = q * 0.55 + r * 0.45;
  // A loss (both stages poor, and not a bullseye): seaweed instead of coins.
  if (blend < 0.3 && !bullseye) {
    return {
      coins: 0,
      items: [{ chain: 'seaweed', level: 0 }],
      ember: 1,
      heart: 'The line comes up with only a tangle of seaweed — good for the pot later.',
    };
  }
  if (bullseye) {
    return {
      coins: 16 + Math.round(blend * 18), // a premium purse
      items: [
        { chain: 'fish', level: 3 },
        { chain: 'fish', level: 2 },
      ],
      ember: 3,
      heart: 'Dead-centre on the golden water — Joss hauls up a prize catch!',
    };
  }
  const level = q >= 0.75 && r >= 0.75 ? 3 : blend >= 0.6 ? 2 : 1;
  return {
    coins: 6 + Math.round(blend * 18), // 6..24
    items: [{ chain: 'fish', level }],
    ember: blend >= 0.55 ? 2 : 1,
    heart:
      level === 3
        ? 'A deep-water rarity — Joss will talk about this one.'
        : level === 2
          ? 'A fine fish, landed clean.'
          : 'A good catch off Joss’s line.',
  };
}

// ---------- 5) The Foraging Expedition (garden) — a fog-covered dig ----------
// Uncover a corner of the coast tile by tile, keep everything, head home when you
// like. Revives the herbs/flowers/honey chains; a heart tile hides a honeycomb.

export type ForageKind = 'item' | 'coins' | 'ember' | 'view' | 'heart' | 'clearing';
export const FORAGE_SIZE = 25; // 5×5
export const FORAGE_COLS = 5;
export const FORAGE_STEPS = 9; // fewer footsteps than tiles — where you tread matters
const FORAGE_ITEM_CHAINS: readonly ChainId[] = ['herbs', 'flowers', 'honey'];

export interface ForageFieldResult {
  kinds: ForageKind[];
  heartIndex: number;
  /** Chebyshev distance from each tile to the heart — the UI's warmer/colder glow. */
  warmth: number[];
}

/** Chebyshev (king-move) distance between two tile indices on the 5×5. */
export function forageDistance(a: number, b: number, cols = FORAGE_COLS): number {
  return Math.max(Math.abs((a % cols) - (b % cols)), Math.abs(Math.floor(a / cols) - Math.floor(b / cols)));
}

export function forageField(seed: number): ForageFieldResult {
  const rand = lcg(seed);
  const bag: ForageKind[] = [];
  const add = (k: ForageKind, n: number) => {
    for (let i = 0; i < n; i++) bag.push(k);
  };
  add('item', 8);
  add('coins', 5);
  add('ember', 3);
  add('clearing', 2); // a clearing opens its neighbours in a rush
  add('view', FORAGE_SIZE - 1 - 8 - 5 - 3 - 2);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  const heartIndex = Math.floor(rand() * FORAGE_SIZE);
  const kinds: ForageKind[] = [];
  let b = 0;
  for (let i = 0; i < FORAGE_SIZE; i++) kinds.push(i === heartIndex ? 'heart' : bag[b++]!);
  const warmth = kinds.map((_, i) => forageDistance(i, heartIndex));
  return { kinds, heartIndex, warmth };
}

/**
 * The run's banked reward. Finding the honeycomb heart with footsteps to spare
 * earns a forager's bonus — the walk home is lighter (+coins per unspent step).
 * Everything found is always kept (no-fail); efficiency only adds.
 */
export function forageReward(
  found: { coins: number; items: { chain: ChainId; level: number }[]; ember: number },
  heartFound: boolean,
  stepsLeft: number,
): MgReward {
  const bonus = heartFound ? stepsLeft * 3 : 0;
  return {
    coins: Math.max(6, found.coins + bonus),
    items: found.items.length ? found.items : [{ chain: 'herbs', level: 0 }],
    ember: Math.max(1, found.ember),
    heart: heartFound
      ? stepsLeft > 0
        ? 'Straight to the honeycomb — a forager’s instinct.'
        : 'The honeycomb, found at last — worth every step.'
      : 'You came home with your basket full — and a story or two.',
  };
}

/** What a single uncovered tile yields (a partial reward, summed by the UI). */
export function forageTile(
  seed: number,
  i: number,
  kind: ForageKind,
): {
  coins: number;
  items: { chain: ChainId; level: number }[];
  ember: number;
} {
  const rand = lcg(seed * 131 + i * 977 + 7);
  switch (kind) {
    case 'item':
      return {
        coins: 0,
        items: [
          { chain: FORAGE_ITEM_CHAINS[Math.floor(rand() * FORAGE_ITEM_CHAINS.length)]!, level: rand() < 0.35 ? 1 : 0 },
        ],
        ember: 0,
      };
    case 'coins':
      return { coins: 5 + Math.floor(rand() * 10), items: [], ember: 0 };
    case 'ember':
      return { coins: 0, items: [], ember: 1 };
    case 'heart':
      return { coins: 12, items: [{ chain: 'honey', level: 2 }], ember: 2 };
    case 'clearing':
      return { coins: 3, items: [], ember: 0 }; // the clearing's gift is what it reveals
    default:
      return { coins: 0, items: [], ember: 0 }; // a lovely view — the empty tile IS content
  }
}

// ---------- 6) Sorting the Stacks (library) — a pairs match ----------
// Match the shelves to set the library right; a clean sort turns up a fine volume.

export const STACKS_PAIRS = 8;
/** A strong previous best deals a bigger shelf — a gentle, invisible ramp. */
export const STACKS_PAIRS_RAMPED = 10;

/** How many pairs this play deals, from the player's best (score = 40 - flips). */
export function stacksPairsFor(best: number | undefined): number {
  // best ≥ 22 means a past clear in ≤ 18 flips on the 8-pair shelf — ramp up
  return best !== undefined && best >= 22 ? STACKS_PAIRS_RAMPED : STACKS_PAIRS;
}

export function stacksDeck(seed: number, pairs = STACKS_PAIRS): number[] {
  const rand = lcg(seed);
  const deck: number[] = [];
  for (let v = 0; v < pairs; v++) deck.push(v, v);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [deck[i], deck[j]] = [deck[j]!, deck[i]!];
  }
  return deck;
}

/**
 * Streak-driven: consecutive matches (memory skill) raise the finer volumes;
 * flips only ever ADD coins-per-efficiency, never shame. No-fail floor holds.
 */
export function stacksReward(flips: number, bestStreak = 0, pairs = STACKS_PAIRS): MgReward {
  const clean = flips <= pairs * 2 + 2; // near-perfect recall
  const coins = 12 + (clean ? 6 : 0) + Math.min(6, bestStreak * 2); // 12..24
  const items: { chain: ChainId; level: number }[] = [{ chain: 'books', level: 1 }];
  if (bestStreak >= 5) items.push({ chain: 'books', level: 3 });
  else if (bestStreak >= 3 || clean) items.push({ chain: 'books', level: 2 });
  return {
    coins,
    items,
    ember: clean || bestStreak >= 3 ? 2 : 1,
    heart:
      bestStreak >= 5
        ? 'Five shelves in a row from memory — a librarian born.'
        : clean
          ? 'Every shelf in order — a scholar’s eye.'
          : 'The stacks are sorted, near enough.',
  };
}

// ---------- 7) The Saw Song (sawmill) — rhythm lanes ----------
// Guitar-hero-hearted: logs ride five flume lanes down to the blade line; saw
// each as it crosses. A missed log just drifts on — no-fail — but clean cuts
// build a combo. Wood revived; rhythm earns the finer timber.

export const SAWMILL_LANES = 5;
export const SAWMILL_DURATION_MS = 36_000;
export const SAWMILL_FALL_MS = 3400; // top → blade line travel time (an easy read)
export const SAWMILL_WINDOW_MS = 560; // generous hit window centred on the line
export const SAWMILL_PERFECT_MS = 170; // the inner "clean cut" window
/** How long a hold-log must be held across the line. */
export const SAWMILL_HOLD_MS = 900;

export type SawmillNote = 'log' | 'hold' | 'strum';

export interface SawmillSpawn {
  lane: number; // 0..SAWMILL_LANES-1 (strum spans all lanes)
  atMs: number; // when the log enters its lane
  kind: SawmillNote;
}

/**
 * Deterministic log schedule with a real crescendo: three rising waves (denser
 * and same-lane repeats allowed later), a few long HOLD logs (press-and-hold to
 * ride the saw through), late-wave CHORDS (two lanes on one beat), and a single
 * all-lane BIG STRUM to end the song. No two logs ever overlap on one flume.
 */
export function sawmillSchedule(seed: number, count = 24, durationMs = SAWMILL_DURATION_MS): SawmillSpawn[] {
  const rand = lcg(seed);
  const out: SawmillSpawn[] = [];
  const laneFree: number[] = Array.from({ length: SAWMILL_LANES }, () => -Infinity);
  const minGap = Math.round(SAWMILL_FALL_MS * 0.6);
  const strumAt = durationMs - SAWMILL_FALL_MS - 600;
  const span = strumAt - 2600; // leave air before the finale
  let last = -1;
  let holds = 0;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    // ease-in density: the song finds its pace, then hurries home
    const atMs = Math.round(span * (1 - Math.pow(1 - t, 1.45))) + Math.floor(rand() * 240);
    const wave3 = t > 0.66;
    let lane = Math.floor(rand() * SAWMILL_LANES);
    for (let tries = 0; tries < SAWMILL_LANES; tries++) {
      const laneOk = atMs - laneFree[lane]! >= minGap;
      // wave 1-2: never the same lane twice; wave 3: repeats allowed (the rush)
      if (laneOk && (wave3 || lane !== last)) break;
      lane = (lane + 1) % SAWMILL_LANES;
    }
    const isHold = holds < 4 && t > 0.2 && t < 0.8 && rand() < 0.2;
    if (isHold) holds += 1;
    laneFree[lane] = atMs + (isHold ? SAWMILL_HOLD_MS : 0);
    last = lane;
    out.push({ lane, atMs, kind: isHold ? 'hold' : 'log' });
    // wave 3 chords: a second log on the same beat, a different lane
    if (wave3 && rand() < 0.4) {
      let l2 = (lane + 1 + Math.floor(rand() * (SAWMILL_LANES - 1))) % SAWMILL_LANES;
      for (let tries = 0; tries < SAWMILL_LANES; tries++) {
        if (l2 !== lane && atMs - laneFree[l2]! >= minGap) break;
        l2 = (l2 + 1) % SAWMILL_LANES;
      }
      if (l2 !== lane && atMs - laneFree[l2]! >= minGap) {
        laneFree[l2] = atMs;
        out.push({ lane: l2, atMs, kind: 'log' });
      }
    }
  }
  // the big strum: one wide log across every lane, the song's final note
  out.push({ lane: 0, atMs: strumAt, kind: 'strum' });
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** Personal-best metric: cuts, clean cuts, and the longest run all count. */
export function sawmillScore(hits: number, perfects: number, bestCombo: number): number {
  return hits * 10 + perfects * 5 + bestCombo * 2;
}

/**
 * No-fail reward: the timber always stacks — at least a wood billet — and
 * accuracy + clean cuts raise the cut to planks, then beams. Best play ≈ 4×.
 */
export function sawmillReward(hits: number, perfects: number, count: number, bestCombo = 0): MgReward {
  const acc = count > 0 ? Math.min(1, hits / count) : 0;
  const coins = 6 + Math.round(acc * 16) + Math.min(6, Math.floor(bestCombo / 2)); // 6..28
  const items: { chain: ChainId; level: number }[] = [{ chain: 'wood', level: 1 }];
  if (acc >= 0.5) items.push({ chain: 'wood', level: 2 });
  if (acc >= 0.8 && perfects >= 5) items.push({ chain: 'wood', level: 3 });
  if (acc >= 0.85 && perfects >= 7) items.push({ chain: 'wood', level: 3 });
  const ember = acc >= 0.6 ? 2 : 1;
  return {
    coins,
    items,
    ember,
    heart:
      acc >= 0.85 && perfects >= 7
        ? 'The whole song sawn clean — beams fit for a hall.'
        : acc >= 0.8 && perfects >= 5
          ? 'Every log sawn clean — timber fit for rafters.'
          : acc >= 0.5
            ? 'A good day’s milling — the stack grows.'
            : 'The flume ran on; the timber still stacks.',
  };
}

// ---------- 8) The Proving (bakery) — three loaves, three peaks ----------
// Bran's oven. Three loaves prove at their own seeded rates; each passes
// through pale → golden → dark. Pull a loaf at its golden moment and it's a
// good bake. The tension is watching three at once, not reflexes — every loaf
// still comes out of the oven, so a distracted round still feeds the village.

export const BAKE_LOAVES = 3;
export const BAKE_DURATION_MS = 22_000;

export type BakeGrade = 'pale' | 'golden' | 'dark';

export interface BakeLoaf {
  /** When this loaf reaches its golden centre. */
  peakMs: number;
  /** Half-width of the golden window: golden is peakMs ± this. */
  windowMs: number;
}

/**
 * A deterministic proving schedule. The loaves are staggered so their golden
 * moments never collide — the player is always able to catch all three, which
 * keeps this a game of attention rather than of impossible choices.
 */
export function bakeSchedule(seed: number, loaves = BAKE_LOAVES, durationMs = BAKE_DURATION_MS): BakeLoaf[] {
  const rand = lcg(seed);
  const out: BakeLoaf[] = [];
  // Evenly spaced peaks across the middle of the round, with a little jitter so
  // no two runs feel identical, then a gap guarantee so windows never overlap.
  const first = durationMs * 0.26;
  const gap = (durationMs * 0.62) / Math.max(1, loaves - 1);
  for (let i = 0; i < loaves; i++) {
    const jitter = (rand() - 0.5) * gap * 0.3;
    const peakMs = Math.round(first + i * gap + jitter);
    // Later loaves are a touch tighter — the oven gets hotter as it goes.
    const windowMs = Math.round(1100 - i * 130 + rand() * 180); // ~1.1s → ~0.85s
    out.push({ peakMs, windowMs });
  }
  return out.sort((a, b) => a.peakMs - b.peakMs);
}

/** How a loaf turned out, given when it was pulled. Never pulled = left to darken. */
export function bakeGrade(loaf: BakeLoaf, pullMs: number | null): BakeGrade {
  if (pullMs === null) return 'dark'; // forgotten in the oven — still bread
  if (pullMs < loaf.peakMs - loaf.windowMs) return 'pale';
  if (pullMs > loaf.peakMs + loaf.windowMs) return 'dark';
  return 'golden';
}

/**
 * No-fail reward: every loaf bakes into something. Goldens set the coins and
 * lift the harvest chain; a full tray of goldens is the baker's best.
 */
export function bakeReward(grades: readonly BakeGrade[]): MgReward {
  const golden = grades.filter((g) => g === 'golden').length;
  const pale = grades.filter((g) => g === 'pale').length;
  const total = Math.max(1, grades.length);
  const coins = 6 + golden * 6 + pale * 2; // 6..24 for a three-loaf tray
  const items: { chain: ChainId; level: number }[] = [{ chain: 'harvest', level: 1 }];
  if (golden >= 1) items.push({ chain: 'harvest', level: 2 });
  if (golden >= total) items.push({ chain: 'harvest', level: 3 }); // the perfect tray
  else if (golden >= 2) items.push({ chain: 'harvest', level: 2 });
  const ember = golden >= 2 ? 2 : 1;
  return {
    coins,
    items,
    ember,
    heart:
      golden >= total
        ? 'Three golden loaves — Bran will want the recipe.'
        : golden >= 2
          ? 'A good bake; the shop will smell wonderful.'
          : golden === 1
            ? 'One came out golden — a fair morning’s baking.'
            : 'Rustic, honest bread. It all gets eaten.',
  };
}

/** Personal best: goldens weigh most, pale loaves still count for something. */
export function bakeScore(grades: readonly BakeGrade[]): number {
  return grades.reduce((n, g) => n + (g === 'golden' ? 10 : g === 'pale' ? 3 : 1), 0);
}
