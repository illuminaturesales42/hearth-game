/**
 * The residents of Emberhollow (Codex Book III — The Living Village).
 * Each villager has a purpose, a distinct trait, a home they can lose to the
 * storm and win back, and a favourite place. They are the emotional centre of
 * Hearth: people to return to, not quest dispensers.
 */

export interface VillagerDef {
  id: string;
  name: string;
  role: string;
  /** Building sprite id that is "theirs" — restoring it is a bond moment. */
  home?: string;
  /** One-line personality (Book III: every resident is distinct). */
  trait: string;
  favouritePlace: string;
}

export const VILLAGER_DEFS: readonly VillagerDef[] = [
  {
    id: 'wren',
    name: 'Wren',
    role: 'Postmistress',
    home: 'town_market',
    trait: 'reads every letter twice',
    favouritePlace: 'the notice board',
  },
  {
    id: 'bran',
    name: 'Bran',
    role: 'Baker',
    home: 'town_bakery',
    trait: 'up before the gulls, flour to the elbows',
    favouritePlace: 'a warm oven',
  },
  {
    id: 'sorin',
    name: 'Sorin',
    role: 'Old Keeper',
    home: 'town_library',
    trait: 'keeps what the tide throws away',
    favouritePlace: 'the lighthouse path',
  },
  {
    id: 'joss',
    name: 'Joss',
    role: 'Boatswain',
    home: 'town_fisherhut',
    trait: 'trusts the tide more than most people',
    favouritePlace: 'the north docks',
  },
  {
    id: 'marta',
    name: 'Marta',
    role: 'the returned',
    home: 'town_cottage',
    trait: 'came back from the sea full of questions',
    favouritePlace: 'the old cottage window',
  },
];

/** Resolve an order's `who` string (e.g. "Bran the baker") to a villager id. */
export function villagerIdFor(who: string): string | null {
  const n = who.toLowerCase();
  for (const v of VILLAGER_DEFS) if (n.includes(v.id)) return v.id;
  return null;
}

export function villagerDef(id: string): VillagerDef | undefined {
  return VILLAGER_DEFS.find((v) => v.id === id);
}
