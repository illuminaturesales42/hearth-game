import { describe, expect, it } from 'vitest';
import { endlessOrderFor, isEndless, orderAt } from '../src/data/endless';
import { ORDERS } from '../src/data/economy';
import { maxLevel } from '../src/core/board';
import { Game } from '../src/core/game';

describe('endless town-needs', () => {
  it('is deterministic, always buildable, and coins-led (energy stays a token)', () => {
    expect(endlessOrderFor(5)).toEqual(endlessOrderFor(5));
    for (let n = 0; n < 60; n++) {
      const o = endlessOrderFor(n);
      expect(o.need.level).toBeGreaterThanOrEqual(0);
      expect(o.need.level).toBeLessThanOrEqual(maxLevel(o.need.chain)); // never impossible
      expect(o.rewardEnergy).toBeLessThanOrEqual(2); // the pillar: real actions stay the engine
      expect(o.rewardCoins).toBeGreaterThan(0);
    }
  });

  it('orderAt bridges the authored story into the endless run', () => {
    expect(orderAt(0)).toBe(ORDERS[0]);
    expect(orderAt(ORDERS.length - 1)).toBe(ORDERS[ORDERS.length - 1]);
    expect(isEndless(ORDERS.length - 1)).toBe(false);
    expect(isEndless(ORDERS.length)).toBe(true);
    expect(orderAt(ORDERS.length).id).toBe('endless-0');
  });

  it('the merge→deliver loop never runs dry past order 72', () => {
    const g = new Game(1000);
    g.devPreviewStory(ORDERS.length); // finish the tale
    const order = g.currentOrder();
    expect(order.id).toBe('endless-0');
    expect(g.deliverableIndex()).toBe(-1); // nothing on the board yet — but the order exists

    // A mini-game / duel reward can satisfy it, just like a board merge.
    g.finishDuel(true, [{ chain: order.need.chain, level: order.need.level }], 0);
    expect(g.canDeliverFromRepository()).toBe(true);
    const before = g.snapshot.orderIndex;
    g.deliverFromRepository();
    expect(g.snapshot.orderIndex).toBe(before + 1);
    expect(g.currentOrder().id).toBe('endless-1'); // the village keeps asking
  });
});
