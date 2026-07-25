import { describe, expect, it } from 'vitest';
import {
  addToRepository,
  boardSpoils,
  createDuel,
  duelMerge,
  duelMultiplier,
  duelWinner,
  mergePoints,
} from '../src/core/duel';
import { findMergePair } from '../src/core/board';
import { Game } from '../src/core/game';
import { ACHIEVEMENTS } from '../src/core/achievements';

describe('duel engine', () => {
  it('creates a full board with mergeable pairs', () => {
    const d = createDuel(42);
    const filled = d.board.cells.filter((c) => c.kind === 'item').length;
    expect(filled).toBe(d.board.cols * d.board.rows);
    expect(findMergePair(d.board)).not.toBeNull();
  });

  it('is deterministic for a given seed', () => {
    const a = createDuel(7);
    const b = createDuel(7);
    expect(boardSpoils(a.board)).toEqual(boardSpoils(b.board));
  });

  it('a merge scores by result level, flips the turn, and consumes a cell', () => {
    let d = createDuel(3);
    const pair = findMergePair(d.board)!;
    const before = d.board.cells.filter((c) => c.kind === 'item').length;
    const startTurn = d.turn;
    const move = duelMerge(d, pair[1], pair[0]);
    expect(move.merged).toBe(true);
    expect(move.state.scores[startTurn]).toBe(mergePoints(move.resultLevel));
    expect(move.state.turn).not.toBe(startTurn);
    expect(move.state.board.cells.filter((c) => c.kind === 'item').length).toBe(before - 1);
    d = move.state;
  });

  it('plays to completion and declares a winner (or tie)', () => {
    let d = createDuel(9);
    let guard = 0;
    while (!d.over && guard < 500) {
      const pair = findMergePair(d.board);
      if (!pair) break;
      d = duelMerge(d, pair[0], pair[1]).state;
      guard++;
    }
    expect(d.over).toBe(true);
    expect([-1, 0, 1]).toContain(duelWinner(d));
  });

  it('win-streak multiplier grows and caps', () => {
    expect(duelMultiplier(0)).toBeCloseTo(1);
    expect(duelMultiplier(1)).toBeCloseTo(1.15);
    expect(duelMultiplier(6)).toBeCloseTo(1.9);
    expect(duelMultiplier(50)).toBeCloseTo(1.9);
  });

  it('addToRepository accumulates counts', () => {
    let repo = addToRepository(
      [],
      [
        { chain: 'wood', level: 1 },
        { chain: 'wood', level: 1 },
      ],
    );
    expect(repo).toEqual([{ chain: 'wood', level: 1, count: 2 }]);
    repo = addToRepository(repo, [{ chain: 'harvest', level: 0 }]);
    expect(repo.length).toBe(2);
  });
});

describe('duel → repository → story', () => {
  it('a win banks spoils, grows the streak, and pays multiplied coins', () => {
    const g = new Game(1000);
    const coinsBefore = g.snapshot.coins;
    g.finishDuel(true, [{ chain: 'wood', level: 2 }], 100);
    expect(g.duelStreak).toBe(1);
    expect(g.repository.some((r) => r.chain === 'wood' && r.level === 2)).toBe(true);
    // duel coins + the first-win achievement payoff granted in the same sweep
    const firstWin = ACHIEVEMENTS.find((a) => a.id === 'first-duel-win')!.coins;
    expect(g.snapshot.coins).toBe(coinsBefore + Math.round(100 * duelMultiplier(1)) + firstWin);
  });

  it('rewards are capped per day so the instant-rematch loop is not an infinite faucet', () => {
    const g = new Game(1000);
    // Three wins pay out (coins climb, spoils bank).
    for (let i = 0; i < 3; i++) g.finishDuel(true, [{ chain: 'wood', level: 0 }], 40);
    const coinsAfter3 = g.snapshot.coins;
    const itemsAfter3 = g.repository.reduce((n, r) => n + r.count, 0);
    // The 4th and 5th wins still count for the streak but pay nothing.
    g.finishDuel(true, [{ chain: 'wood', level: 0 }], 40);
    g.finishDuel(true, [{ chain: 'wood', level: 0 }], 40);
    expect(g.snapshot.coins).toBe(coinsAfter3); // no more coins past the daily cap
    expect(g.repository.reduce((n, r) => n + r.count, 0)).toBe(itemsAfter3); // no more spoils
    expect(g.duelStreak).toBe(5); // ...but the mechanic still feels alive
  });

  it('a loss resets the streak with no other penalty', () => {
    const g = new Game(1000);
    g.finishDuel(true, [{ chain: 'wood', level: 1 }], 50);
    g.finishDuel(false, [], 0);
    expect(g.duelStreak).toBe(0);
  });

  it('Repository items can be delivered to the current story order', () => {
    const g = new Game(1000);
    // First order needs wood level 2 (see economy ORDERS c1-01).
    g.finishDuel(true, [{ chain: 'wood', level: 2 }], 10);
    expect(g.canDeliverFromRepository()).toBe(true);
    const orderBefore = g.snapshot.orderIndex;
    g.deliverFromRepository();
    expect(g.snapshot.orderIndex).toBe(orderBefore + 1);
    expect(g.repository.some((r) => r.chain === 'wood' && r.level === 2)).toBe(false);
  });
});
