import { describe, expect, it } from 'vitest';
import { pendingNudges, screenOfNudge, nudgesForScreen, PENDING_CAP } from '../src/core/discovery';
import { Game } from '../src/core/game';
import { migrateState, CURRENT_VERSION } from '../src/core/save';
import { ORDERS } from '../src/data/economy';

describe('discovery engine (pure)', () => {
  it('a fresh, fully-restored profile glows untried features, capped and prioritised', () => {
    const g = new Game(1000);
    g.devPreviewStory(ORDERS.length); // everything returned; nothing played yet
    const nudges = g.pendingNudges();
    expect(nudges.length).toBeLessThanOrEqual(PENDING_CAP);
    // games returned but unplayed are top priority
    expect(nudges.some((n) => n.startsWith('game:'))).toBe(true);
  });

  it('discovering a feature retires its glow for good, and it never returns', () => {
    const g = new Game(1000);
    g.devPreviewStory(ORDERS.length);
    const first = g.pendingNudges()[0]!;
    expect(g.isDiscovered(first)).toBe(false);
    g.discover(first);
    expect(g.isDiscovered(first)).toBe(true);
    expect(g.pendingNudges()).not.toContain(first);
    g.discover(first); // idempotent
    expect((g.snapshot.discovered ?? []).filter((d) => d === first).length).toBe(1);
  });

  it('never exceeds the cap even when many features are untried', () => {
    const g = new Game(1000);
    g.devPreviewStory(ORDERS.length);
    expect(g.pendingNudges().length).toBeLessThanOrEqual(PENDING_CAP);
  });

  it('a game glow clears once that game has a personal best', () => {
    const g = new Game(1000);
    g.devPreviewStory(ORDERS.length);
    // beacon has returned (order 9); it should glow until played
    const beacon = 'game:beacon-drop';
    // record a best by finishing the game
    g.finishMinigame(
      'beacon-drop',
      { coins: 6, items: [{ chain: 'fish', level: 0 }], ember: 1, heart: '' },
      undefined,
      50,
    );
    expect(g.pendingNudges()).not.toContain(beacon);
  });

  it('maps each nudge to its bottom-nav screen (or none for actions)', () => {
    expect(screenOfNudge('villager:wren')).toBe('villagers');
    expect(screenOfNudge('week-digest:2026-07-18')).toBe('journal');
    expect(screenOfNudge('game:sawmill')).toBe('home');
    expect(screenOfNudge('almanac')).toBe('home');
    expect(screenOfNudge('action:breathe')).toBeNull(); // glows the energy pill, not a nav item
  });

  it('nudgesForScreen filters to one screen', () => {
    const g = new Game(1000);
    g.devPreviewStory(6); // only the well is back
    const home = nudgesForScreen(g.snapshot, 'home');
    expect(home.every((n) => screenOfNudge(n) === 'home')).toBe(true);
  });

  it('an empty early profile is quiet-ish (no games returned yet)', () => {
    const g = new Game(1000); // order 0
    const nudges = g.pendingNudges();
    // no games have returned, so no game glows; still capped
    expect(nudges.some((n) => n.startsWith('game:'))).toBe(false);
    expect(nudges.length).toBeLessThanOrEqual(PENDING_CAP);
  });
});

describe('discovery save migration (16 → 17)', () => {
  it('adds an empty discovered set to a v16 save without breaking it', () => {
    const g = new Game(1000);
    const raw = JSON.parse(JSON.stringify(g.snapshot));
    // simulate an older save at v16 with no discovered field
    raw.version = 16;
    delete raw.discovered;
    const migrated = migrateState(raw);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(CURRENT_VERSION);
    expect(migrated!.discovered).toEqual([]);
  });
});
