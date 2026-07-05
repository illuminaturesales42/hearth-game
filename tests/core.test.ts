import { describe, expect, it } from 'vitest';
import { canMerge, createBoard, dropItem, findItem, itemAt, withItem } from '../src/core/board';
import { accrueRegen, initialEnergy, msToNextTick, spend } from '../src/core/energy';
import { Game, pickSpawnChain } from '../src/core/game';
import { BOARD_COLS, BOARD_ROWS, ENERGY, ORDERS, PRODUCER_INDEX } from '../src/data/economy';
import type { Item } from '../src/core/types';

const item = (chain: Item['chain'], level: number, uid = 1): Item => ({ chain, level, uid });

describe('board', () => {
  it('creates a board with a producer', () => {
    const b = createBoard(BOARD_COLS, BOARD_ROWS, PRODUCER_INDEX);
    expect(b.cells[PRODUCER_INDEX]).toEqual({ kind: 'producer' });
    expect(b.cells.filter((c) => c.kind === 'empty').length).toBe(BOARD_COLS * BOARD_ROWS - 1);
  });

  it('merges equal items into level+1', () => {
    let b = createBoard(6, 7, 21);
    b = withItem(b, 0, item('wood', 0, 1));
    b = withItem(b, 1, item('wood', 0, 2));
    const res = dropItem(b, 0, 1, 99);
    expect(res.merged).toBe(true);
    expect(itemAt(res.board, 1)).toEqual({ chain: 'wood', level: 1, uid: 99 });
    expect(itemAt(res.board, 0)).toBeNull();
  });

  it('moves onto empty, rejects mismatch', () => {
    let b = createBoard(6, 7, 21);
    b = withItem(b, 0, item('wood', 0, 1));
    b = withItem(b, 1, item('harvest', 0, 2));
    const move = dropItem(b, 0, 5, 99);
    expect(move.merged).toBe(false);
    expect(itemAt(move.board, 5)).not.toBeNull();
    const rejected = dropItem(b, 0, 1, 99);
    expect(rejected.board).toBe(b);
  });

  it('does not merge max-level items', () => {
    expect(canMerge(item('hearthfire', 3, 1), item('hearthfire', 3, 2))).toBe(false);
  });

  it('findItem locates chain+level', () => {
    let b = createBoard(6, 7, 21);
    b = withItem(b, 17, item('harvest', 2, 5));
    expect(findItem(b, 'harvest', 2)).toBe(17);
    expect(findItem(b, 'harvest', 3)).toBe(-1);
  });
});

describe('energy', () => {
  const T0 = new Date('2026-07-05T10:00:00').getTime();

  it('accrues 1 per regenMs up to cap', () => {
    let e = initialEnergy(T0);
    e = spend(e, ENERGY.initial); // to zero
    const after = accrueRegen(e, T0 + ENERGY.regenMs * 3 + 500);
    expect(after.current).toBe(3);
  });

  it('never regens past cap but keeps quest energy above cap', () => {
    let e = initialEnergy(T0);
    e = { ...e, current: ENERGY.regenCap + 10 };
    const after = accrueRegen(e, T0 + ENERGY.regenMs * 5);
    expect(after.current).toBe(ENERGY.regenCap + 10);
  });

  it('reports time to next tick', () => {
    const e = initialEnergy(T0);
    expect(msToNextTick(e, T0 + 1000)).toBe(ENERGY.regenMs - 1000);
  });
});

describe('game', () => {
  it('spawning spends energy and fills a cell', () => {
    const g = new Game(1_000);
    const before = g.snapshot.energy.current;
    g.tapProducer(1_000);
    expect(g.snapshot.energy.current).toBe(before - ENERGY.spawnCost);
    const items = g.snapshot.board.cells.filter((c) => c.kind === 'item').length;
    expect(items).toBeGreaterThan(8); // seeds + spawn
  });

  it('delivery consumes the item, pays rewards, advances the order', () => {
    const g = new Game(1_000);
    const order = ORDERS[0]!;
    // Plant the needed item directly via the private state (test seam).
    const idx = g.snapshot.board.cells.findIndex((c) => c.kind === 'empty');
    const withNeeded = withItem(g.snapshot.board, idx, { chain: order.need.chain, level: order.need.level, uid: 777 });
    Object.assign(g as unknown as { state: unknown }, { state: { ...g.snapshot, board: withNeeded } });
    expect(g.deliverableIndex()).toBe(idx);
    const coinsBefore = g.snapshot.coins;
    g.deliver();
    expect(g.snapshot.coins).toBe(coinsBefore + order.rewardCoins);
    expect(g.snapshot.orderIndex).toBe(1);
    expect(findItem(g.snapshot.board, order.need.chain, order.need.level)).toBe(-1);
  });

  it('spawn chain picker respects the weight table domain', () => {
    for (const r of [0, 0.2, 0.5, 0.9, 0.999]) {
      expect(['wood', 'harvest', 'hearthfire']).toContain(pickSpawnChain(() => r));
    }
  });
});
