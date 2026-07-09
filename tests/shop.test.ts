import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { BOARD_SKINS } from '../src/data/shop';

// Give a fresh game some coins to spend without touching energy.
function richGame(coins: number): Game {
  const g = new Game(1);
  // finishDuel is the simplest coin faucet in tests (adds score coins).
  g.finishDuel(true, [], coins);
  return g;
}

describe('market: board skins', () => {
  it("defaults to the free 'classic' skin, which is always owned", () => {
    const g = new Game(1);
    expect(g.currentSkin()).toBe('classic');
    expect(g.ownsSkin('classic')).toBe(true);
    expect(g.ownsSkin('autumn')).toBe(false);
  });

  it('buying a skin spends coins, marks it owned, and equips it', () => {
    const skin = BOARD_SKINS.find((s) => s.id === 'autumn')!;
    const g = richGame(1000);
    const before = g.snapshot.coins;
    expect(g.buySkin(skin.id, skin.cost)).toBe(true);
    expect(g.snapshot.coins).toBe(before - skin.cost);
    expect(g.ownsSkin('autumn')).toBe(true);
    expect(g.currentSkin()).toBe('autumn');
  });

  it('re-equipping an owned skin is free', () => {
    const g = richGame(1000);
    g.buySkin('autumn', 150);
    g.equipSkin('classic');
    const coins = g.snapshot.coins;
    expect(g.buySkin('autumn', 150)).toBe(true); // owned → equip, no charge
    expect(g.snapshot.coins).toBe(coins);
    expect(g.currentSkin()).toBe('autumn');
  });

  it('cannot buy a skin you cannot afford', () => {
    const g = new Game(1); // ~0 coins
    expect(g.buySkin('twilight', 9999)).toBe(false);
    expect(g.ownsSkin('twilight')).toBe(false);
  });

  it('buying a skin never changes the energy balance (guardrail)', () => {
    const g = richGame(1000);
    const energy = g.snapshot.energy.current;
    g.buySkin('rose', 260);
    expect(g.snapshot.energy.current).toBe(energy);
  });
});
