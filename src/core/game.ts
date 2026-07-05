/**
 * Game orchestrator: owns GameState, exposes actions, notifies subscribers.
 * UI layers subscribe; core stays DOM-free.
 */
import type { GameState, Item } from './types';
import { createBoard, dropItem, emptyIndices, findItem, itemAt, withEmpty, withItem } from './board';
import { accrueRegen, canSpend, completeQuest, grant, initialEnergy, spend } from './energy';
import { BOARD_COLS, BOARD_ROWS, ENERGY, ORDERS, PRODUCER_INDEX, SPAWN_TABLE } from '../data/economy';
import { loadState, saveState } from './save';
import { applySnapshot, initialLedger } from '../health/health-energy';
import type { HealthSnapshot } from '../health/health-provider';

export type GameEvent =
  | { type: 'state' }
  | { type: 'spawn'; index: number }
  | { type: 'merge'; index: number; item: Item }
  | { type: 'reject'; index: number; reason: 'energy' | 'full' | 'invalid' }
  | { type: 'delivered'; orderId: string; resolution: string; rewardEnergy: number; rewardCoins: number }
  | { type: 'quest'; questId: string; granted: number }
  | { type: 'health'; energy: number; fromSteps: number; fromSleep: number }
  | { type: 'chapterComplete' };

type Listener = (ev: GameEvent) => void;

export class Game {
  private state: GameState;
  private listeners: Listener[] = [];

  constructor(now = Date.now()) {
    this.state = loadState() ?? Game.freshState(now);
    this.state = { ...this.state, energy: accrueRegen(this.state.energy, now) };
  }

  static freshState(now: number): GameState {
    let board = createBoard(BOARD_COLS, BOARD_ROWS, PRODUCER_INDEX);
    // Opening layout: enough to teach merging in the first 20 seconds.
    const seeds: { i: number; chain: Item['chain']; level: number }[] = [
      { i: 8, chain: 'wood', level: 0 }, { i: 10, chain: 'wood', level: 0 },
      { i: 14, chain: 'wood', level: 1 }, { i: 26, chain: 'wood', level: 1 },
      { i: 27, chain: 'harvest', level: 0 }, { i: 29, chain: 'harvest', level: 0 },
      { i: 33, chain: 'hearthfire', level: 0 }, { i: 35, chain: 'hearthfire', level: 0 },
    ];
    let uid = 1;
    for (const s of seeds) board = withItem(board, s.i, { chain: s.chain, level: s.level, uid: uid++ });
    return {
      version: 1,
      board,
      energy: initialEnergy(now),
      coins: 0,
      xp: 0,
      orderIndex: 0,
      storySeen: [],
      nextUid: uid,
    };
  }

  get snapshot(): GameState {
    return this.state;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private emit(ev: GameEvent): void {
    saveState(this.state);
    for (const l of this.listeners) l(ev);
    if (ev.type !== 'state') for (const l of this.listeners) l({ type: 'state' });
  }

  /** Call on a timer to accrue passive regen. */
  tick(now = Date.now()): void {
    const next = accrueRegen(this.state.energy, now);
    if (next !== this.state.energy) {
      this.state = { ...this.state, energy: next };
      this.emit({ type: 'state' });
    }
  }

  tapProducer(now = Date.now()): void {
    this.state = { ...this.state, energy: accrueRegen(this.state.energy, now) };
    if (!canSpend(this.state.energy, ENERGY.spawnCost)) {
      this.emit({ type: 'reject', index: PRODUCER_INDEX, reason: 'energy' });
      return;
    }
    const empties = emptyIndices(this.state.board);
    if (empties.length === 0) {
      this.emit({ type: 'reject', index: PRODUCER_INDEX, reason: 'full' });
      return;
    }
    const chain = pickSpawnChain(Math.random);
    const index = empties[Math.floor(Math.random() * empties.length)]!;
    const item: Item = { chain, level: 0, uid: this.state.nextUid };
    this.state = {
      ...this.state,
      energy: spend(this.state.energy, ENERGY.spawnCost),
      board: withItem(this.state.board, index, item),
      nextUid: this.state.nextUid + 1,
    };
    this.emit({ type: 'spawn', index });
  }

  drop(from: number, to: number): void {
    const res = dropItem(this.state.board, from, to, this.state.nextUid);
    if (res.board === this.state.board) {
      this.emit({ type: 'reject', index: to, reason: 'invalid' });
      return;
    }
    this.state = {
      ...this.state,
      board: res.board,
      nextUid: res.merged ? this.state.nextUid + 1 : this.state.nextUid,
      xp: res.merged ? this.state.xp + (res.result?.level ?? 0) : this.state.xp,
    };
    if (res.merged && res.result) this.emit({ type: 'merge', index: to, item: res.result });
    else this.emit({ type: 'state' });
  }

  /** Index of the board item satisfying the current order, or -1. */
  deliverableIndex(): number {
    const order = ORDERS[this.state.orderIndex];
    if (!order) return -1;
    return findItem(this.state.board, order.need.chain, order.need.level);
  }

  deliver(): void {
    const order = ORDERS[this.state.orderIndex];
    const idx = this.deliverableIndex();
    if (!order || idx < 0) {
      this.emit({ type: 'reject', index: -1, reason: 'invalid' });
      return;
    }
    this.state = {
      ...this.state,
      board: withEmpty(this.state.board, idx),
      energy: grant(this.state.energy, order.rewardEnergy),
      coins: this.state.coins + order.rewardCoins,
      orderIndex: this.state.orderIndex + 1,
      storySeen: [...this.state.storySeen, order.id],
    };
    this.emit({
      type: 'delivered',
      orderId: order.id,
      resolution: order.resolution,
      rewardEnergy: order.rewardEnergy,
      rewardCoins: order.rewardCoins,
    });
    if (this.state.orderIndex >= ORDERS.length) this.emit({ type: 'chapterComplete' });
  }

  /**
   * Sync a health snapshot into energy. Idempotent per day; safe to call on
   * every app foreground. Emits 'health' only when something was granted.
   */
  syncHealth(snap: HealthSnapshot, now = Date.now()): void {
    const ledger = this.state.healthLedger ?? initialLedger(now);
    const res = applySnapshot(ledger, snap, now);
    this.state = { ...this.state, healthLedger: res.ledger };
    if (res.energy > 0) {
      this.state = { ...this.state, energy: grant(this.state.energy, res.energy) };
      this.emit({ type: 'health', energy: res.energy, fromSteps: res.fromSteps, fromSleep: res.fromSleep });
    } else {
      saveState(this.state);
    }
  }

  doLifeQuest(questId: string, now = Date.now()): void {
    const res = completeQuest(this.state.energy, questId, now);
    this.state = { ...this.state, energy: res.state };
    this.emit({ type: 'quest', questId, granted: res.granted });
  }

  itemAt(index: number): Item | null {
    return itemAt(this.state.board, index);
  }

  reset(now = Date.now()): void {
    this.state = Game.freshState(now);
    this.emit({ type: 'state' });
  }
}

export function pickSpawnChain(rand: () => number): Item['chain'] {
  const total = SPAWN_TABLE.reduce((s, e) => s + e.weight, 0);
  let roll = rand() * total;
  for (const e of SPAWN_TABLE) {
    roll -= e.weight;
    if (roll <= 0) return e.chain;
  }
  return SPAWN_TABLE[SPAWN_TABLE.length - 1]!.chain;
}
