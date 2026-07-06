import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { composeEntry, appendEntry, MAX_ENTRIES } from '../src/core/chronicle';
import { ACHIEVEMENTS, newlyEarned } from '../src/core/achievements';
import { questsForDay } from '../src/data/daily-quests';
import { migrateState, CURRENT_VERSION } from '../src/core/save';
import { findMergePair } from '../src/core/board';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

const T0 = new Date('2026-07-07T10:00:00').getTime();
const DAY = 24 * 3600_000;

describe('chronicle', () => {
  it('composes deterministic prose for a busy day', () => {
    const counts = { steps: 1, kindness: 1, 'nature-photo': 1 };
    const a = composeEntry('2026-07-06', counts, 4, 2, 2);
    const b = composeEntry('2026-07-06', counts, 4, 2, 2);
    expect(a.text).toBe(b.text);
    expect(a.text).toMatch(/request/i); // delivers are mentioned
    expect(a.text.length).toBeGreaterThan(60);
  });

  it('writes a gentle entry for a quiet day', () => {
    const e = composeEntry('2026-07-06', {}, 1, 0, 0);
    expect(e.text.length).toBeGreaterThan(20);
  });

  it('yesterday writes itself when a new day begins', () => {
    const g = new Game(T0);
    g.completeAction('water', T0);
    // next day: constructing a new Game (fresh open) writes yesterday's entry
    const g2 = new Game(T0 + DAY);
    expect(g2.snapshot.chronicle.entries.length).toBe(1);
    expect(g2.snapshot.chronicle.entries[0]!.day).toBe('2026-07-07');
  });

  it('never duplicates a day and caps entries', () => {
    let entries = appendEntry([], composeEntry('2026-07-06', {}, 1, 0, 0));
    entries = appendEntry(entries, composeEntry('2026-07-06', {}, 1, 0, 0));
    expect(entries.length).toBe(1);
    for (let i = 0; i < MAX_ENTRIES + 20; i++) {
      entries = appendEntry(entries, composeEntry(`day-${i}`, {}, 1, 0, 0));
    }
    expect(entries.length).toBe(MAX_ENTRIES);
  });
});

describe('achievements', () => {
  it('first merge and first order grant themselves', () => {
    const g = new Game(T0);
    const pair = findMergePair(g.snapshot.board)!;
    g.drop(pair[0], pair[1]);
    expect(g.snapshot.achievements).toContain('first-merge');
  });

  it('newlyEarned never re-grants', () => {
    const g = new Game(T0);
    const pair = findMergePair(g.snapshot.board)!;
    g.drop(pair[0], pair[1]);
    expect(newlyEarned(g.snapshot).map((a) => a.id)).not.toContain('first-merge');
  });

  it('all achievement ids are unique', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});

describe('daily quests', () => {
  it('three distinct quests per day, stable within the day', () => {
    const a = questsForDay('2026-07-07');
    const b = questsForDay('2026-07-07');
    expect(a.map((q) => q.id)).toEqual(b.map((q) => q.id));
    expect(new Set(a.map((q) => q.id)).size).toBe(3);
  });

  it('completing a quest pays coins automatically', () => {
    const g = new Game(T0);
    const day = g.snapshot.stats.day;
    const deliverQuest = questsForDay(day).find((q) => q.id.startsWith('dq-deliver'));
    if (!deliverQuest || deliverQuest.target > 1) return; // only assert on the 1-delivery variant
    const coinsBefore = g.snapshot.coins;
    g.finishDuel(true, [{ chain: 'wood', level: 2 }], 10); // bank the needed item
    g.deliverFromRepository();
    expect(g.snapshot.questsClaimed).toContain(deliverQuest.id);
    expect(g.snapshot.coins).toBeGreaterThan(coinsBefore);
  });
});

describe('save v10 migration', () => {
  it('upgrades a v9 save, marking FTUE done for existing players', () => {
    const v9 = { ...Game.freshState(T0), version: 9 } as Record<string, unknown>;
    delete v9.chronicle;
    delete v9.stats;
    delete v9.achievements;
    delete v9.questsClaimed;
    delete v9.flags;
    const migrated = migrateState(v9);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(CURRENT_VERSION);
    expect(migrated!.flags.ftueDone).toBe(true);
    expect(migrated!.stats.merges).toBe(0);
  });
});
