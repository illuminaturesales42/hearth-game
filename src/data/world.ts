/**
 * Static world content for the Map, Villagers, Journal and Shop screens.
 * Read-only cozy data; unlocks are driven by orders delivered so the
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
  { id: 'marta', name: 'Marta', role: '???', affinity: 1, known: true },
];

export interface JournalEntry {
  id: string;
  tab: 'Clues' | 'Letters' | 'People' | 'Places';
  title: string;
  note: string;
  fresh?: boolean;
}

export const JOURNAL: readonly JournalEntry[] = [
  { id: 'j-letter11', tab: 'Letters', title: 'The Eleventh Letter', note: 'Unread. It sits on the cottage windowsill, in Marta’s hand.', fresh: true },
  { id: 'j-future', tab: 'Letters', title: 'Nine future-dated letters', note: 'All postmarked after the day Marta vanished. One is dated three days from now.' },
  { id: 'j-bolt', tab: 'Clues', title: 'The Lighthouse Bolt', note: 'Sorin kept the bolt used to shutter the light. The light was hidden on purpose.' },
  { id: 'j-boat', tab: 'Clues', title: 'The Rowboat', note: 'Hauled above the tideline near the northern cove. Recently used.' },
  { id: 'j-cove', tab: 'Places', title: 'The Northern Cove', note: 'Circled twice on Marta’s oilskin chart, behind the black rocks.' },
  { id: 'j-marta', tab: 'People', title: 'Marta', note: 'Presumed drowned seventeen years ago. She rowed north instead. Now home — but why the letters?' },
];

export interface Collection {
  id: string;
  name: string;
  have: number;
  total: number;
}

export const COLLECTIONS: readonly Collection[] = [
  { id: 'timberline', name: 'Timberline', have: 6, total: 10 },
  { id: 'harvest', name: 'Harvest', have: 5, total: 10 },
  { id: 'hearthfire', name: 'Hearthfire', have: 4, total: 10 },
  { id: 'decor', name: 'Town Decor', have: 3, total: 10 },
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
