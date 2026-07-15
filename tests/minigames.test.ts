import { describe, expect, it } from 'vitest';
import {
  MINIGAME_EMBER_CAP,
  MINIGAME_ENERGY_COST,
  MINIGAME_MAX_TOKENS,
  addEmber,
  beaconDrop,
  beaconReward,
  beaconScore,
  catchReward,
  fishBite,
  forageField,
  forageTile,
  forgeReward,
  forgeSchedule,
  grantToken,
  initialMinigames,
  isEligible,
  recordBest,
  rolloverMinigames,
  spendToken,
  stacksDeck,
  stacksReward,
  tryUnlock,
  wellScore,
  wishingWellReward,
  BEACON_ROWS,
  FORAGE_SIZE,
  STACKS_PAIRS,
} from '../src/core/minigames';
import { ORDERS } from '../src/data/economy';
import { Game } from '../src/core/game';

describe('minigame engines are deterministic', () => {
  it('wishing well: reward is the AIMED ring (player-driven), centre roots deepest', () => {
    const a = wishingWellReward(2, 7, 8);
    const b = wishingWellReward(2, 7, 8);
    expect(a).toEqual(b);
    expect(a.slot).toBe(2); // aimed the centre → centre
    expect(a.items[0]!.chain).toBe('seeds');
    expect(a.items[0]!.level).toBe(2); // centre roots a fine seedling
    expect(wishingWellReward(0, 7, 8).slot).toBe(0); // aim an edge → edge
    // out-of-range aim clamps into the 5 rings
    expect(wishingWellReward(9, 7, 8).slot).toBe(4);
    // score is centre-100, edge-50 (personal-best metric, higher = closer)
    expect(wellScore(2)).toBe(100);
    expect(wellScore(0)).toBe(50);
    expect(wellScore(2)).toBeGreaterThan(wellScore(1));
  });

  it('beacon drop: aim dominates, seed adds a little drift, centre is the heart', () => {
    // Same aim + seed → same landing (deterministic).
    expect(beaconDrop(4, 42)).toBe(beaconDrop(4, 42));
    // Landing stays within a slot or two of the aim (aim, not luck, dominates).
    for (let seed = 0; seed < 40; seed++) {
      const slot = beaconDrop(4, seed);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThanOrEqual(BEACON_ROWS);
      expect(Math.abs(slot - 4)).toBeLessThanOrEqual(2);
    }
    const centre = beaconReward(BEACON_ROWS / 2);
    expect(centre.items[0]).toEqual({ chain: 'fish', level: 2 });
    expect(beaconReward(0).items[0]!.level).toBe(0);
    expect(beaconScore(BEACON_ROWS / 2)).toBe(100);
    expect(beaconScore(0)).toBe(0);
  });

  it('forge strike: schedule is seeded and never repeats a cell back-to-back', () => {
    const s1 = forgeSchedule(9, 14);
    const s2 = forgeSchedule(9, 14);
    expect(s1).toEqual(s2);
    expect(s1.length).toBe(14);
    for (let i = 1; i < s1.length; i++) expect(s1[i]!.cell).not.toBe(s1[i - 1]!.cell);
    // a clean run forges a bar (level 2); a total miss still yields copper
    expect(forgeReward(14, 14).items.some((i) => i.level === 2)).toBe(true);
    expect(forgeReward(0, 14).items.length).toBeGreaterThan(0);
  });

  it('joss’s catch: a clean strike lands a deeper fish, a miss still lands one', () => {
    expect(fishBite(4)).toEqual(fishBite(4)); // seeded bite timing
    expect(catchReward(1).items[0]).toEqual({ chain: 'fish', level: 2 });
    expect(catchReward(0).items[0]!.chain).toBe('fish'); // no-fail: still a fish
    expect(catchReward(0).items[0]!.level).toBe(0);
  });

  it('foraging: seeded field with exactly one heart; every tile pays a bounded find', () => {
    const a = forageField(11);
    const b = forageField(11);
    expect(a.kinds).toEqual(b.kinds);
    expect(a.kinds.length).toBe(FORAGE_SIZE);
    expect(a.kinds.filter((k) => k === 'heart').length).toBe(1);
    expect(a.kinds[a.heartIndex]).toBe('heart');
    expect(forageTile(11, a.heartIndex, 'heart').items[0]).toEqual({ chain: 'honey', level: 2 });
    expect(forageTile(11, 3, 'view')).toEqual({ coins: 0, items: [], ember: 0 }); // a lovely view is empty
  });

  it('sorting the stacks: seeded deck of pairs; a clean sort turns up a fine volume', () => {
    const d = stacksDeck(5);
    expect(d).toEqual(stacksDeck(5));
    expect(d.length).toBe(STACKS_PAIRS * 2);
    for (let v = 0; v < STACKS_PAIRS; v++) expect(d.filter((x) => x === v).length).toBe(2);
    expect(stacksReward(STACKS_PAIRS * 2).items[0]).toEqual({ chain: 'books', level: 2 }); // perfect
    expect(stacksReward(99).items[0]!.level).toBe(1); // sloppy but still books
  });
});

