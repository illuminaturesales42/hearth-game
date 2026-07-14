import { afterEach, describe, expect, it, vi } from 'vitest';
import { Game } from '../src/core/game';

describe('event fan-out resilience', () => {
  afterEach(() => vi.restoreAllMocks());

  it('a throwing subscriber cannot wedge the other subscribers or the game loop', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined); // expected: the bad listener logs
    const g = new Game(1000);
    let reached = 0;
    g.subscribe(() => {
      throw new Error('a broken UI view');
    });
    g.subscribe(() => {
      reached += 1;
    });
    // tapProducer emits 'spawn' (+ a follow-up 'state'); both must still reach the good listener.
    g.tapProducer();
    expect(reached).toBeGreaterThan(0);
    // and the game itself kept working (an item was spawned onto the board)
    expect(g.snapshot.board.cells.some((c) => c.kind === 'item')).toBe(true);
  });
});
