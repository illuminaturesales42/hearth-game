/**
 * Economy configuration. Everything here is designed to be remote-config
 * shaped: plain serializable data, no logic, live-tunable in M3.
 */
import type { ChainDef, LifeQuestDef, OrderDef } from '../core/types';

export const CHAINS: readonly ChainDef[] = [
  {
    id: 'wood',
    name: 'Timberline',
    levels: ['🌱', '🪵', '🪚', '🔨', '🪑', '🚪', '🏠'],
    levelNames: ['Sapling', 'Log', 'Plank', 'Hammer', 'Chair', 'Door', 'Cottage'],
  },
  {
    id: 'harvest',
    name: 'Harvest',
    levels: ['🌾', '🥖', '🥧', '🎂', '🧺', '🍱', '🏆'],
    levelNames: ['Wheat', 'Loaf', 'Pie', 'Cake', 'Basket', 'Feast', 'Fair Prize'],
  },
  {
    id: 'hearthfire',
    name: 'Hearthfire',
    levels: ['🕯️', '🏮', '🔥', '🌟'],
    levelNames: ['Candle', 'Lantern', 'Hearthfire', 'Beacon'],
  },
] as const;

export const BOARD_COLS = 6;
export const BOARD_ROWS = 7;
/** Cell index of the producer crate. */
export const PRODUCER_INDEX = 21; // row 3, col 3

/** Which chains the producer can spawn, with weights. */
export const SPAWN_TABLE: readonly { chain: 'wood' | 'harvest' | 'hearthfire'; weight: number }[] = [
  { chain: 'wood', weight: 42 },
  { chain: 'harvest', weight: 42 },
  { chain: 'hearthfire', weight: 16 },
];

export const ENERGY = {
  /** Starting balance for a fresh save. */
  initial: 12,
  /** Passive regen: 1 energy per this many ms. */
  regenMs: 3 * 60_000,
  /** Regen only accrues up to this cap; life-quest energy can exceed it. */
  regenCap: 30,
  /** Cost to tap the producer once. */
  spawnCost: 1,
} as const;

export const LIFE_QUESTS: readonly LifeQuestDef[] = [
  { id: 'steps', label: '4,200 steps', energy: 6, source: 'self-report' },
  { id: 'sleep', label: '7.5h sleep', energy: 8, source: 'self-report' },
  { id: 'water', label: 'Drink a glass of water', energy: 2, source: 'self-report' },
] as const;

/**
 * Chapter 1: The Letter. 12 orders; the order chain doubles as the story
 * spine, and every 3rd delivery advances a village restoration stage.
 */