describe('minigame unlock, tokens and embers (pure)', () => {
  it('eligibility respects the building-returned gate and the L2 gate', () => {
    expect(isEligible('story', false, 0)).toBe(false); // building not back yet
    expect(isEligible('story', true, 0)).toBe(true); // opens when it returns
    expect(isEligible('l2', false, 1)).toBe(false); // cared-for but not returned
    expect(isEligible('l2', true, 0)).toBe(false); // building not cared for
    expect(isEligible('l2', true, 1)).toBe(true); // L2 reached
  });

  it('opens each eligible game (no daily throttle); already/ineligible handled', () => {
    let s = initialMinigames('2026-07-14');
    const first = tryUnlock(s, 'wishing-well', true, '2026-07-14');
    expect(first.outcome).toBe('opened');
    s = first.state;
    // a second, different game opens the same day — no throttle
    const second = tryUnlock(s, 'beacon-drop', true, '2026-07-14');
    expect(second.outcome).toBe('opened');
    s = second.state;
    // the same game again is 'already'
    expect(tryUnlock(s, 'wishing-well', true, '2026-07-14').outcome).toBe('already');
    // ineligible never opens
    expect(tryUnlock(initialMinigames('2026-07-16'), 'x', false, '2026-07-16').outcome).toBe('ineligible');
  });

  it('tokens grant capped, spend floored; embers cap per day; day rolls reset', () => {
    let s = initialMinigames('d1');
    expect(s.tokens).toBe(1);
    for (let i = 0; i < 10; i++) s = grantToken(s);
    expect(s.tokens).toBe(MINIGAME_MAX_TOKENS);
    s = spendToken(spendToken(spendToken(spendToken(s))));
    expect(s.tokens).toBe(0);
    const e1 = addEmber(s, 3);
    expect(e1.granted).toBe(3);
    const e2 = addEmber(e1.state, 10);
    expect(e2.granted).toBe(MINIGAME_EMBER_CAP - 3);
    expect(e2.state.emberToday).toBe(MINIGAME_EMBER_CAP);
    // a new day refills tokens and clears embers
    const rolled = rolloverMinigames(e2.state, 'd2');
    expect(rolled.tokens).toBe(1);
    expect(rolled.emberToday).toBe(0);
    expect(rolloverMinigames(rolled, 'd2')).toBe(rolled); // idempotent same day
  });
});

