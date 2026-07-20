import { describe, expect, it } from 'vitest';
import { ALMANAC_PAGES, ALMANAC_SECTIONS, almanacProgress, pageFor, stampId, stampItems } from '../src/core/almanac';
import {
  beaconReward,
  catchReward,
  forgeReward,
  sawmillReward,
  stacksReward,
  wishingWellReward,
} from '../src/core/minigames';
import { Game } from '../src/core/game';
import { ORDERS } from '../src/data/economy';

describe('The Keeper’s Almanac (pure)', () => {
  it('every page has a unique id matching its chain+level, and a section', () => {
    const ids = ALMANAC_PAGES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of ALMANAC_PAGES) {
      expect(p.id).toBe(`${p.chain}_${p.level}`);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.note.length).toBeGreaterThan(0);
      expect(ALMANAC_SECTIONS).toContain(p.section);
    }
  });

  it('stamps a find, reports it as newly discovered only the first time', () => {
    const first = stampItems({}, [{ chain: 'fish', level: 2 }]);
    expect(first.discovered.map((p) => p.id)).toEqual(['fish_2']);
    expect(first.state['fish_2']).toBe(1);
    // the same find again: counted, but no longer a discovery
    const second = stampItems(first.state, [{ chain: 'fish', level: 2 }]);
    expect(second.discovered).toEqual([]);
    expect(second.state['fish_2']).toBe(2);
  });

  it('is pure: the given state is never mutated, unknown items change nothing', () => {
    const before = { fish_2: 1 };
    const snapshot = { ...before };
    const res = stampItems(before, [{ chain: 'fish', level: 2 }]);
    expect(before).toEqual(snapshot); // untouched
    expect(res.state).not.toBe(before);
    // an item with no page (a chain the Almanac doesn't collect) is a no-op
    const none = stampItems(before, [{ chain: 'hearthfire', level: 1 }]);
    expect(none.state).toBe(before); // same reference — nothing changed
    expect(none.discovered).toEqual([]);
  });

  it('counts a duplicate inside one run once as a discovery, twice as finds', () => {
    const r = stampItems({}, [
      { chain: 'wood', level: 2 },
      { chain: 'wood', level: 2 },
    ]);
    expect(r.discovered.map((p) => p.id)).toEqual(['wood_2']);
    expect(r.state['wood_2']).toBe(2);
  });

  it('progress counts distinct pages found, never the number of finds', () => {
    expect(almanacProgress({})).toEqual({ found: 0, total: ALMANAC_PAGES.length });
    const many = stampItems({}, [
      { chain: 'fish', level: 0 },
      { chain: 'fish', level: 0 },
      { chain: 'fish', level: 1 },
    ]);
    expect(almanacProgress(many.state).found).toBe(2);
  });

  it('helpers: stampId + pageFor', () => {
    expect(stampId({ chain: 'copper', level: 3 })).toBe('copper_3');
    expect(pageFor({ chain: 'copper', level: 3 })?.name).toBe('Masterwork Copper');
    expect(pageFor({ chain: 'hearthfire', level: 9 })).toBeUndefined();
  });

  it('every item a mini-game can actually award has a page (no orphan drops)', () => {
    const drops = [
      ...wishingWellReward([2, 2, 2], 7, 8).items,
      ...wishingWellReward([0, 0, 0], 7, 8).items,
      ...wishingWellReward([1, 1, 1], 3, 8).items,
      ...beaconReward(4, true).items,
      ...beaconReward(0, false).items,
      ...forgeReward(18, 20, 9, 8).items,
      ...forgeReward(0, 20).items,
      ...catchReward(1, 1).items,
      ...catchReward(0, 0).items,
      ...sawmillReward(20, 8, 22, 10).items,
      ...sawmillReward(0, 0, 22).items,
      ...stacksReward(8, 5).items,
      ...stacksReward(99, 0).items,
    ];
    for (const d of drops) {
      expect(pageFor(d), `no Almanac page for ${stampId(d)}`).toBeDefined();
    }
  });
});

describe('Game ↔ Almanac', () => {
  it('a finished game stamps its finds and reports the new pages', () => {
    const g = new Game(1000);
    g.devPreviewStory(ORDERS.length);
    expect(almanacProgress(g.almanac).found).toBe(0);
    const res = g.finishMinigame('joss-catch', {
      coins: 8,
      items: [{ chain: 'fish', level: 3 }],
      ember: 1,
      heart: '',
    });
    expect(res.discovered.map((p) => p.name)).toEqual(['Deepwater Rarity']);
    expect(g.almanac['fish_3']).toBe(1);
    expect(almanacProgress(g.almanac).found).toBe(1);
    // playing it again finds it, but discovers nothing new
    const again = g.finishMinigame('joss-catch', {
      coins: 8,
      items: [{ chain: 'fish', level: 3 }],
      ember: 1,
      heart: '',
    });
    expect(again.discovered).toEqual([]);
    expect(g.almanac['fish_3']).toBe(2);
  });
});
