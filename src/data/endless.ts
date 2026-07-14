/**
 * Endless "town needs" — once the 72-order story is told, Emberhollow keeps
 * asking for small kindnesses so the merge→deliver loop (and the mini-games that
 * feed the Repository) never dead-ends. Deterministic by index, so a given save
 * always sees the same sequence; rewards are coins-led with only a token of
 * energy, so real-world actions stay the true engine (the "never sell energy"
 * pillar holds even in the endgame).
 */
import type { ChainId, OrderDef } from '../core/types';
import { chainDef, maxLevel } from '../core/board';
import { ORDERS } from './economy';

// The chains the village asks for — every resource chain, so the ones the story
// never demanded (seeds, copper, fish, honey, books, music) finally get used.
const POOL: readonly ChainId[] = [
  'wood', 'harvest', 'flowers', 'water', 'stone', 'clay',
  'fish', 'copper', 'honey', 'herbs', 'wool', 'books', 'music', 'seeds', 'keepsake',
];

// Villager names that resolve to painted busts (portraitFor) + villager bonds,
// with a few gentle strangers mixed in.
const WHO: readonly string[] = [
  'Bran the baker',
  'Wren the postmistress',
  'Fisher Joss',
  'Marta',
  'Old Sorin',
  'The children of Emberhollow',
  'A weary traveller',
  'The harbour folk',
];

const ASK: readonly ((item: string) => string)[] = [
  (item) => `Nothing urgent, but the village could always use ${item}. Would you bring some by?`,
  (item) => `A quiet day — perfect for gathering ${item} for the square.`,
  (item) => `We’re getting on well now. Still, ${item} would brighten the week.`,
  (item) => `Would you spare ${item}? Small things keep Emberhollow humming.`,
  (item) => `The storeroom’s looking bare of ${item}. No rush — whenever you can.`,
];

const DONE: readonly string[] = [
  'Just the thing. The village feels a little more itself.',
  'Kindly done. Someone will smile at that tomorrow.',
  'Perfect. Emberhollow keeps its small, warm rhythm.',
  'That’ll do nicely. Thank you for tending to us still.',
];

function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** The nth endless order (n ≥ 0), deterministic and self-contained. */
export function endlessOrderFor(n: number): OrderDef {
  const rand = lcg(n * 2654435761 + 101);
  const chain = POOL[Math.floor(rand() * POOL.length)]!;
  // Ask for a gentle mid-tier item, deepening a touch over time, clamped to the
  // chain's real top so it's always buildable.
  const want = 1 + Math.floor(rand() * 2) + (n >= 24 ? 1 : 0);
  const level = Math.min(maxLevel(chain), want);
  const who = WHO[n % WHO.length]!;
  const itemName = (chainDef(chain).levelNames[level] ?? 'a little something').toLowerCase();
  return {
    id: `endless-${n}`,
    who,
    need: { chain, level },
    text: ASK[n % ASK.length]!(itemName),
    resolution: DONE[n % DONE.length]!,
    rewardEnergy: 2, // a token — coins carry the endgame, not energy
    rewardCoins: 18 + level * 8 + Math.min(24, Math.floor(n / 2)),
  };
}

/**
 * The order at a given index: the authored story order while it lasts, then a
 * generated town-need. Always returns an order — the loop never runs dry.
 */
export function orderAt(index: number): OrderDef {
  return ORDERS[index] ?? endlessOrderFor(index - ORDERS.length);
}

/** Whether an index is past the authored story (a generated town-need). */
export function isEndless(index: number): boolean {
  return index >= ORDERS.length;
}
