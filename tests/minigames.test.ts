import { describe, expect, it } from 'vitest';
import {
  MINIGAME_BASE_TOKENS,
  MINIGAME_EMBER_CAP,
  MINIGAME_ENERGY_COST,
  MINIGAME_MAX_TOKENS,
  addEmber,
  beaconDrop,
  beaconPegField,
  beaconReward,
  beaconScore,
  catchReward,
  comboStep,
  fishBite,
  forageDistance,
  forageField,
  forageReward,
  forageTile,
  forgeReward,
  forgeSchedule,
  forgeScore,
  grantToken,
  initialMinigames,
  isEligible,
  recordBest,
  rolloverMinigames,
  sawmillReward,
  sawmillSchedule,
  sawmillScore,
  spendToken,
  stacksDeck,
  stacksPairsFor,
  stacksReward,
  tryUnlock,
  wellScore,
  wishingWellReward,
  BEACON_EMBER_R,
  BEACON_ROWS,
  FORAGE_SIZE,
  SAWMILL_DURATION_MS,
  SAWMILL_FALL_MS,
  SAWMILL_LANES,
  STACKS_PAIRS,
  STACKS_PAIRS_RAMPED,
  WELL_MULT,
} from '../src/core/minigames';
import { MINIGAME_BY_ID } from '../src/data/minigames';
import { ORDERS } from '../src/data/economy';
import { Game } from '../src/core/game';

describe('shared feel helpers', () => {
  it('comboStep climbs on a hit and soft-decays one step on a miss (never below 0)', () => {
    expect(comboStep(0, true)).toBe(1);
    expect(comboStep(4, true)).toBe(5);
    expect(comboStep(4, false)).toBe(3); // one step down, not a shatter
    expect(comboStep(0, false)).toBe(0);
  });
});

