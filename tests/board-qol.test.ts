import { describe, expect, it } from 'vitest';
import {
  createBoard,
  dropItem,
  findMergePair,
  tidyBoard,
  toggleLock,
  trashMatching,
  withItem,
} from '../src/core/board';
import type { BoardState, Item } from '../src/core/types';

const item = (chain: Item['chain'], level: number, uid: number, locked = false): Item => ({
  chain,
  level,
  uid,
  locked,
});

// a 6x7 board with the producer at 21, seeded via withItem at given slots
function seed(entries: Array<[number, Item]>): BoardState {
  let b = createBoard(6, 7, 21);
  for (const [i, it] of entries) b = withItem(b, i, it);
  return b;
}

const items = (b: BoardState) => b.cells.filter((c) => c.kind === 'item');

describe('tidyBoard', () => {
  it('compacts scattered items to the front, skipping the producer cell', () => {
    const b = seed([
      [40, item('wood', 1, 1)],
      [5, item('harvest', 0, 2)],
      [30, item('wood', 3, 3)],
    ]);
    const t = tidyBoard(b);
    expect(t.cells[21]!.kind).toBe('producer'); // producer stays put
    // three items now packed at the lowest non-producer indices (0,1,2)
    expect(items(t).length).toBe(3);
    expect([t.cells[0], t.cells[1], t.cells[2]].every((c) => c?.kind === 'item')).toBe(true);
  });

  it('groups by chain then by level (highest first)', () => {
    const b = seed([
      [3, item('wood', 0, 1)],
      [10, item('wood', 2, 2)],
      [15, item('harvest', 1, 3)],
    ]);
    const t = tidyBoard(b);
    const seq = items(t).map((c) => (c.kind === 'item' ? `${c.item.chain}${c.item.level}` : ''));
    // wood before harvest (CHAINS order), wood level 2 before level 0
    expect(seq).toEqual(['wood2', 'wood0', 'harvest1']);
  });
});

describe('trashMatching', () => {
  it('clears unlocked items of a chain at or below the level, sparing locks and higher tiers', () => {
    const b = seed([
      [0, item('wood', 0, 1)],
      [1, item('wood', 1, 2)],
      [2, item('wood', 3, 3)], // above maxLvl → spared
      [3, item('wood', 0, 4, true)], // locked → spared
      [4, item('harvest', 0, 5)], // other chain → spared
    ]);
    const { board, cleared } = trashMatching(b, 'wood', 1);
    expect(cleared).toBe(2);
    expect(items(board).length).toBe(3);
  });
});

describe('locks', () => {
  it('a locked item cannot be dragged or merged into', () => {
    const b = seed([
      [0, item('wood', 0, 1, true)],
      [1, item('wood', 0, 2)],
    ]);
    // dragging the locked source is a no-op
    expect(dropItem(b, 0, 1, 99).board).toBe(b);
    // dragging onto the locked target does not merge
    const onto = dropItem(b, 1, 0, 99);
    expect(onto.merged).toBe(false);
  });

  it('toggleLock flips the flag on an item cell only', () => {
    const b = seed([[0, item('wood', 0, 1)]]);
    const locked = toggleLock(b, 0);
    const c = locked.cells[0]!;
    expect(c.kind === 'item' && c.item.locked).toBe(true);
    // non-item cell is a no-op (same reference)
    expect(toggleLock(b, 21)).toBe(b);
  });

  it('findMergePair skips locked items', () => {
    const b = seed([
      [0, item('wood', 0, 1, true)],
      [1, item('wood', 0, 2, true)],
    ]);
    expect(findMergePair(b)).toBeNull();
  });
});
