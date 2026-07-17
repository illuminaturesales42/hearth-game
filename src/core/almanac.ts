/**
 * The Keeper's Almanac — the quiet collection behind Village Life.
 *
 * Every mini-game already hands back items (a fish, a bar of copper, a beam of
 * timber). The Almanac simply *remembers* the first of each kind and gives it a
 * name and a page, so the games have a reason beyond the coins: you're filling
 * a book. Pure derivation from the rewards that already exist — no new drops,
 * no new economy.
 *
 * Pillars: nothing here can be missed or lost, nothing expires, and an
 * undiscovered page is a soft silhouette to be curious about — never a gap that
 * scolds you.
 */
import type { ChainId } from './types';

/** What a mini-game hands back — the shape of one item in an MgReward. */
export interface AlmanacItem {
  chain: ChainId;
  level: number;
}

export interface AlmanacPage {
  /** Stable stamp id — `${chain}_${level}`. */
  id: string;
  chain: ChainId;
  level: number;
  /** The section this page sits in. */
  section: string;
  /** What the keeper calls it. */
  name: string;
  /** A line of flavour, shown once found. */
  note: string;
}

/**
 * The catalogue: every item a mini-game can actually hand you, named. Levels
 * match the reward bands in core/minigames (the ceilings are the rarities).
 */
export const ALMANAC_PAGES: readonly AlmanacPage[] = [
  // Joss's Catch + Beacon Drop — the fish come from the water either way
  { id: 'fish_0', chain: 'fish', level: 0, section: 'The Water', name: 'Silver Smelt', note: 'Small, quick, and enough for the pot.' },
  { id: 'fish_1', chain: 'fish', level: 1, section: 'The Water', name: 'Harbour Bream', note: 'The everyday fish of Emberhollow’s bay.' },
  { id: 'fish_2', chain: 'fish', level: 2, section: 'The Water', name: 'Beacon Trout', note: 'Drawn in by lantern light, Joss swears.' },
  { id: 'fish_3', chain: 'fish', level: 3, section: 'The Water', name: 'Deepwater Rarity', note: 'A clean strike and a cleaner reel. Joss will talk about this one.' },
  // The forge
  { id: 'copper_0', chain: 'copper', level: 0, section: 'The Forge', name: 'Raw Ore', note: 'Straight from the hillside, still cold.' },
  { id: 'copper_1', chain: 'copper', level: 1, section: 'The Forge', name: 'Rough Copper', note: 'Honest work, honestly struck.' },
  { id: 'copper_2', chain: 'copper', level: 2, section: 'The Forge', name: 'Bright Bar', note: 'Struck true on the sweet heat.' },
  { id: 'copper_3', chain: 'copper', level: 3, section: 'The Forge', name: 'Masterwork Copper', note: 'Every strike on the glow. The anvil sang.' },
  // The sawmill
  { id: 'wood_1', chain: 'wood', level: 1, section: 'The Sawmill', name: 'Billet', note: 'The flume ran; the timber stacked.' },
  { id: 'wood_2', chain: 'wood', level: 2, section: 'The Sawmill', name: 'Plank', note: 'A good day’s milling.' },
  { id: 'wood_3', chain: 'wood', level: 3, section: 'The Sawmill', name: 'Rafter Beam', note: 'Sawn clean to the song’s last note.' },
  // The well
  { id: 'seeds_0', chain: 'seeds', level: 0, section: 'The Well', name: 'Stray Seed', note: 'A wish, lightly made.' },
  { id: 'seeds_1', chain: 'seeds', level: 1, section: 'The Well', name: 'Rooted Wish', note: 'It took, in its own quiet way.' },
  { id: 'seeds_2', chain: 'seeds', level: 2, section: 'The Well', name: 'Fine Seedling', note: 'The centre ring, and a wish worth keeping.' },
  { id: 'seeds_3', chain: 'seeds', level: 3, section: 'The Well', name: 'Deep-Rooted Wish', note: 'Three true drops. The well remembered.' },
  // The library
  { id: 'books_1', chain: 'books', level: 1, section: 'The Library', name: 'Loose Pages', note: 'Sorted, near enough.' },
  { id: 'books_2', chain: 'books', level: 2, section: 'The Library', name: 'Bound Volume', note: 'Every shelf in order.' },
  { id: 'books_3', chain: 'books', level: 3, section: 'The Library', name: 'The Rare Folio', note: 'Five shelves from memory alone.' },
  // The foraging expedition
  { id: 'herbs_0', chain: 'herbs', level: 0, section: 'The Coast Path', name: 'Wild Herbs', note: 'Found underfoot, if you look.' },
  { id: 'herbs_1', chain: 'herbs', level: 1, section: 'The Coast Path', name: 'Sea Rosemary', note: 'Grows where the salt wind reaches.' },
  { id: 'flowers_0', chain: 'flowers', level: 0, section: 'The Coast Path', name: 'Coast Flowers', note: 'Small, stubborn, cheerful.' },
  { id: 'flowers_1', chain: 'flowers', level: 1, section: 'The Coast Path', name: 'Cliff Bloom', note: 'The kind worth the walk.' },
  { id: 'honey_0', chain: 'honey', level: 0, section: 'The Coast Path', name: 'Wild Comb', note: 'A patient find.' },
  { id: 'honey_1', chain: 'honey', level: 1, section: 'The Coast Path', name: 'Golden Comb', note: 'Warm from the sun.' },
  { id: 'honey_2', chain: 'honey', level: 2, section: 'The Coast Path', name: 'The Honeycomb', note: 'The prize of the coast path — found by warmth alone.' },
];

const BY_ID: Record<string, AlmanacPage> = Object.fromEntries(ALMANAC_PAGES.map((p) => [p.id, p]));

/** The Almanac's sections, in the order the book runs. */
export const ALMANAC_SECTIONS: readonly string[] = [...new Set(ALMANAC_PAGES.map((p) => p.section))];

/** The stamp id for an item, whether or not it has a page. */
export function stampId(item: AlmanacItem): string {
  return `${item.chain}_${item.level}`;
}

/** The page for an item, or undefined if this kind isn't collected. */
export function pageFor(item: AlmanacItem): AlmanacPage | undefined {
  return BY_ID[stampId(item)];
}

export type AlmanacState = Record<string, number>;

/**
 * Record a run's items into the book. Returns the new state plus only the pages
 * seen for the FIRST time — those are the ones worth announcing. Pure: the
 * given state is never mutated, and an all-known run returns it untouched.
 */
export function stampItems(
  state: AlmanacState,
  items: readonly AlmanacItem[],
): { state: AlmanacState; discovered: AlmanacPage[] } {
  const next: AlmanacState = { ...state };
  const discovered: AlmanacPage[] = [];
  let changed = false;
  for (const it of items) {
    const page = pageFor(it);
    if (!page) continue; // an item with no page simply isn't collected
    if ((state[page.id] ?? 0) === 0 && !discovered.some((d) => d.id === page.id)) discovered.push(page);
    next[page.id] = (next[page.id] ?? 0) + 1;
    changed = true;
  }
  return { state: changed ? next : state, discovered };
}

/** How full the book is — the only progress number the Almanac keeps. */
export function almanacProgress(state: AlmanacState): { found: number; total: number } {
  return {
    found: ALMANAC_PAGES.filter((p) => (state[p.id] ?? 0) > 0).length,
    total: ALMANAC_PAGES.length,
  };
}
