/**
 * Pure board logic. All functions return new state; nothing mutates.
 */
import type { BoardState, Cell, ChainId, Item } from './types';
import { CHAINS } from '../data/economy';

export function chainDef(id: ChainId) {
  const def = CHAINS.find((c) => c.id === id);
  if (!def) throw new Error(`Unknown chain: ${id}`);
  return def;
}

export function maxLevel(id: ChainId): number {
  return chainDef(id).levels.length - 1;
}

export function createBoard(cols: number, rows: number, producerIndex: number): BoardState {
  const cells: Cell[] = Array.from({ length: cols * rows }, () => ({ kind: 'empty' as const }));
  cells[producerIndex] = { kind: 'producer' };
  return { cols, rows, cells };
}

export function withItem(board: BoardState, index: number, item: Item): BoardState {
  const cells = board.cells.slice();
  cells[index] = { kind: 'item', item };
  return { ...board, cells };
}

export function withEmpty(board: BoardState, index: number): BoardState {
  const cells = board.cells.slice();
  cells[index] = { kind: 'empty' };
  return { ...board, cells };
}

export function emptyIndices(board: BoardState): number[] {
  const out: number[] = [];
  board.cells.forEach((c, i) => {
    if (c.kind === 'empty') out.push(i);
  });
  return out;
}

export function itemAt(board: BoardState, index: number): Item | null {
  const c = board.cells[index];
  return c && c.kind === 'item' ? c.item : null;
}

export function canMerge(a: Item, b: Item): boolean {
  return a.chain === b.chain && a.level === b.level && a.level < maxLevel(a.chain);
}

export interface MoveResult {
  board: BoardState;
  merged: boolean;
  /** The item now at the target cell, if any changed. */
  result: Item | null;
}

/**
 * Drop the item at `from` onto `to`.
 * - onto matching item -> merge (item of level+1 at `to`)
 * - onto empty -> move
 * - otherwise -> no-op (returns same board reference)
 */
export function dropItem(board: BoardState, from: number, to: number, nextUid: number): MoveResult {
  if (from === to) return { board, merged: false, result: null };
  const src = itemAt(board, from);
  if (!src) return { board, merged: false, result: null };
  if (src.locked) return { board, merged: false, result: null }; // pinned items don't move
  const dstCell = board.cells[to];
  if (!dstCell) return { board, merged: false, result: null };

  if (dstCell.kind === 'empty') {
    const next = withItem(withEmpty(board, from), to, src);
    return { board: next, merged: false, result: src };
  }
  if (dstCell.kind === 'item' && !dstCell.item.locked && canMerge(src, dstCell.item)) {
    const mergedItem: Item = { chain: src.chain, level: src.level + 1, uid: nextUid };
    const next = withItem(withEmpty(board, from), to, mergedItem);
    return { board: next, merged: true, result: mergedItem };
  }
  return { board, merged: false, result: null };
}

/** Find the index of any item matching chain+level, or -1. */
export function findItem(board: BoardState, chain: ChainId, level: number): number {
  return board.cells.findIndex((c) => c.kind === 'item' && c.item.chain === chain && c.item.level === level);
}

/**
 * Compact all items to the front of the board (skipping the producer cell) and
 * group them by chain (in CHAINS order) then by level (highest first), so the
 * board reads tidy. Pure — returns a new board. Locks are preserved.
 */
export function tidyBoard(board: BoardState): BoardState {
  const order = new Map(CHAINS.map((c, i) => [c.id, i] as const));
  const items: Item[] = [];
  board.cells.forEach((c) => {
    if (c.kind === 'item') items.push(c.item);
  });
  items.sort((a, b) => {
    const ca = order.get(a.chain) ?? 0;
    const cb = order.get(b.chain) ?? 0;
    if (ca !== cb) return ca - cb;
    return b.level - a.level;
  });
  const cells: Cell[] = board.cells.map((c) => (c.kind === 'producer' ? c : { kind: 'empty' as const }));
  let cursor = 0;
  for (const item of items) {
    while (cursor < cells.length && cells[cursor]!.kind === 'producer') cursor++;
    cells[cursor] = { kind: 'item', item };
    cursor++;
  }
  return { ...board, cells };
}

/**
 * Empty every unlocked item of `chain` at or below `maxLvl`. Returns the new
 * board and how many were cleared (for feedback). Locked items are spared.
 */
export function trashMatching(
  board: BoardState,
  chain: ChainId,
  maxLvl: number,
): { board: BoardState; cleared: number } {
  let cleared = 0;
  const cells = board.cells.map((c) => {
    if (c.kind === 'item' && c.item.chain === chain && c.item.level <= maxLvl && !c.item.locked) {
      cleared++;
      return { kind: 'empty' as const };
    }
    return c;
  });
  return { board: { ...board, cells }, cleared };
}

/** Toggle the lock flag on the item at `index` (no-op if not an item). */
export function toggleLock(board: BoardState, index: number): BoardState {
  const c = board.cells[index];
  if (!c || c.kind !== 'item') return board;
  return withItem(board, index, { ...c.item, locked: !c.item.locked });
}

/** First mergeable pair on the board as [keepIndex, consumeIndex], or null. */
export function findMergePair(board: BoardState): [number, number] | null {
  const items: { i: number; item: Item }[] = [];
  board.cells.forEach((c, i) => {
    if (c.kind === 'item' && !c.item.locked) items.push({ i, item: c.item });
  });
  for (let a = 0; a < items.length; a++) {
    for (let b = a + 1; b < items.length; b++) {
      if (canMerge(items[a]!.item, items[b]!.item)) return [items[a]!.i, items[b]!.i];
    }
  }
  return null;
}
