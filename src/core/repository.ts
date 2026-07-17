/**
 * The Repository — what you've gathered from Village Life games and Bonfire
 * Duels, kept safe until the village asks for it. Two ways loot leaves here:
 *
 *  1. Story/town orders: when the current order's need matches something you
 *     hold, you can hand it over (see Game.deliverFromRepository).
 *  2. Standing village requests (this module): the mini-game chains
 *     (fish, honey, copper, books, seeds, flowers, herbs) are never asked for
 *     by the board-buildable town orders — so a villager keeps a standing wish
 *     for each kind you've gathered, and you can gift it for coins whenever you
 *     like. This is the town "asking for your caught loot" without ever blocking
 *     the merge→deliver loop (the requests only exist for what you actually
 *     hold, so they can never stall progress).
 *
 * Pure + deterministic (flavour rotates by a day seed). No selling for less than
 * a kept thing is worth, no discarding — the keep-everything pillar holds; you
 * simply choose what to honour.
 */
import type { ChainId, RepositoryItem } from './types';

/**
 * The collectible chains that Village Life games and duels produce. The endless
 * town orders deliberately never ask for these (they ask only for board-buildable
 * POOL chains — see data/endless.ts), so without a home for them mini-game loot
 * would pile up unused. These standing requests are that home.
 */
export const MINIGAME_CHAINS: readonly ChainId[] = ['fish', 'honey', 'copper', 'books', 'seeds', 'flowers', 'herbs'];

export interface RepoRequest {
  /** Stable per (chain, level) — used as the DOM key and the fulfil target. */
  id: string;
  chain: ChainId;
  level: number;
  /** How many of this item you hold. */
  count: number;
  /** The villager who'd love it (resolves to a painted bust via portraitFor). */
  who: string;
  /** Their gentle ask. */
  text: string;
  /** Coins paid when you gift one. Modest — coins-led endgame, never energy. */
  coins: number;
}

/** Who keeps a standing wish for each kind of gathered thing. */
const WHO_BY_CHAIN: Record<string, string> = {
  fish: 'Fisher Joss',
  honey: 'Marta',
  copper: 'Old Sorin',
  books: 'Wren the postmistress',
  seeds: 'Marta',
  flowers: 'Wren the postmistress',
  herbs: 'Marta',
};

/** A few interchangeable asks per chain, chosen by the day seed for variety. */
const ASKS: readonly ((item: string) => string)[] = [
  (item) => `Oh — is that ${item}? The village would treasure some. Spare a little?`,
  (item) => `You gathered ${item}! I've a use for that, if you can part with it.`,
  (item) => `${item}, kept so carefully. Bring some by whenever you like — no rush.`,
  (item) => `We could use ${item} about the place. It'd not go to waste, I promise.`,
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Coins for gifting one item of a given level. Gentle, deepening a touch by level. */
export function repoRequestCoins(level: number): number {
  return 14 + level * 7;
}

/**
 * Standing village requests for everything gathered that the town orders never
 * ask for. One per (mini-game chain, level) stack you hold, newest-worth first.
 * `daySeed` (e.g. the YYYY-MM-DD key) only rotates the flavour text, never which
 * requests exist — so it's stable within a day and can never block progress.
 */
export function repoRequestsFor(repo: readonly RepositoryItem[], daySeed: string): RepoRequest[] {
  const seed = hash(daySeed);
  const mg = new Set(MINIGAME_CHAINS);
  return repo
    .filter((r) => mg.has(r.chain) && r.count > 0)
    .map((r) => {
      const who = WHO_BY_CHAIN[r.chain] ?? 'The harbour folk';
      const itemSeed = hash(`${daySeed}:${r.chain}:${r.level}`);
      const text = ASKS[(seed + itemSeed) % ASKS.length]!(chainNoun(r.chain));
      return {
        id: `${r.chain}-${r.level}`,
        chain: r.chain,
        level: r.level,
        count: r.count,
        who,
        text,
        coins: repoRequestCoins(r.level),
      };
    })
    .sort((a, b) => b.coins - a.coins || a.chain.localeCompare(b.chain));
}

/** A plain-language noun for the ask line (the level name is shown separately). */
function chainNoun(chain: ChainId): string {
  switch (chain) {
    case 'fish':
      return 'fresh fish';
    case 'honey':
      return 'honey';
    case 'copper':
      return 'good copper';
    case 'books':
      return 'a book or two';
    case 'seeds':
      return 'seeds';
    case 'flowers':
      return 'cut flowers';
    case 'herbs':
      return 'herbs';
    default:
      return 'that';
  }
}

/** Remove one item of (chain, level) from the Repository, pruning empties. */
export function takeFromRepository(repo: readonly RepositoryItem[], chain: ChainId, level: number): RepositoryItem[] {
  return repo
    .map((r) => (r.chain === chain && r.level === level ? { ...r, count: r.count - 1 } : r))
    .filter((r) => r.count > 0);
}

/** Whether the Repository holds at least one of (chain, level). */
export function holds(repo: readonly RepositoryItem[], chain: ChainId, level: number): boolean {
  return repo.some((r) => r.chain === chain && r.level === level && r.count > 0);
}
