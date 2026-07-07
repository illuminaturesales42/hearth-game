import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { DECOR_CATALOG } from '../src/data/town-layout';
import { bestDuelMove, createDuel, duelMerge, duelWinner, raceMerge } from '../src/core/duel';
import { migrateState } from '../src/core/save';
import { localDayKey } from '../src/core/energy';

const T0 = new Date('2026-07-07T13:00:00').getTime();

describe('town decor — coins buy beauty, never power', () => {
  const bench = DECOR_CATALOG.find((d) => d.art === 'prop_bench')!;

  it('placing spends coins and joins the town; removing refunds in full', () => {
    const g = new Game(T0);
    g.finishDuel(true, [], 50); // seed some coins via a duel win
    const coins = g.snapshot.coins;
    expect(coins).toBeGreaterThanOrEqual(bench.cost);
    expect(g.placeDecor('prop_bench', 0.5, 0.6)).toBe(true);
    expect(g.snapshot.coins).toBe(coins - bench.cost);
    expect(g.snapshot.decor).toHaveLength(1);
    const id = g.snapshot.decor[0]!.id;
    g.removeDecor(id);
    expect(g.snapshot.coins).toBe(coins);
    expect(g.snapshot.decor).toHaveLength(0);
  });

  it('rejects placement without coins, off the island, or with unknown art', () => {
    const g = new Game(T0);
    expect(g.snapshot.coins).toBe(0);
    expect(g.placeDecor('prop_bench', 0.5, 0.6)).toBe(false);
    g.finishDuel(true, [], 50);
    expect(g.placeDecor('prop_bench', 0.5, 0.1)).toBe(false); // in the sky
    expect(g.placeDecor('prop_bench', 0.99, 0.6)).toBe(false); // off the edge
    expect(g.placeDecor('not_a_prop', 0.5, 0.6)).toBe(false);
    expect(g.snapshot.decor).toHaveLength(0);
  });

  it('decor and wellbeing survive the save round-trip', () => {
    const g = new Game(T0);
    g.finishDuel(true, [], 50);
    g.placeDecor('prop_lamp', 0.4, 0.55);
    g.logMeditation(12, T0);
    const revived = migrateState(JSON.parse(JSON.stringify(g.snapshot)));
    expect(revived).not.toBeNull();
    expect(revived!.decor).toHaveLength(1);
    expect(revived!.wellbeing.lastCalmDay).toBe(localDayKey(T0));
  });

  it('v10 saves climb to v11 with empty decor and a quiet-mind slate', () => {
    const g = new Game(T0);
    const v10 = { ...(JSON.parse(JSON.stringify(g.snapshot)) as Record<string, unknown>), version: 10 };
    delete (v10 as Record<string, unknown>).wellbeing;
    delete (v10 as Record<string, unknown>).decor;
    delete (v10 as Record<string, unknown>).nextDecorId;
    const up = migrateState(v10);
    expect(up).not.toBeNull();
    expect(up!.version).toBeGreaterThanOrEqual(11);
    expect(up!.decor).toEqual([]);
    expect(up!.wellbeing.lastCalmDay).toBeNull();
  });
});

describe('meditation marks the day calm', () => {
  it('logMeditation stamps wellbeing.lastCalmDay', () => {
    const g = new Game(T0);
    expect(g.snapshot.wellbeing.lastCalmDay).toBeNull();
    g.claimDaily(T0); // keep the daily bonus out of the way
    g.logMeditation(15, T0);
    expect(g.snapshot.wellbeing.lastCalmDay).toBe(localDayKey(T0));
  });
});

describe('duel AI — Old Joss plays greedy', () => {
  it('always picks a legal merge, preferring the highest level on the table', () => {
    const s = createDuel(42);
    const pick = bestDuelMove(s);
    expect(pick).not.toBeNull();
    const [from, to] = pick!;
    const a = s.board.cells[from]!;
    const b = s.board.cells[to]!;
    expect(a.kind).toBe('item');
    expect(b.kind).toBe('item');
    // the pick must actually merge
    const move = duelMerge(s, from, to);
    expect(move.merged).toBe(true);
    // and no other pair on the board offers a higher resulting level
    let bestPossible = -1;
    for (let i = 0; i < s.board.cells.length; i++) {
      const ci = s.board.cells[i]!;
      if (ci.kind !== 'item') continue;
      for (let j = i + 1; j < s.board.cells.length; j++) {
        const cj = s.board.cells[j]!;
        if (cj.kind !== 'item') continue;
        if (ci.item.chain === cj.item.chain && ci.item.level === cj.item.level) {
          bestPossible = Math.max(bestPossible, ci.item.level + 1);
        }
      }
    }
    expect(move.resultLevel).toBe(bestPossible);
  });

  it('can play a full game to completion against itself', () => {
    let s = createDuel(7);
    let guard = 0;
    while (!s.over && guard < 200) {
      const pick = bestDuelMove(s);
      expect(pick).not.toBeNull();
      s = duelMerge(s, pick![0], pick![1]).state;
      guard++;
    }
    expect(s.over).toBe(true);
    expect(bestDuelMove(s)).toBeNull();
    expect(s.scores[0] + s.scores[1]).toBeGreaterThan(0);
  });
});

describe('duel race mode — most pairs wins, no turns', () => {
  it('credits whoever takes the pair, without any turn gate', () => {
    let s = createDuel(11);
    const p1 = bestDuelMove(s)!;
    s = raceMerge(s, p1[0], p1[1], 0).state; // player grabs
    const p2 = bestDuelMove(s)!;
    s = raceMerge(s, p2[0], p2[1], 0).state; // player grabs AGAIN — no turns
    expect(s.scores[0]).toBeGreaterThan(0);
    expect(s.scores[1]).toBe(0);
    const p3 = bestDuelMove(s)!;
    s = raceMerge(s, p3[0], p3[1], 1).state; // Joss snatches one
    expect(s.scores[1]).toBeGreaterThan(0);
  });

  it('rejects non-pairs and finishes when the field runs dry', () => {
    let s = createDuel(23);
    // invalid: same index
    expect(raceMerge(s, 0, 0, 0).merged).toBe(false);
    let guard = 0;
    let who: 0 | 1 = 0;
    while (!s.over && guard < 200) {
      const pick = bestDuelMove(s)!;
      s = raceMerge(s, pick[0], pick[1], who).state;
      who = (who ^ 1) as 0 | 1; // simulate a close race
      guard++;
    }
    expect(s.over).toBe(true);
    expect(raceMerge(s, 0, 1, 0).merged).toBe(false); // over = locked
    expect([-1, 0, 1]).toContain(duelWinner(s));
    expect(s.moves[0] + s.moves[1]).toBe(guard);
  });
});
