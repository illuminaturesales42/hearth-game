import { describe, expect, it } from 'vitest';
import { ORDERS } from '../src/data/economy';
import { BOARD_SKINS } from '../src/data/shop';

/**
 * Guards the COIN economy against the new sinks (skins, beautify) and sources
 * (orders, selling, quests, achievements, milestones): a player finishing
 * Chapter 1 should comfortably afford a cosmetic, and the priciest sink should
 * still be a meaningful goal — neither starving nor trivial.
 */
describe('coin economy pacing', () => {
  const chapter1Coins = ORDERS.slice(0, 12).reduce((s, o) => s + o.rewardCoins, 0);

  it('every order pays a positive coin reward', () => {
    for (const o of ORDERS) expect(o.rewardCoins).toBeGreaterThan(0);
  });

  it('Chapter 1 income comfortably covers the cheapest paid skin', () => {
    const cheapest = Math.min(...BOARD_SKINS.filter((s) => s.cost > 0).map((s) => s.cost));
    expect(chapter1Coins).toBeGreaterThan(cheapest * 2);
  });

  it('the priciest skin is a real goal, not trivially cheap', () => {
    const dearest = Math.max(...BOARD_SKINS.map((s) => s.cost));
    expect(dearest).toBeGreaterThan(chapter1Coins / 6);
  });

  it('the story rewards deepen — the final order pays more than the first', () => {
    expect(ORDERS[ORDERS.length - 1]!.rewardCoins).toBeGreaterThan(ORDERS[0]!.rewardCoins);
  });
});
