import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { migrateState } from '../src/core/save';

const T0 = new Date('2026-07-07T13:00:00').getTime();

/** Give the game coins + reached story without touching the board. */
function withCoinsAndStory(coins: number, orderIndex: number): Game {
  const g = new Game(T0);
  g.finishDuel(true, [], coins); // duel win banks coins (mult may add a little)
  g.devPreviewStory(orderIndex);
  return g;
}

describe('building upgrades — coins buy pride, never power', () => {
  it('a returned building can be upgraded through two tiers', () => {
    const g = withCoinsAndStory(500, 4); // bakery returns at order 4
    expect(g.upgradeTier('town_bakery')).toBe(0);
    expect(g.canUpgrade('town_bakery')).toBe(true);
    expect(g.upgradeBuilding('town_bakery')).toBe(true);
    expect(g.upgradeTier('town_bakery')).toBe(1);
    expect(g.upgradeBuilding('town_bakery')).toBe(true);
    expect(g.upgradeTier('town_bakery')).toBe(2);
  });

  it('caps at the top tier', () => {
    const g = withCoinsAndStory(2000, 4);
    g.upgradeBuilding('town_bakery');
    g.upgradeBuilding('town_bakery');
    expect(g.upgradeTier('town_bakery')).toBe(2);
    expect(g.canUpgrade('town_bakery')).toBe(false);
    expect(g.upgradeCost('town_bakery')).toBeNull();
    expect(g.upgradeBuilding('town_bakery')).toBe(false);
  });

  it('spends coins at the escalating cost', () => {
    const g = withCoinsAndStory(500, 4);
    const before = g.snapshot.coins;
    g.upgradeBuilding('town_bakery'); // costs 120
    expect(g.snapshot.coins).toBe(before - Game.UPGRADE_COSTS[0]);
    const mid = g.snapshot.coins;
    g.upgradeBuilding('town_bakery'); // costs 320
    expect(g.snapshot.coins).toBe(mid - Game.UPGRADE_COSTS[1]);
  });

  it('cannot upgrade a building that has not returned yet', () => {
    const g = withCoinsAndStory(2000, 2); // bakery (order 4) not yet back
    expect(g.canUpgrade('town_bakery')).toBe(false);
    expect(g.upgradeBuilding('town_bakery')).toBe(false);
    expect(g.upgradeTier('town_bakery')).toBe(0);
  });

  it('cannot upgrade without enough coins', () => {
    const g = new Game(T0);
    g.devPreviewStory(4); // bakery back, but no coins
    expect(g.snapshot.coins).toBeLessThan(Game.UPGRADE_COSTS[0]);
    expect(g.canUpgrade('town_bakery')).toBe(false);
    expect(g.upgradeBuilding('town_bakery')).toBe(false);
  });

  it('emits an upgrade event', () => {
    const g = withCoinsAndStory(500, 4);
    const seen: number[] = [];
    g.subscribe((ev) => {
      if (ev.type === 'upgrade') seen.push(ev.tier);
    });
    g.upgradeBuilding('town_bakery');
    expect(seen).toEqual([1]);
  });

  it('survives the save round-trip and migrates from v12', () => {
    const g = withCoinsAndStory(500, 4);
    g.upgradeBuilding('town_bakery');
    const revived = migrateState(JSON.parse(JSON.stringify(g.snapshot)));
    expect(revived).not.toBeNull();
    expect(revived!.buildingUpgrades['town_bakery']).toBe(1);

    const v12 = { ...(JSON.parse(JSON.stringify(g.snapshot)) as Record<string, unknown>), version: 12 };
    delete (v12 as Record<string, unknown>).buildingUpgrades;
    const up = migrateState(v12);
    expect(up).not.toBeNull();
    expect(up!.version).toBeGreaterThanOrEqual(13);
    expect(up!.buildingUpgrades).toEqual({});
  });
});
