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
/** Free attempts granted each day. */
export const MINIGAME_BASE_TOKENS = 1;
/** Attempts never bank higher than this — a gentle daily ceiling. */
export const MINIGAME_MAX_TOKENS = 3;
/** Energy a day of mini-games can pay out, so play never out-earns real life. */
export const MINIGAME_EMBER_CAP = 5;

function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------- shared state helpers (all pure) ----------

export function initialMinigames(day: string): MinigameState {
  return { unlocked: [], lastUnlockDay: null, day, tokens: MINIGAME_BASE_TOKENS, emberToday: 0, wishes: [] };
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
 * Whether a game's building is eligible to open, before the one-per-day gate.
 * 'story' games open as soon as the tale is told; 'l2' games ask that their
 * building first be cared for (upgraded), which keeps coins meaningful.
 */
export function isEligible(unlock: 'story' | 'l2', storyDone: boolean, upgradeTier: number): boolean {
  if (!storyDone) return false;
  return unlock === 'story' || upgradeTier >= 1;
}

export type UnlockOutcome = 'opened' | 'already' | 'ineligible';

/**
 * Open a game's doors once its building is eligible. Pacing comes from the
 * eligibility gate itself — 'story' games open when the tale is told, 'l2' games
 * when their building is cared for (a coin-paced upgrade) — so there's no extra
 * daily throttle to frustrate a player who's earned the unlock.
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

// ---------- rewards ----------

export interface MgReward {
  coins: number;
  items: { chain: ChainId; level: number }[];
  ember: number;
  /** A short line naming the run's one guaranteed keepsake (for the result card). */
  heart: string;
}

// ---------- 1) Wishing Well — a pebble dropped, a wish surfaced ----------
// The reward band is deliberately flat (the *wish*, not the loot, is the point).
// A wish "takes root" as a seed — reviving the seeds chain.

export interface WellResult extends MgReward {
  slot: number; // 0..4, which gift the pebble found
  wishIndex: number; // into the data WISHES table
}

const WELL_COINS = [8, 10, 14, 10, 8];

export function wishingWell(seed: number, wishCount: number): WellResult {
  const rand = lcg(seed);
  const slot = Math.floor(rand() * 5);
  const coins = WELL_COINS[slot]!;
  // Centre slot roots a stronger seedling; every drop grants at least a seed.
  const items = [{ chain: 'seeds' as ChainId, level: slot === 2 ? 2 : rand() < 0.4 ? 1 : 0 }];
  const ember = slot === 2 ? 2 : 1;
  const wishIndex = wishCount > 0 ? Math.floor(rand() * wishCount) : -1;
  return {
    coins,
    items,
    ember,
    heart: slot === 2 ? 'The wish took deep root — a fine seedling.' : 'A wish taken root — a seed to plant.',
    slot,
    wishIndex,
  };
}

// ---------- 2) Beacon Drop — a light-ember plinkos down to the boats -------
// Lighthouse-themed. The ember bounces down peg rows into a slot; the centre is
// the day's heart. Coastal reward → the fish chain (revived).

export const BEACON_ROWS = 8;

/** The seeded left/right bounce sequence — the 3 seconds of suspense. */
export function beaconPath(seed: number, rows = BEACON_ROWS): (0 | 1)[] {
  const rand = lcg(seed);
  return Array.from({ length: rows }, () => (rand() < 0.5 ? 0 : 1));
}

/** Final slot 0..rows from a bounce path (number of rights). */
export function beaconSlot(path: readonly (0 | 1)[]): number {
  return path.reduce<number>((n, d) => n + d, 0);
}

export function beaconReward(slot: number, rows = BEACON_ROWS): MgReward {
  const centre = rows / 2;
  const dist = Math.abs(slot - centre); // 0 at centre, up to rows/2 at an edge
  const closeness = 1 - dist / centre; // 1 centre → 0 edge
  const coins = 6 + Math.round(closeness * 12); // 6..18
  // Fish revived: centre lands a fine catch (heart), near-centre a smaller one.
  const items: { chain: ChainId; level: number }[] = [{ chain: 'fish', level: dist === 0 ? 2 : dist <= 2 ? 1 : 0 }];
  const ember = dist === 0 ? 2 : 1;
  return {
    coins,
    items,
    ember,
    heart:
      dist === 0 ? 'Dead centre — the finest catch the light drew in.' : 'The light drew a good catch to the boats.',
  };
}

// ---------- 3) Strike While Hot — the forge whack-a-mole ----------
// Blacksmith-themed. Hotspots bloom on the forge grid; strike them before they
// cool. No punishment for a miss. Copper revived; accuracy earns more.

export const FORGE_CELLS = 9; // 3×3 forge grid
export const FORGE_DURATION_MS = 18_000;

