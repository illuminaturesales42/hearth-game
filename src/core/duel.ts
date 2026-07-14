/**
 * Bonfire Duel — the PvP variant. Two players share ONE board that starts full;
 * they take alternating turns making merges (Match Masters model). No producers,
 * no refill: it's a race on the starting board, and every merge you take may
 * open (or deny) a move for your opponent. Most points when no merges remain
 * wins, and takes all items left on the board into their Repository.
 *
 * Pure + deterministic (seeded), so it's testable and fair.
 */
import type { BoardState, ChainId, Item, RepositoryItem } from './types';
import { canMerge, createBoard, findMergePair, itemAt, withEmpty, withItem } from './board';
import { maxLevel } from './board';

export const DUEL_COLS = 6;
export const DUEL_ROWS = 6;

const CHAINS: ChainId[] = ['wood', 'harvest', 'hearthfire'];

export interface DuelState {
  board: BoardState;
  scores: [number, number];
  turn: 0 | 1;
  moves: [number, number];
  over: boolean;
  nextUid: number;
}

function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** A full, seeded board of low-level items (levels 0–1) — plenty of pairs to fight over. */
export function createDuel(seed: number, cols = DUEL_COLS, rows = DUEL_ROWS): DuelState {
  const rand = lcg(seed);
  let board = createBoard(cols, rows, -1); // -1 = no producer cell
  let uid = 1;
  for (let i = 0; i < cols * rows; i++) {
    const chain = CHAINS[Math.floor(rand() * CHAINS.length)]!;
    const level = rand() < 0.72 ? 0 : 1;
    board = withItem(board, i, { chain, level, uid: uid++ });
  }
  return { board, scores: [0, 0], turn: 0, moves: [0, 0], over: false, nextUid: uid };
}

/** Points for creating an item of `resultLevel` (higher merges are worth more). */
export function mergePoints(resultLevel: number): number {
  return resultLevel * 10;
}

export interface DuelMove {
  state: DuelState;
  merged: boolean;
  resultLevel: number;
}

/**
 * RACE merge (the shipped duel mode): no turns — whoever spots a pair first
 * takes it. `player` gets the points; the round ends when the board runs dry.
 */
export function raceMerge(state: DuelState, from: number, to: number, player: 0 | 1): DuelMove {
  if (state.over || from === to) return { state, merged: false, resultLevel: -1 };
  const a = itemAt(state.board, from);
  const b = itemAt(state.board, to);
  if (!a || !b || !canMerge(a, b)) return { state, merged: false, resultLevel: -1 };
  const level = a.level + 1;
  const merged: Item = { chain: a.chain, level, uid: state.nextUid };
  const board = withItem(withEmpty(state.board, from), to, merged);
  const scores: [number, number] = [...state.scores];
  scores[player] += mergePoints(level);
  const moves: [number, number] = [...state.moves];
  moves[player] += 1;
  const over = findMergePair(board) === null;
  return {
    state: { board, scores, turn: state.turn, moves, over, nextUid: state.nextUid + 1 },
    merged: true,
    resultLevel: level,
  };
}

/** Turn-based merge (kept for the future async-with-friends mode). */
export function duelMerge(state: DuelState, from: number, to: number): DuelMove {
  if (state.over || from === to) return { state, merged: false, resultLevel: -1 };
  const a = itemAt(state.board, from);
  const b = itemAt(state.board, to);
  if (!a || !b || !canMerge(a, b)) return { state, merged: false, resultLevel: -1 };
  const level = a.level + 1;
  const merged: Item = { chain: a.chain, level, uid: state.nextUid };
  const board = withItem(withEmpty(state.board, from), to, merged);
  const scores: [number, number] = [...state.scores];
  scores[state.turn] += mergePoints(level);
  const moves: [number, number] = [...state.moves];
  moves[state.turn] += 1;
  const over = findMergePair(board) === null;
  return {
    state: {
      board,
      scores,
      turn: over ? state.turn : ((state.turn ^ 1) as 0 | 1),
      moves,
      over,
      nextUid: state.nextUid + 1,
    },
    merged: true,
    resultLevel: level,
  };
}

/**
 * A sharp-but-simple opponent: takes the merge with the highest resulting
 * level (the most points this turn). No lookahead — beatable with planning.
 */
export function bestDuelMove(state: DuelState): [number, number] | null {
  if (state.over) return null;
  let best: [number, number] | null = null;
  let bestLevel = -1;
  const cells = state.board.cells;
  for (let i = 0; i < cells.length; i++) {
    const a = cells[i]!;
    if (a.kind !== 'item') continue;
    for (let j = i + 1; j < cells.length; j++) {
      const b = cells[j]!;
      if (b.kind !== 'item' || !canMerge(a.item, b.item)) continue;
      if (a.item.level + 1 > bestLevel) {
        bestLevel = a.item.level + 1;
        best = [i, j];
      }
    }
  }
  return best;
}

/** -1 tie, else 0 or 1. */
export function duelWinner(state: DuelState): -1 | 0 | 1 {
  if (state.scores[0] === state.scores[1]) return -1;
  return state.scores[0] > state.scores[1] ? 0 : 1;
}

/** All items left on the board — the spoils the winner banks. */
export function boardSpoils(board: BoardState): { chain: ChainId; level: number }[] {
  const out: { chain: ChainId; level: number }[] = [];
  board.cells.forEach((c) => {
    if (c.kind === 'item') out.push({ chain: c.item.chain, level: c.item.level });
  });
  return out;
}

/** Win-streak multiplier applied to duel rewards: +15% per consecutive win, capped. */
export function duelMultiplier(streak: number): number {
  return 1 + 0.15 * Math.min(Math.max(streak, 0), 6);
}

/** Fold won items into the Repository, accumulating counts. */
export function addToRepository(
  repo: readonly RepositoryItem[],
  items: readonly { chain: ChainId; level: number }[],
): RepositoryItem[] {
  const next = repo.map((r) => ({ ...r }));
  for (const it of items) {
    const found = next.find((r) => r.chain === it.chain && r.level === it.level);
    if (found) found.count += 1;
    else next.push({ chain: it.chain, level: it.level, count: 1 });
  }
  return next;
}

export { maxLevel };
