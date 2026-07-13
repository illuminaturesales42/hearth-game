import { describe, expect, it } from 'vitest';
import { RESOURCE_SPAWN_TABLE, SPAWN_TABLE } from '../src/data/economy';
import { Game, pickSpawnChain } from '../src/core/game';

const firstItemIndex = (g: Game) => g.snapshot.board.cells.findIndex((c) => c.kind === 'item');

describe('workshop resource side-economy', () => {
  it('resource spawns are disjoint from story spawns (never dilute order pacing)', () => {
    const story = new Set(SPAWN_TABLE.map((e) => e.chain));
    for (const e of RESOURCE_SPAWN_TABLE) expect(story.has(e.chain)).toBe(false);
  });

  it('pickSpawnChain honours the table it is given', () => {
    const chain = pickSpawnChain(() => 0.99, RESOURCE_SPAWN_TABLE);
    expect(RESOURCE_SPAWN_TABLE.map((e) => e.chain)).toContain(chain);
  });

  it('the workshop stays locked (and mode toggle is a no-op) until the unlock threshold', () => {
    const g = new Game(1);
    expect(g.workshopUnlocked()).toBe(false);
    g.toggleProducerMode();
    expect(g.workshopMode()).toBe(false);
  });
});

describe('selling for coins', () => {
  it('grows the coin balance and clears the cell', () => {
    const g = new Game(1);
    const before = g.snapshot.coins;
    g.tapProducer();
    const idx = firstItemIndex(g);
    const got = g.sellItem(idx);
    expect(got).toBeGreaterThan(0);
    expect(g.snapshot.coins).toBe(before + got);
    expect(g.snapshot.board.cells[idx]!.kind).toBe('empty');
  });

  it('never converts coins into energy (guardrail)', () => {
    const g = new Game(1);
    g.tapProducer();
    const energyBefore = g.snapshot.energy.current; // after any spawn/regen
    g.sellItem(firstItemIndex(g));
    // a sale adds coins only — it must never move the energy balance
    expect(g.snapshot.energy.current).toBe(energyBefore);
  });

  it('a locked item cannot be sold', () => {
    const g = new Game(1);
    g.tapProducer();
    const idx = firstItemIndex(g);
    g.toggleLock(idx);
    expect(g.sellItem(idx)).toBe(0);
  });
});
