/**
 * Static world content for the Map, Villagers, Journal and Shop screens.
 * Read-only cosy data; unlocks are driven by orders delivered so the
 * screens stay in sync with story progress.
 */

export interface MapLocation {
  id: string;
  name: string;
  /** Orders delivered required to unlock. */
  unlockAt: number;
  /** Level shown once unlocked. */
  level: number;
  blurb: string;
}

export const MAP_LOCATIONS: readonly MapLocation[] = [
  { id: 'lighthouse', name: 'The Lighthouse', unlockAt: 0, level: 2, blurb: 'Dark for seventeen years. Lit again on the night the letter came.' },
  { id: 'bakers-row', name: "Baker's Row", unlockAt: 0, level: 3, blurb: "Bran's ovens and the notice board that started all of this." },
  { id: 'market', name: 'Market Square', unlockAt: 3, level: 2, blurb: 'Lamplight, gossip, and Wren behind the post counter.' },
  { id: 'pier', name: "Fisherman's Pier", unlockAt: 6, level: 2, blurb: 'Where a rowboat was hauled up above the tideline. Recently.' },
  { id: 'north-docks', name: 'North Docks', unlockAt: 9, level: 1, blurb: 'The way to the shoals and the circled cove.' },
  { id: 'quarry', name: 'Old Quarry', unlockAt: 12, level: 1, blurb: 'Sorin says the shuttering bolt was cut here. Chapter 2 opens the gate.' },
];

export interface Villager {
  id: string;
  name: string;
  role: string;
  affinity: number; // 0-5 hearts, revealed as the story unlocks them
  known: boolean;
}

export const VILLAGERS: readonly Villager[] = [
  { id: 'wren', name: 'Wren', role: 'Postmistress', affinity: 4, known: true },
  { id: 'bran', name: 'Bran', role: 'Baker', affinity: 5, known: true },
  { id: 'sorin', name: 'Sorin', role: 'Old Keeper', affinity: 3, known: true },
  { id: 'joss', name: 'Joss', role: 'Boatswain', affinity: 2, known: true },
  { id: 'marta', name: 'Marta', role: '???', affinity: 1, known: true },
];

export interface JournalEntry {
  id: string;
  tab: 'Clues' | 'Letters' | 'People' | 'Places';
  title: string;
  note: string;
  /** Orders delivered before this entry appears in the Journal. */
  at: number;
  fresh?: boolean;
}

export const JOURNAL: readonly JournalEntry[] = [
  { id: 'j-notice', tab: 'Places', title: 'The Notice Board', at: 1, note: 'Pinned dead centre: a letter addressed to nobody, postmarked seventeen years ago.' },
  { id: 'j-key', tab: 'Clues', title: 'The Brass Key', at: 2, note: 'Found in the oven flue, with a warning: "Don’t trust the lighthouse keeper."' },
  { id: 'j-future', tab: 'Letters', title: 'The Impossible Letter', at: 3, note: 'Dated three days from now. Wren read it twice and folded it fast.' },
  { id: 'j-bolt', tab: 'Clues', title: 'The Lighthouse Bolt', at: 5, note: 'Sorin kept the bolt used to shutter the light. The light was hidden on purpose.' },
  { id: 'j-nine', tab: 'Letters', title: 'Nine Letters in Her Hand', at: 7, note: 'All postmarked after the day Marta vanished.' },
  { id: 'j-cove', tab: 'Places', title: 'The Northern Cove', at: 8, note: 'Circled twice on Marta’s oilskin chart, behind the black rocks.' },
  { id: 'j-boat', tab: 'Clues', title: 'The Rowboat', at: 9, note: 'Hauled above the tideline near the northern cove. Recently used.' },
  { id: 'j-marta', tab: 'People', title: 'Marta', at: 11, note: 'Presumed drowned seventeen years ago. She rowed north instead. Now home — but why the letters?' },
  { id: 'j-letter11', tab: 'Letters', title: 'The Eleventh Letter', at: 12, note: 'Unread. It sits on the cottage windowsill, in Marta’s hand.', fresh: true },
  { id: 'j-bootprints', tab: 'Clues', title: 'Bootprints in the Sand', at: 13, note: 'Lantern-light caught them leading to the north cove. Someone walks there at night.' },
  { id: 'j-marigold', tab: 'Clues', title: 'The Marigold', at: 15, note: 'A rusted coin from a ship of that name, hidden under Sorin’s old bench.' },
  { id: 'j-yesterday', tab: 'Letters', title: 'Postmarked Yesterday', at: 16, note: 'A letter addressed to Marta — dated after her return. Someone is still writing.' },
  { id: 'j-joss', tab: 'People', title: 'Fisher Joss', at: 18, note: 'Boatswain of the strange tides. Pulled a torn oilskin from the nets, stitched A.V.' },
  { id: 'j-tidechart', tab: 'Clues', title: 'The Tide Chart', at: 19, note: 'Hidden markings in the desk drawer. The shoals were mapped by someone patient.' },
  { id: 'j-aldenvale', tab: 'People', title: 'Alden Vale', at: 22, note: 'A name in invisible ink. Payments. Silence. The letters A.V. on torn oilskin.', fresh: true },
];

/**
 * Collections are chain-mastery: reach the top tier of a chain to complete its
 * collection and earn a one-off coin reward. Progress is REAL — it reads the
 * highest tier the player has ever merged in that chain.
 */
export interface Collection {
  id: string;
  name: string;
  chain: import('../core/types').ChainId;
  /** One-off coin reward on completion (coins buy beauty, never power). */
  coins: number;
}

export const COLLECTIONS: readonly Collection[] = [
  { id: 'timberline', name: 'Timberline', chain: 'wood', coins: 120 },
  { id: 'harvest', name: 'Harvest', chain: 'harvest', coins: 120 },
  { id: 'hearthfire', name: 'Hearthfire', chain: 'hearthfire', coins: 90 },
  { id: 'keepsakes', name: 'Keepsakes', chain: 'keepsake', coins: 150 },
  { id: 'homestead', name: "Builder's Yard", chain: 'homestead', coins: 250 },
];

export interface WorldEvent {
  id: string;
  name: string;
  timing: string;
  kind: 'season' | 'daily' | 'weekly';
}

export const EVENTS: readonly WorldEvent[] = [
  { id: 'festival', name: 'Festival of Lights', timing: 'Starts in 2d 14h', kind: 'season' },
  { id: 'daily', name: 'Daily Tasks', timing: 'New in 14h', kind: 'daily' },
  { id: 'weekly', name: 'Weekly Tasks', timing: '6d 4h left', kind: 'weekly' },
  { id: 'season', name: 'Season Rewards', timing: 'Chapter 2', kind: 'season' },
];