export const ORDERS: readonly OrderDef[] = [
  {
    id: 'c1-01', who: 'Bran the baker',
    need: { chain: 'wood', level: 2 },
    text: 'Welcome to Emberhollow. The storm took half the square and the post office took the other half. Cut me planks and we’ll start with the notice board.',
    resolution: 'The notice board goes up. Pinned dead centre: a letter addressed to nobody, postmarked seventeen years ago.',
    rewardEnergy: 3, rewardCoins: 15,
  },
  {
    id: 'c1-02', who: 'Bran the baker',
    need: { chain: 'wood', level: 3 },
    text: 'That letter is Marta’s hand, I’d swear it on my ovens. Speaking of which, mine died the night it arrived. Bring a hammer and I’ll show you what it was hiding.',
    resolution: 'Inside the oven flue: a brass key, and a note. "Don’t trust the lighthouse keeper."',
    rewardEnergy: 4, rewardCoins: 20,
  },
  {
    id: 'c1-03', who: 'Wren the postmistress',
    need: { chain: 'hearthfire', level: 1 },
    text: 'A letter with no name wants reading by proper light. Bring me a lantern and keep your voice down.',
    resolution: 'Wren reads twice, then folds it fast. "It’s dated three days from now. That’s not possible."',
    rewardEnergy: 4, rewardCoins: 25,
  },
  {
    id: 'c1-04', who: 'Bran the baker',
    need: { chain: 'harvest', level: 2 },
    text: 'The keeper won’t talk to strangers. Everyone talks over pie. Bake one.',
    resolution: 'The keeper eats in silence, then whispers: "Marta didn’t drown. She rowed north."',
    rewardEnergy: 5, rewardCoins: 30,
  },
  {
    id: 'c1-05', who: 'Old Keeper Sorin',
    need: { chain: 'wood', level: 4 },
    text: 'You want the rest of it, you sit like a guest. My last chair went into the stove the winter the light went out.',
    resolution: 'Sorin sits, finally. "The light didn’t fail that night. Somebody shuttered it. I kept the bolt they used."',
    rewardEnergy: 5, rewardCoins: 35,
  },
  {
    id: 'c1-06', who: 'Old Keeper Sorin',
    need: { chain: 'hearthfire', level: 2 },
    text: 'If she rowed north she followed the old light. Kindle a hearthfire so she can find her way back.',
    resolution: 'The fire takes. Far out on the water, something answers with a flash. The square lamps come on for the first time in years.',
    rewardEnergy: 6, rewardCoins: 40,
  },
  {
    id: 'c1-07', who: 'Wren the postmistress',
    need: { chain: 'harvest', level: 4 },
    text: 'Half the village saw that flash and now they’re all in my post office asking questions. Feed them. A full basket buys us an hour of quiet.',
    resolution: 'Over bread and quiet, Wren lays out the letters. Nine of them. All Marta’s hand. All dated after she vanished.',
    rewardEnergy: 6, rewardCoins: 45,
  },
  {
    id: 'c1-08', who: 'Bran the baker',
    need: { chain: 'wood', level: 5 },
    text: 'The bakery cellar has a door I nailed shut the year she left. I’m ready to open it. Build me a new one first, so I can close it again if I’m wrong.',
    resolution: 'Behind the old door: an oilskin chart of the northern shoals, marked in Marta’s ink. One cove is circled twice.',
    rewardEnergy: 7, rewardCoins: 55,
  },
  {
    id: 'c1-09', who: 'Old Keeper Sorin',
    need: { chain: 'hearthfire', level: 3 },
    text: 'That cove sits behind the black rocks. A hearthfire won’t reach it. Build me a beacon and I’ll aim it myself.',
    resolution: 'The beacon sweeps the shoals. On the third pass it catches a rowboat, hauled above the tideline. Recently.',
    rewardEnergy: 8, rewardCoins: 65,
  },
  {
    id: 'c1-10', who: 'Wren the postmistress',
    need: { chain: 'harvest', level: 5 },
    text: 'If she’s coming in off that water she’ll be hungrier than pride allows. Set a proper feast. We’ll do the asking after.',
    resolution: 'Nobody comes to the feast. But in the morning a tenth letter is on the notice board. It says: "Fix the cottage. Please."',
    rewardEnergy: 8, rewardCoins: 75,
  },
  {
    id: 'c1-11', who: 'Old Keeper Sorin',
    need: { chain: 'wood', level: 6 },
    text: 'She’ll need a roof when she lands. The old cottage went to ruin the year she left. Build it back.',
    resolution: 'At dawn, smoke rises from the cottage chimney. Someone is home.',
    rewardEnergy: 9, rewardCoins: 90,
  },
  {
    id: 'c1-12', who: 'Marta',
    need: { chain: 'harvest', level: 3 },
    text: 'Seventeen missed birthdays. We are fixing one of them tonight. Make a cake.',
    resolution: 'End of Chapter 1. Marta sets a slice by the window, "for whoever is still out there." Behind her, unread, the eleventh letter.',
    rewardEnergy: 10, rewardCoins: 120,
  },
] as const;

/** Village restoration stages, unlocked by delivered-order count. */
export const ZONE_STAGES: readonly { at: number; label: string }[] = [
  { at: 0, label: 'Storm-struck square' },
  { at: 3, label: 'Notice board and lamplight' },
  { at: 6, label: 'Bakery breathing again' },
  { at: 9, label: 'Beacon on the shoals' },
  { at: 12, label: 'Emberhollow, restored' },
] as const;
