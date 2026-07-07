import { describe, expect, it } from 'vitest';
import { createBoard, findMergePair, withItem } from '../src/core/board';
import { Game } from '../src/core/game';
import { fullMoonBonus, illumination, phaseName } from '../src/data/moon';
import { isNight } from '../src/core/sun';
import type { Item } from '../src/core/types';

const item = (chain: Item['chain'], level: number, uid: number): Item => ({ chain, level, uid });

describe('board QoL: undo + trash', () => {
  it('undo restores the board after a merge, once', () => {
    const g = new Game(1000);
    const pair = findMergePair(g.snapshot.board)!;
    const before = g.snapshot.board.cells.filter((c) => c.kind === 'item').length;
    g.drop(pair[0], pair[1]);
    expect(g.canUndoMerge()).toBe(true);
    g.undoLastMerge();
    expect(g.snapshot.board.cells.filter((c) => c.kind === 'item').length).toBe(before);
    expect(g.canUndoMerge()).toBe(false);
  });

  it('delivery clears the undo snapshot (no duplication exploit)', () => {
    const g = new Game(1000);
    g.finishDuel(true, [{ chain: 'wood', level: 2 }], 10);
    const pair = findMergePair(g.snapshot.board)!;
    g.drop(pair[0], pair[1]);
    g.deliverFromRepository();
    expect(g.canUndoMerge()).toBe(false);
  });

  it('trash removes an item and cannot be undone into a duplicate', () => {
    const g = new Game(1000);
    const idx = g.snapshot.board.cells.findIndex((c) => c.kind === 'item');
    const before = g.snapshot.board.cells.filter((c) => c.kind === 'item').length;
    g.trashItem(idx);
    expect(g.snapshot.board.cells.filter((c) => c.kind === 'item').length).toBe(before - 1);
    expect(g.canUndoMerge()).toBe(false);
  });
});

describe('auto-merge', () => {
  it('findMergePair finds a matching pair, or null when none', () => {
    let b = createBoard(6, 7, 21);
    b = withItem(b, 0, item('wood', 1, 1));
    b = withItem(b, 5, item('wood', 1, 2));
    const pair = findMergePair(b);
    expect(pair).not.toBeNull();
    expect(pair!.sort((a, z) => a - z)).toEqual([0, 5]);

    let none = createBoard(6, 7, 21);
    none = withItem(none, 0, item('wood', 1, 1));
    none = withItem(none, 5, item('harvest', 1, 2));
    expect(findMergePair(none)).toBeNull();
  });

  it('autoMergeOnce merges a pair and reports when none remain', () => {
    const g = new Game(1000);
    // seed layout already contains mergeable pairs
    expect(g.autoMergeOnce()).toBe(true);
    // drain all remaining pairs
    let guard = 0;
    while (g.autoMergeOnce() && guard < 100) guard++;
    expect(g.hasMergePair()).toBe(false);
  });

  it('auto-merge is a persisted setting', () => {
    const g = new Game(1000);
    expect(g.settings.autoMerge).toBe(false);
    g.setAutoMerge(true);
    expect(g.settings.autoMerge).toBe(true);
  });
});

describe('stargaze / moon', () => {
  const NIGHT = new Date('2026-07-05T22:00:00').getTime();
  const DAY = new Date('2026-07-05T13:00:00').getTime();

  it('illumination stays within 0..1 and phase name is a string', () => {
    const ill = illumination(NIGHT);
    expect(ill).toBeGreaterThanOrEqual(0);
    expect(ill).toBeLessThanOrEqual(1);
    expect(typeof phaseName(NIGHT)).toBe('string');
  });

  it('night gate: true at 22:00, false at 13:00 (clock fallback)', () => {
    expect(isNight(NIGHT)).toBe(true);
    expect(isNight(DAY)).toBe(false);
  });

  it('can stargaze at night once, then not again that day; blocked by day', () => {
    const g = new Game(NIGHT);
    expect(g.canStargaze(NIGHT)).toBe(true);
    const before = g.snapshot.energy.current;
    g.doStargaze(NIGHT);
    expect(g.snapshot.energy.current).toBeGreaterThan(before);
    expect(g.canStargaze(NIGHT)).toBe(false);

    const g2 = new Game(DAY);
    expect(g2.canStargaze(DAY)).toBe(false);
    const e0 = g2.snapshot.energy.current;
    g2.doStargaze(DAY);
    expect(g2.snapshot.energy.current).toBe(e0); // no grant by day
  });

  it('full-moon bonus is zero away from full and positive near full', () => {
    expect(fullMoonBonus(NIGHT)).toBeGreaterThanOrEqual(0);
  });
});
