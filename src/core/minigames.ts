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

export const WELL_SLOTS = 5;
const WELL_COINS = [8, 10, 14, 10, 8];

/**
 * The reward for the ring the player *aimed* the pebble into (0..4, centre = 2).
 * Player-driven now — the UI reads the slot from where they released the aim
 * sweep, so the drop is earned, not seeded. The seed only flavours the wish and
 * the incidental seed level. Still no-fail: every ring roots at least a seed.
 */
export function wishingWellReward(slot: number, seed: number, wishCount: number): WellResult {
  const s = Math.max(0, Math.min(WELL_SLOTS - 1, Math.round(slot)));
  const rand = lcg(seed);
  const coins = WELL_COINS[s]!;
  const items = [{ chain: 'seeds' as ChainId, level: s === 2 ? 2 : rand() < 0.4 ? 1 : 0 }];
  const ember = s === 2 ? 2 : 1;
  const wishIndex = wishCount > 0 ? Math.floor(rand() * wishCount) : -1;
  return {
    coins,
    items,
    ember,
    heart: s === 2 ? 'The wish took deep root — a fine seedling.' : 'A wish taken root — a seed to plant.',
    slot: s,
    wishIndex,
  };
}

/** 0..100 "how close to the heart" — the well's personal-best metric (centre = 100). */
export function wellScore(slot: number): number {
  return Math.round(100 - Math.abs(slot - 2) * 25); // centre 100, adjacent 75, edge 50
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
export function beaconScore(slot: number): number {
  const centre = BEACON_ROWS / 2;
  return Math.round((1 - Math.abs(slot - centre) / centre) * 100);
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

// ---------- 7) The Saw Song (sawmill) — rhythm lanes ----------
// Guitar-hero-hearted: logs ride five flume lanes down to the blade line; saw
// each as it crosses. A missed log just drifts on — no-fail — but clean cuts
// build a combo. Wood revived; rhythm earns the finer timber.

export const SAWMILL_LANES = 5;
export const SAWMILL_DURATION_MS = 36_000;
export const SAWMILL_FALL_MS = 2600; // top → blade line travel time
export const SAWMILL_WINDOW_MS = 520; // generous hit window centred on the line
export const SAWMILL_PERFECT_MS = 160; // the inner "clean cut" window

export interface SawmillSpawn {
  lane: number; // 0..SAWMILL_LANES-1
  atMs: number; // when the log enters its lane
}

/**
 * Deterministic log schedule: ~22 logs over the round, gently ramping denser,
 * never the same lane twice in a row, and never two logs so close in one lane
 * that they'd overlap on the flume.
 */
export function sawmillSchedule(seed: number, count = 22, durationMs = SAWMILL_DURATION_MS): SawmillSpawn[] {
  const rand = lcg(seed);
  const out: SawmillSpawn[] = [];
  const laneFree: number[] = Array.from({ length: SAWMILL_LANES }, () => -Infinity);
  const minGap = Math.round(SAWMILL_FALL_MS * 0.55);
  const span = durationMs - SAWMILL_FALL_MS - 400;
  let last = -1;
  for (let i = 0; i < count; i++) {
    // slight ramp: early logs spread out, late logs arrive a touch quicker
    const t = i / count;
    const atMs = Math.round(span * (t + 0.12 * t * (1 - t))) + Math.floor(rand() * 260);
    let lane = Math.floor(rand() * SAWMILL_LANES);
    for (let tries = 0; tries < SAWMILL_LANES; tries++) {
      if (lane !== last && atMs - laneFree[lane]! >= minGap) break;
      lane = (lane + 1) % SAWMILL_LANES;
    }
    laneFree[lane] = atMs;
    last = lane;
    out.push({ lane, atMs });
  }
  return out;
}

/** Personal-best metric: cuts, clean cuts, and the longest run all count. */
export function sawmillScore(hits: number, perfects: number, bestCombo: number): number {
  return hits * 10 + perfects * 5 + bestCombo * 2;
}

/**
 * No-fail reward: the timber always stacks — at least a wood billet — and
 * accuracy + clean cuts raise the cut to planks, then beams.
 */
export function sawmillReward(hits: number, perfects: number, count: number): MgReward {
  const acc = count > 0 ? Math.min(1, hits / count) : 0;
  const coins = 6 + Math.round(acc * 14); // 6..20
  const items: { chain: ChainId; level: number }[] = [{ chain: 'wood', level: 1 }];
  if (acc >= 0.5) items.push({ chain: 'wood', level: 2 });
  if (acc >= 0.8 && perfects >= 5) items.push({ chain: 'wood', level: 3 });
  const ember = acc >= 0.6 ? 2 : 1;
  return {
    coins,
    items,
    ember,
    heart:
      acc >= 0.8 && perfects >= 5
        ? 'Every log sawn clean — timber fit for rafters.'
        : acc >= 0.5
          ? 'A good day’s milling — the stack grows.'
          : 'The flume ran on; the timber still stacks.',
  };
}
