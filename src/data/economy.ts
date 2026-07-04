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

/** Chapter 1: The Letter. Order chain doubles as the story spine. */
export const ORDERS: readonly OrderDef[] = [
  {
    id: 'c1-01', who: 'Bran the baker',
    need: { chain: 'wood', level: 3 },
    text: 'The bakery oven died the night Marta’s letter arrived. Bring me a hammer and I’ll show you what she hid inside it.',
    resolution: 'Inside the oven flue: a brass key, and a note. "Don’t trust the lighthouse keeper."',
    rewardEnergy: 4, rewardCoins: 20,
  },
  {
    id: 'c1-02', who: 'Bran the baker',
    need: { chain: 'harvest', level: 2 },
    text: 'The keeper won’t talk to strangers. Everyone talks over pie. Bake one.',
    resolution: 'The keeper eats in silence, then whispers: "Marta didn’t drown. She rowed north."',
    rewardEnergy: 5, rewardCoins: 30,
  },
  {
    id: 'c1-03', who: 'Old Keeper Sorin',
    need: { chain: 'hearthfire', level: 2 },
    text: 'If she rowed north she followed the old light. Kindle a hearthfire so she can find her way back.',
    resolution: 'The fire takes. Far out on the water, something answers with a flash.',
    rewardEnergy: 6, rewardCoins: 40,
  },
  {
    id: 'c1-04', who: 'Old Keeper Sorin',
    need: { chain: 'wood', level: 6 },
    text: 'She’ll need a roof when she lands. The old cottage went to ruin the year she left. Build it back.',
    resolution: 'At dawn, smoke rises from the cottage chimney. Someone is home. Chapter 2 unlocked.',
    rewardEnergy: 8, rewardCoins: 80,
  },
  {
    id: 'c1-05', who: 'Marta',
    need: { chain: 'harvest', level: 3 },
    text: 'Seventeen missed birthdays. We are fixing one of them tonight. Make a cake.',
    resolution: 'End of Chapter 1. Marta sets a slice by the window, "for whoever is still out there."',
    rewardEnergy: 10, rewardCoins: 120,
  },
] as const;
