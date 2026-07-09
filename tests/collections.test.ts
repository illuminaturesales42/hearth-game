import { describe, expect, it } from 'vitest';
import { COLLECTIONS } from '../src/data/world';
import { CHAINS } from '../src/data/economy';
import { Game } from '../src/core/game';

describe('collection payoffs', () => {
  it('every collection targets a real chain with a positive coin reward', () => {
    for (const c of COLLECTIONS) {
      expect(CHAINS.some((d) => d.id === c.chain)).toBe(true);
      expect(c.coins).toBeGreaterThan(0);
    }
  });

  it('a fresh game shows real zero progress, nothing claimed', () => {
    const g = new Game(1);
    for (const c of COLLECTIONS) {
      const p = g.collectionProgress(c.id);
      expect(p.have).toBe(0);
      expect(p.total).toBeGreaterThan(0);
      expect(p.done).toBe(false);
    }
  });
});
