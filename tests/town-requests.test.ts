import { describe, expect, it } from 'vitest';
import { requestsForDay } from '../src/data/town-requests';
import { RESOURCE_SPAWN_TABLE } from '../src/data/economy';
import { Game } from '../src/core/game';

describe('town requests', () => {
  it('generates three requests for craftable resource chains with positive coins', () => {
    const rs = requestsForDay('2026-07-10');
    expect(rs).toHaveLength(3);
    const resourceChains = new Set(RESOURCE_SPAWN_TABLE.map((e) => e.chain));
    for (const r of rs) {
      expect(resourceChains.has(r.chain)).toBe(true); // always fulfillable via the Workshop
      expect(r.coins).toBeGreaterThan(0);
      expect(r.qty).toBeGreaterThanOrEqual(2);
    }
  });

  it('are hidden until the Workshop unlocks, then show three', () => {
    const g = new Game(1);
    expect(g.activeRequests().length).toBe(0);
    g.devPreviewStory(8);
    expect(g.activeRequests().length).toBe(3);
  });

  it('fulfilment fails without the items and never touches energy (guardrail)', () => {
    const g = new Game(1);
    g.devPreviewStory(8);
    const req = g.activeRequests()[0]!;
    const coins = g.snapshot.coins;
    const energy = g.snapshot.energy.current;
    expect(g.canFulfil(req)).toBe(false);
    expect(g.fulfilRequest(req.id)).toBe(false);
    expect(g.snapshot.coins).toBe(coins);
    expect(g.snapshot.energy.current).toBe(energy);
  });
});
