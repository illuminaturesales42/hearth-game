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
  const dstCell = board.cells[to];
  if (!dstCell) return { board, merged: false, result: null };

  if (dstCell.kind === 'empty') {
    const next = withItem(withEmpty(board, from), to, src);
    return { board: next, merged: false, result: src };
  }
  if (dstCell.kind === 'item' && canMerge(src, dstCell.item)) {
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
