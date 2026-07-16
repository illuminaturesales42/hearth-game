import { describe, expect, it } from 'vitest';
import { MINIGAME_CHAINS, holds, repoRequestCoins, repoRequestsFor, takeFromRepository } from '../src/core/repository';
import type { RepositoryItem } from '../src/core/types';

const repo = (items: RepositoryItem[]): readonly RepositoryItem[] => items;

describe('repository — standing village requests', () => {
  it('lists a request for every held mini-game chain, and nothing for board chains', () => {
    const held = repo([
      { chain: 'fish', level: 2, count: 3 },
      { chain: 'honey', level: 1, count: 1 },
      { chain: 'wood', level: 3, count: 5 }, // board POOL chain — never requested
      { chain: 'harvest', level: 2, count: 2 }, // board POOL chain
    ]);
    const reqs = repoRequestsFor(held, '2026-07-14');
    const chains = reqs.map((r) => r.chain).sort();
    expect(chains).toEqual(['fish', 'honey']);
    expect(reqs.every((r) => MINIGAME_CHAINS.includes(r.chain))).toBe(true);
  });

  it('never lists a request for something not held (cannot block progress)', () => {
    expect(repoRequestsFor(repo([]), '2026-07-14')).toEqual([]);
    expect(repoRequestsFor(repo([{ chain: 'wood', level: 1, count: 9 }]), '2026-07-14')).toEqual([]);
  });

  it('is deterministic per day seed — same holdings + day → identical requests', () => {
    const held = repo([
      { chain: 'copper', level: 2, count: 1 },
      { chain: 'books', level: 3, count: 2 },
    ]);
    const a = repoRequestsFor(held, '2026-07-14');
    const b = repoRequestsFor(held, '2026-07-14');
    expect(a).toEqual(b);
  });

  it('coins deepen with level and are gentle (coins-led, never energy)', () => {
    expect(repoRequestCoins(1)).toBe(21);
    expect(repoRequestCoins(3)).toBeGreaterThan(repoRequestCoins(1));
    const reqs = repoRequestsFor(repo([{ chain: 'fish', level: 4, count: 1 }]), 'd');
    expect(reqs[0]!.coins).toBe(repoRequestCoins(4));
  });

  it('takeFromRepository removes exactly one and prunes empty stacks', () => {
    const held = repo([
      { chain: 'fish', level: 2, count: 2 },
      { chain: 'honey', level: 1, count: 1 },
    ]);
    const once = takeFromRepository(held, 'fish', 2);
    expect(once.find((r) => r.chain === 'fish')!.count).toBe(1);
    const twice = takeFromRepository(takeFromRepository(held, 'honey', 1), 'honey', 1);
    expect(twice.find((r) => r.chain === 'honey')).toBeUndefined();
  });

  it('holds() reflects presence of a specific (chain, level)', () => {
    const held = repo([{ chain: 'fish', level: 2, count: 1 }]);
    expect(holds(held, 'fish', 2)).toBe(true);
    expect(holds(held, 'fish', 1)).toBe(false);
    expect(holds(held, 'copper', 2)).toBe(false);
  });
});
