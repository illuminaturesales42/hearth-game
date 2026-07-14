import { describe, expect, it } from 'vitest';
import {
  MINIGAME_EMBER_CAP,
  MINIGAME_ENERGY_COST,
  MINIGAME_MAX_TOKENS,
  addEmber,
  beaconPath,
  beaconReward,
  beaconSlot,
  catchReward,
  fishBite,
  forageField,
  forageTile,
  forgeReward,
  forgeSchedule,
  grantToken,
  initialMinigames,
  isEligible,
  rolloverMinigames,
  spendToken,
  stacksDeck,
  stacksReward,
  tryUnlock,
  wishingWell,
  BEACON_ROWS,
  FORAGE_SIZE,
  STACKS_PAIRS,
} from '../src/core/minigames';
import { ORDERS } from '../src/data/economy';
import { Game } from '../src/core/game';

describe('minigame engines are deterministic', () => {
  it('wishing well: same seed → same drop', () => {
    const a = wishingWell(7, 8);
    const b = wishingWell(7, 8);
    expect(a).toEqual(b);
    expect(a.slot).toBeGreaterThanOrEqual(0);
    expect(a.slot).toBeLessThan(5);
    expect(a.items[0]!.chain).toBe('seeds'); // wishes take root
  });

  it('beacon drop: path is seeded, slot within range, centre is the heart', () => {
    const p1 = beaconPath(42);
    const p2 = beaconPath(42);
    expect(p1).toEqual(p2);
    expect(p1.length).toBe(BEACON_ROWS);
    const slot = beaconSlot(p1);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(slot).toBeLessThanOrEqual(BEACON_ROWS);
    // dead-centre lands the finest fish
    const centre = beaconReward(BEACON_ROWS / 2);
    expect(centre.items[0]).toEqual({ chain: 'fish', level: 2 });
    expect(beaconReward(0).items[0]!.level).toBe(0); // an edge still gives a little
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
  it('eligibility respects the story gate and the L2 gate', () => {
    expect(isEligible('story', false, 0)).toBe(false); // story not done
    expect(isEligible('story', true, 0)).toBe(true); // opens on story complete
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
  it('is locked until the story is complete', () => {
    const g = new Game(1000);
    expect(g.isStoryComplete()).toBe(false);
    const st = g.minigameStatus('prop_well');
    expect(st?.reason).toBe('locked-story');
    expect(g.startMinigame('wishing-well')).toBeNull();
  });

  it('story complete → doors open (one/day), a play spends energy + a token, rewards bank', () => {
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