export interface ForgeSpawn {
  cell: number; // 0..FORGE_CELLS-1
  atMs: number; // when it lights
  ttlMs: number; // how long it stays hot
}

/** A deterministic bloom schedule; the UI drives the timing + scoring. */
export function forgeSchedule(seed: number, count = 14, durationMs = FORGE_DURATION_MS): ForgeSpawn[] {
  const rand = lcg(seed);
  const out: ForgeSpawn[] = [];
  let last = -1;
  for (let i = 0; i < count; i++) {
    let cell = Math.floor(rand() * FORGE_CELLS);
    if (cell === last) cell = (cell + 1) % FORGE_CELLS; // avoid immediate repeats
    last = cell;
    const atMs = Math.round((i / count) * (durationMs - 1200)) + Math.floor(rand() * 300);
    const ttlMs = 900 + Math.floor(rand() * 500);
    out.push({ cell, atMs, ttlMs });
  }
  return out;
}

/** Reward scales with accuracy; a bar of copper is always struck (heart). */
export function forgeReward(hits: number, count: number): MgReward {
  const acc = count > 0 ? Math.min(1, hits / count) : 0;
  const coins = 6 + Math.round(acc * 14); // 6..20
  const items: { chain: ChainId; level: number }[] = [{ chain: 'copper', level: 1 }];
  if (acc >= 0.8)
    items.push({ chain: 'copper', level: 2 }); // a clean run forges a bar
  else if (acc >= 0.5) items.push({ chain: 'copper', level: 1 });
  const ember = acc >= 0.6 ? 2 : 1;
  return {
    coins,
    items,
    ember,
    heart: acc >= 0.8 ? 'Struck true — a bar of bright copper.' : 'Good, honest work at the forge.',
  };
}

// ---------- 4) Joss's Catch (fisher hut) — bobber timing ----------
// Cast, wait for the dip, strike. The closer to the dip, the deeper the fish.

export function fishBite(seed: number): { delayMs: number; windowMs: number } {
  const rand = lcg(seed);
  return { delayMs: 1800 + Math.floor(rand() * 2600), windowMs: 700 };
}

/** quality 0..1 = how clean the strike was; always lands *something* (no-fail). */
export function catchReward(quality: number): MgReward {
  const q = Math.max(0, Math.min(1, quality));
  const level = q >= 0.75 ? 2 : q >= 0.4 ? 1 : 0;
  return {
    coins: 6 + Math.round(q * 12),
    items: [{ chain: 'fish', level }],
    ember: q >= 0.6 ? 2 : 1,
    heart:
      level === 2
        ? 'A fine fish, landed clean.'
        : level === 1
          ? 'A good catch off Joss’s line.'
          : 'A nibble — enough for the pot.',
  };
}

// ---------- 5) The Foraging Expedition (garden) — a fog-covered dig ----------
// Uncover a corner of the coast tile by tile, keep everything, head home when you
// like. Revives the herbs/flowers/honey chains; a heart tile hides a honeycomb.

export type ForageKind = 'item' | 'coins' | 'ember' | 'view' | 'heart';
export const FORAGE_SIZE = 25; // 5×5
export const FORAGE_STEPS = 12;
const FORAGE_ITEM_CHAINS: readonly ChainId[] = ['herbs', 'flowers', 'honey'];

export function forageField(seed: number): { kinds: ForageKind[]; heartIndex: number } {
  const rand = lcg(seed);
  const bag: ForageKind[] = [];
  const add = (k: ForageKind, n: number) => {
    for (let i = 0; i < n; i++) bag.push(k);
  };
  add('item', 9);
  add('coins', 5);
  add('ember', 3);
  add('view', FORAGE_SIZE - 1 - 9 - 5 - 3); // the rest are lovely-but-empty views
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [bag[i], bag[j]] = [bag[j]!, bag[i]!];
  }
  const heartIndex = Math.floor(rand() * FORAGE_SIZE);
  const kinds: ForageKind[] = [];
  let b = 0;
  for (let i = 0; i < FORAGE_SIZE; i++) kinds.push(i === heartIndex ? 'heart' : bag[b++]!);
  return { kinds, heartIndex };
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
    default:
      return { coins: 0, items: [], ember: 0 }; // a lovely view — the empty tile IS content
  }
}

// ---------- 6) Sorting the Stacks (library) — a pairs match ----------
// Match the shelves to set the library right; a clean sort turns up a fine volume.

export const STACKS_PAIRS = 6;

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

export function stacksReward(flips: number, pairs = STACKS_PAIRS): MgReward {
  const clean = flips <= pairs * 2 + 2; // near-perfect recall
  return {
    coins: clean ? 20 : 12,
    items: [{ chain: 'books', level: clean ? 2 : 1 }],
    ember: clean ? 2 : 1,
    heart: clean ? 'Every shelf in order — a scholar’s eye.' : 'The stacks are sorted, near enough.',
  };
}