describe('Game ↔ Village Life', () => {
  it('is locked until its building returns, with a warm orders-to-go count', () => {
    const g = new Game(1000);
    const st = g.minigameStatus('prop_well');
    expect(st?.reason).toBe('locked-story');
    expect(st?.ordersToGo).toBe(6); // the well returns at order 6
    expect(g.startMinigame('wishing-well')).toBeNull();
  });

  it('each game unlocks progressively as its building returns (mid-story)', () => {
    const g = new Game(1000);
    g.devPreviewStory(6); // the well is back; the lighthouse (9) is not
    const well = g.minigameStatus('prop_well');
    expect(well?.unlocked).toBe(true); // story game auto-opens on return
    expect(well?.canPlay).toBe(true);
    const beacon = g.minigameStatus('prop_lighthouse');
    expect(beacon?.reason).toBe('locked-story');
    expect(beacon?.ordersToGo).toBe(3);
    g.devPreviewStory(9);
    expect(g.minigameStatus('prop_lighthouse')?.canPlay).toBe(true);
    // L2 game: building back at 21, but still needs caring for.
    g.devPreviewStory(21);
    expect(g.minigameStatus('town_blacksmith')?.reason).toBe('locked-l2');
  });

  it('building returned → doors open, a play spends energy + a token, rewards bank', () => {
    const g = new Game(1000);
    g.devPreviewStory(ORDERS.length); // finish the tale
    expect(g.isStoryComplete()).toBe(true);

    expect(g.openMinigameDoors('prop_well')).toBe('opened');
    expect(g.openMinigameDoors('prop_lighthouse')).toBe('opened'); // no daily throttle

    const energyBefore = g.snapshot.energy.current;
    const run = g.startMinigame('wishing-well');
    expect(run).not.toBeNull();
    expect(g.snapshot.energy.current).toBe(energyBefore - MINIGAME_ENERGY_COST);
    expect(g.minigameState.tokens).toBe(0);
    expect(g.canPlayMinigame('wishing-well')).toBe(false); // out of tokens

    const coinsBefore = g.snapshot.coins;
    g.finishMinigame(
      'wishing-well',
      { coins: 10, items: [{ chain: 'seeds', level: 1 }], ember: 2, heart: '' },
      { who: 'Marta', text: 'wishes for roses.' },
    );
    expect(g.snapshot.coins).toBe(coinsBefore + 10);
    expect(g.repository.some((r) => r.chain === 'seeds' && r.level === 1)).toBe(true);
    expect(g.minigameState.wishes[0]!.who).toBe('Marta');
    expect(g.minigameState.emberToday).toBe(2);
  });

  it('story-gated games auto-open the moment their building returns (no extra "open" tap)', () => {
    const g = new Game(1000);
    // Before the well is back, it's locked.
    expect(g.minigameStatus('prop_well')?.reason).toBe('locked-story');
    g.devPreviewStory(6);
    // Now the well is immediately unlocked + playable — the bug was needing a
    // separate openMinigameDoors tap first, which read as "the game won't launch".
    const st = g.minigameStatus('prop_well');
    expect(st?.unlocked).toBe(true);
    expect(st?.canPlay).toBe(true);
    expect(g.canPlayMinigame('wishing-well')).toBe(true);
    expect(g.startMinigame('wishing-well')).not.toBeNull();
  });

  it('tester mode reaches every game at any story progress', () => {
    const g = new Game(1000); // order 0 — nothing returned
    g.setTesterUnlimited(true);
    for (const art of [
      'prop_well',
      'prop_lighthouse',
      'town_blacksmith',
      'town_fisherhut',
      'town_garden',
      'town_library',
    ]) {
      const st = g.minigameStatus(art);
      expect(st?.reason).toBe('ready');
    }
  });

  it('L2 games still require the building be cared for, then opened', () => {
    const g = new Game(1000);
    g.devPreviewStory(ORDERS.length);
    // forge-strike is an L2 game on town_blacksmith — not auto-open.
    expect(g.minigameStatus('town_blacksmith')?.reason).toBe('locked-l2');
    expect(g.minigameStatus('town_blacksmith')?.unlocked).toBe(false);
  });

  it('personal best keeps the higher score and flags a new best', () => {
    const s0 = initialMinigames('2026-07-15');
    const r1 = recordBest(s0, 'wishing-well', 50);
    expect(r1.isBest).toBe(true);
    expect(r1.state.bests?.['wishing-well']).toBe(50);
    const r2 = recordBest(r1.state, 'wishing-well', 40); // worse → not a best
    expect(r2.isBest).toBe(false);
    expect(r2.state.bests?.['wishing-well']).toBe(50);
    const r3 = recordBest(r2.state, 'wishing-well', 100); // better → new best
    expect(r3.isBest).toBe(true);
    expect(r3.state.bests?.['wishing-well']).toBe(100);
  });

  it('finishMinigame records a personal best and reports it', () => {
    const g = new Game(1000);
    g.devPreviewStory(ORDERS.length);
    const first = g.finishMinigame(
      'wishing-well',
      { coins: 10, items: [{ chain: 'seeds', level: 1 }], ember: 1, heart: '' },
      undefined,
      wellScore(1),
    );
    expect(first.isBest).toBe(true);
    expect(g.minigameBest('wishing-well')).toBe(wellScore(1));
    const second = g.finishMinigame(
      'wishing-well',
      { coins: 14, items: [{ chain: 'seeds', level: 2 }], ember: 2, heart: '' },
      undefined,
      wellScore(2),
    );
    expect(second.isBest).toBe(true); // centre beats adjacent
    expect(g.minigameBest('wishing-well')).toBe(100);
  });

  it('a real-world action tops up a mini-game attempt', () => {
    const g = new Game(1000);
    g.devPreviewStory(ORDERS.length);
    g.openMinigameDoors('prop_well');
    g.startMinigame('wishing-well'); // tokens 1 → 0
    expect(g.minigameState.tokens).toBe(0);
    g.completeAction('breathe'); // living well earns another go
    expect(g.minigameState.tokens).toBe(1);
  });

  it('gathered loot can be gifted for coins from the Repository', () => {
    const g = new Game(1000);
    g.devPreviewStory(ORDERS.length);
    g.openMinigameDoors('town_fisherhut');
    // Bank a fish (a mini-game chain the town orders never ask for).
    g.finishMinigame('joss-catch', { coins: 0, items: [{ chain: 'fish', level: 2 }], ember: 0, heart: '' });
    expect(g.repository.some((r) => r.chain === 'fish' && r.level === 2)).toBe(true);

    const reqs = g.repositoryRequests();
    const fishReq = reqs.find((r) => r.chain === 'fish' && r.level === 2);
    expect(fishReq).toBeTruthy();

    const coinsBefore = g.snapshot.coins;
    expect(g.giveFromRepository('fish', 2)).toBe(true);
    expect(g.snapshot.coins).toBe(coinsBefore + fishReq!.coins);
    expect(g.repository.some((r) => r.chain === 'fish' && r.level === 2)).toBe(false);
    // Nothing left to give → the request is gone and a second gift fails.
    expect(g.giveFromRepository('fish', 2)).toBe(false);
  });
});
