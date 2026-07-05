/** Shared domain types. Keep this file dependency-free. */

export type ChainId = 'wood' | 'harvest' | 'hearthfire';

export interface ChainDef {
  id: ChainId;
  name: string;
  /** Item display per level, index = level (0-based). Placeholder emoji art until the M2 art pass. */
  levels: readonly string[];
  levelNames: readonly string[];
}

export interface Item {
  chain: ChainId;
  level: number;
  /** Unique instance id for animation tracking. */
  uid: number;
}

/** A board cell is empty, an item, or the producer crate. */
export type Cell = { kind: 'empty' } | { kind: 'item'; item: Item } | { kind: 'producer' };

export interface BoardState {
  cols: number;
  rows: number;
  cells: readonly Cell[];
}

export interface OrderDef {
  id: string;
  /** Villager asking. */
  who: string;
  /** chain+level required. */
  need: { chain: ChainId; level: number };
  text: string;
  /** Story beat shown on delivery. */
  resolution: string;
  rewardEnergy: number;
  rewardCoins: number;
}

export interface LifeQuestDef {
  id: 'steps' | 'sleep' | 'water';
  label: string;
  energy: number;
  /** How the grant is sourced in production. Self-report in M1. */
  source: 'healthkit' | 'self-report';
}

export interface EnergyState {
  current: number;
  /** epoch ms of last time-regen accrual. */
  lastRegenAt: number;
  /** quest ids completed today (resets at local midnight). */
  questsDoneToday: readonly string[];
  questDay: string; // YYYY-MM-DD local
}

export interface HealthLedgerState {
  day: string;
  stepsGranted: number;
  sleepGranted: boolean;
}

export interface GameState {
  version: number;
  healthLedger?: HealthLedgerState;
  board: BoardState;
  energy: EnergyState;
  coins: number;
  xp: number;
  orderIndex: number;
  storySeen: readonly string[];
  nextUid: number;
}