describe('minigame engines are deterministic', () => {
  it('wishing well: three pebbles, centre streak deepens the whole run', () => {
    const a = wishingWellReward([2, 2, 2], 7, 8);
    const b = wishingWellReward([2, 2, 2], 7, 8);
    expect(a).toEqual(b);
    expect(a.centres).toBe(3);
    expect(a.items[0]!.chain).toBe('seeds');
    expect(a.items[0]!.level).toBe(3); // a triple-centre run roots the deepest seed
    // the multiplier makes the ceiling ~3-4× the floor
    const floor = wishingWellReward([0, 0, 0], 7, 8);
    expect(a.coins).toBeGreaterThanOrEqual(floor.coins * 3);
    expect(floor.coins).toBeGreaterThanOrEqual(6); // no-fail floor
    expect(floor.items.length).toBeGreaterThanOrEqual(1);
    // banking early (fewer pebbles) still pays, still no-fail
    expect(wishingWellReward([2, 2], 7, 8).coins).toBeGreaterThanOrEqual(6);
    // out-of-range aims clamp into the 5 rings
    expect(wishingWellReward([9, -3, 2], 7, 8).centres).toBe(1);
    // score: more centres → higher; three centres caps at 100
    expect(wellScore([2, 2, 2])).toBe(100);
    expect(wellScore([2, 2, 2])).toBeGreaterThan(wellScore([2, 2, 0]));
    expect(wellScore([1])).toBeGreaterThan(wellScore([0]));
    expect(WELL_MULT[0]).toBe(1);
  });

  it('beacon drop: aim dominates, golden peg blesses the run, centre is the heart', () => {
    expect(beaconDrop(4, 42)).toBe(beaconDrop(4, 42));
    for (let seed = 0; seed < 40; seed++) {
      const slot = beaconDrop(4, seed);
      expect(slot).toBeGreaterThanOrEqual(0);
      expect(slot).toBeLessThanOrEqual(BEACON_ROWS);
      expect(Math.abs(slot - 4)).toBeLessThanOrEqual(2);
    }
    const centre = beaconReward(BEACON_ROWS / 2);
    expect(centre.items[0]).toEqual({ chain: 'fish', level: 2 });
    expect(beaconReward(0).items[0]!.level).toBe(0);
    // the golden peg raises coins and the catch by a level
    const golden = beaconReward(BEACON_ROWS / 2, true);
    expect(golden.coins).toBe(centre.coins + 8);
    expect(golden.items[0]!.level).toBe(3);
    expect(beaconScore(BEACON_ROWS / 2, true)).toBe(100);
    expect(beaconScore(BEACON_ROWS / 2)).toBeLessThan(100); // the golden peg completes it
    expect(beaconScore(0)).toBeLessThanOrEqual(12);
  });

  it('beacon pegfield: seeded, varied, spaced, and always passable', () => {
    const a = beaconPegField(31);
    expect(a).toEqual(beaconPegField(31));
    // different seeds lay different boards (replay variety)
    expect(a).not.toEqual(beaconPegField(32));
    expect(a.length).toBeGreaterThan(12);
    const golden = a.filter((p) => p.kind === 'golden');
    expect(golden.length).toBe(1);
    expect(a.filter((p) => p.kind === 'bumper').length).toBeGreaterThanOrEqual(2);
    const clearance = BEACON_EMBER_R * 2 * 1.6;
    for (const p of a) {
      expect(p.x).toBeGreaterThanOrEqual(0.06);
      expect(p.x).toBeLessThanOrEqual(0.94);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
      for (const q of a) {
        if (p === q) continue;
        // surface-to-surface spacing lets the ember through everywhere
        expect(Math.hypot(p.x - q.x, (p.y - q.y) * 1.15) - (p.r + q.r)).toBeGreaterThanOrEqual(clearance - 1e-9);
      }
    }
  });

  it('forge strike: seeded three-wave schedule ramps denser and hotter', () => {
    const s1 = forgeSchedule(9);
    expect(s1).toEqual(forgeSchedule(9));
    expect(s1.length).toBe(20);
    // ascending spawn times
    for (let i = 1; i < s1.length; i++) expect(s1[i]!.atMs).toBeGreaterThanOrEqual(s1[i - 1]!.atMs);
    // the ramp: early lumps stay hot longer than late ones (finale pairs aside)
    const early = s1[0]!.ttlMs;
    const lateRamp = s1[s1.length - 5]!.ttlMs;
    expect(early).toBeGreaterThan(lateRamp);
    // reward: floor guaranteed, perfects and streaks raise the ceiling
    expect(forgeReward(0, 20).items.length).toBeGreaterThan(0);
    expect(forgeReward(0, 20).coins).toBeGreaterThanOrEqual(6);
    const good = forgeReward(16, 20, 4, 4);
    const master = forgeReward(18, 20, 9, 8);
    expect(master.coins).toBeGreaterThan(good.coins);
    expect(master.items.some((i) => i.level === 3)).toBe(true);
    expect(good.items.some((i) => i.level === 2)).toBe(true);
    // a long streak banks an extra ingot
    expect(forgeReward(10, 20, 0, 6).items.length).toBeGreaterThan(forgeReward(10, 20, 0, 2).items.length);
    expect(forgeScore(10, 4, 6)).toBeGreaterThan(forgeScore(9, 4, 6));
  });

  it('joss’s catch: strike THEN reel — both clean surfaces the rare fish', () => {
    expect(fishBite(4)).toEqual(fishBite(4)); // seeded bite timing
    expect(catchReward(1, 1).items[0]).toEqual({ chain: 'fish', level: 3 }); // both perfect: the rarity
    expect(catchReward(1, 0.3).items[0]!.level).toBe(2);
    expect(catchReward(0, 0).items[0]!.chain).toBe('fish'); // no-fail: still a fish
    expect(catchReward(0, 0).items[0]!.level).toBe(0);
    expect(catchReward(1, 1).coins).toBeGreaterThan(catchReward(0.5, 0.3).coins);
  });

  it('foraging: seeded field with one heart, a warmth trail, and clearings', () => {
    const a = forageField(11);
    expect(a.kinds).toEqual(forageField(11).kinds);
    expect(a.kinds.length).toBe(FORAGE_SIZE);
    expect(a.kinds.filter((k) => k === 'heart').length).toBe(1);
    expect(a.kinds.filter((k) => k === 'clearing').length).toBe(2);
    expect(a.kinds[a.heartIndex]).toBe('heart');
    // warmth is the king-move distance to the heart — 0 at the heart itself
    expect(a.warmth[a.heartIndex]).toBe(0);
    expect(a.warmth.length).toBe(FORAGE_SIZE);
    expect(forageDistance(0, 24)).toBe(4);
    expect(forageTile(11, a.heartIndex, 'heart').items[0]).toEqual({ chain: 'honey', level: 2 });
    expect(forageTile(11, 3, 'view')).toEqual({ coins: 0, items: [], ember: 0 });
    // the banked run: finding the heart with steps to spare pays the bonus
    const found = { coins: 20, items: [{ chain: 'honey' as const, level: 2 }], ember: 2 };
    expect(forageReward(found, true, 3).coins).toBe(29);
    expect(forageReward(found, false, 3).coins).toBe(20); // no heart, no bonus
    // no-fail floor: an empty basket still comes home with something
    expect(forageReward({ coins: 0, items: [], ember: 0 }, false, 0).coins).toBeGreaterThanOrEqual(6);
    expect(forageReward({ coins: 0, items: [], ember: 0 }, false, 0).items.length).toBe(1);
  });

  it('sorting the stacks: bigger shelf, streaks earn the finer volumes', () => {
    const d = stacksDeck(5);
    expect(d).toEqual(stacksDeck(5));
    expect(d.length).toBe(STACKS_PAIRS * 2);
    for (let v = 0; v < STACKS_PAIRS; v++) expect(d.filter((x) => x === v).length).toBe(2);
    // streaks drive the reward now — five from memory finds the rare volume
    expect(stacksReward(STACKS_PAIRS, 5).items.some((i) => i.level === 3)).toBe(true);
    expect(stacksReward(STACKS_PAIRS + 1, 3).items.some((i) => i.level === 2)).toBe(true);
    expect(stacksReward(99, 0).items[0]!.level).toBe(1); // sloppy but still books
    expect(stacksReward(STACKS_PAIRS, 5).coins).toBeGreaterThan(stacksReward(99, 0).coins);
    // a strong best deals the bigger shelf next time (gentle, invisible ramp)
    expect(stacksPairsFor(undefined)).toBe(STACKS_PAIRS);
    expect(stacksPairsFor(10)).toBe(STACKS_PAIRS);
    expect(stacksPairsFor(24)).toBe(STACKS_PAIRS_RAMPED);
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
    expect(s.tokens).toBe(MINIGAME_BASE_TOKENS); // generous enough to learn a game
    for (let i = 0; i < 10; i++) s = grantToken(s);
    expect(s.tokens).toBe(MINIGAME_MAX_TOKENS);
    for (let i = 0; i < MINIGAME_MAX_TOKENS + 1; i++) s = spendToken(s);
    expect(s.tokens).toBe(0);
    const e1 = addEmber(s, 3);
    expect(e1.granted).toBe(3);
    // request more than the day's remaining pool — grant clamps to the cap
    const e2 = addEmber(e1.state, MINIGAME_EMBER_CAP + 5);
    expect(e2.granted).toBe(MINIGAME_EMBER_CAP - 3);
    expect(e2.state.emberToday).toBe(MINIGAME_EMBER_CAP);
    // a new day refills tokens and clears embers
    const rolled = rolloverMinigames(e2.state, 'd2');
    expect(rolled.tokens).toBe(MINIGAME_BASE_TOKENS);
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
    const tokensBefore = g.minigameState.tokens;
    const run = g.startMinigame('wishing-well');
    expect(run).not.toBeNull();
    expect(g.snapshot.energy.current).toBe(energyBefore - MINIGAME_ENERGY_COST);
    expect(g.minigameState.tokens).toBe(tokensBefore - 1);

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
      wellScore([1, 1, 1]),
    );
    expect(first.isBest).toBe(true);
    expect(g.minigameBest('wishing-well')).toBe(wellScore([1, 1, 1]));
    const second = g.finishMinigame(
      'wishing-well',
      { coins: 14, items: [{ chain: 'seeds', level: 2 }], ember: 2, heart: '' },
      undefined,
      wellScore([2, 2, 2]),
    );
    expect(second.isBest).toBe(true); // centres beat adjacent rings
    expect(g.minigameBest('wishing-well')).toBe(100);
  });

  it('a real-world action tops up a mini-game attempt', () => {
    const g = new Game(1000);
    g.devPreviewStory(ORDERS.length);
    g.openMinigameDoors('prop_well');
    const before = g.minigameState.tokens;
    g.startMinigame('wishing-well'); // spends one
    expect(g.minigameState.tokens).toBe(before - 1);
    g.completeAction('breathe'); // living well earns another go
    expect(g.minigameState.tokens).toBe(before);
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

describe('The Saw Song (sawmill) engine', () => {
  it('schedule is deterministic, in-bounds, ascending, lane-spaced, and ends on the strum', () => {
    const a = sawmillSchedule(7);
    expect(a).toEqual(sawmillSchedule(7));
    // different seeds cut different songs
    expect(a).not.toEqual(sawmillSchedule(8));
    const strums = a.filter((sp) => sp.kind === 'strum');
    expect(strums.length).toBe(1); // one big finale note
    expect(a[a.length - 1]!.kind).toBe('strum'); // and it ends the song
    const laneLast: Record<number, number> = {};
    let prevAt = -1;
    for (const sp of a) {
      expect(sp.lane).toBeGreaterThanOrEqual(0);
      expect(sp.lane).toBeLessThan(SAWMILL_LANES);
      expect(sp.atMs).toBeGreaterThanOrEqual(0);
      expect(sp.atMs).toBeLessThan(SAWMILL_DURATION_MS - SAWMILL_FALL_MS);
      expect(sp.atMs).toBeGreaterThanOrEqual(prevAt); // sorted ascending
      prevAt = sp.atMs;
      if (sp.kind === 'strum') continue;
      const lastInLane = laneLast[sp.lane];
      // no two logs ever overlap on one flume
      if (lastInLane !== undefined) expect(sp.atMs - lastInLane).toBeGreaterThanOrEqual(SAWMILL_FALL_MS * 0.6 - 1e-9);
      laneLast[sp.lane] = sp.atMs;
    }
    // the crescendo carries hold notes for variety
    expect(a.some((sp) => sp.kind === 'hold')).toBe(true);
  });

  it('reward is no-fail: zero hits still stacks timber', () => {
    const r = sawmillReward(0, 0, 22);
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    expect(r.items[0]!.chain).toBe('wood');
    expect(r.coins).toBeGreaterThanOrEqual(6);
    expect(r.ember).toBeGreaterThanOrEqual(1);
  });

  it('reward rises with accuracy and streak; beams need clean cuts', () => {
    const low = sawmillReward(5, 0, 22);
    const mid = sawmillReward(12, 2, 22);
    const high = sawmillReward(20, 8, 22, 10);
    expect(mid.coins).toBeGreaterThan(low.coins);
    expect(high.coins).toBeGreaterThan(mid.coins);
    expect(mid.items.some((i) => i.level === 2)).toBe(true);
    expect(high.items.some((i) => i.level === 3)).toBe(true);
    // high accuracy WITHOUT clean cuts stays at planks
    expect(sawmillReward(20, 2, 22).items.some((i) => i.level === 3)).toBe(false);
    // the streak sweetens the coins
    expect(sawmillReward(12, 2, 22, 8).coins).toBeGreaterThan(sawmillReward(12, 2, 22, 0).coins);
  });

  it('score is monotone in each part', () => {
    expect(sawmillScore(10, 3, 5)).toBeGreaterThan(sawmillScore(9, 3, 5));
    expect(sawmillScore(10, 4, 5)).toBeGreaterThan(sawmillScore(10, 3, 5));
    expect(sawmillScore(10, 3, 6)).toBeGreaterThan(sawmillScore(10, 3, 5));
  });

  it('is registered against the sawmill building', () => {
    expect(MINIGAME_BY_ID['sawmill']!.buildingArt).toBe('town_sawmill');
    expect(MINIGAME_BY_ID['sawmill']!.unlock).toBe('l2');
  });
});
