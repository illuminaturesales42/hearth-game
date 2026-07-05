import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { MATCHES, MATCH_DAILY_CAP } from '../src/data/matches';

const T0 = new Date('2026-07-05T10:00:00').getTime();

describe('matches', () => {
  it('joining a match grants its energy and counts toward the daily total', () => {
    const g = new Game(T0);
    const before = g.snapshot.energy.current;
    const m = MATCHES[0]!;
    g.joinMatch(m.id, T0);
    expect(g.snapshot.energy.current).toBe(before + m.energy);
    expect(g.snapshot.settings.matchesJoinedToday).toBe(1);
  });

  it('stops granting once the daily cap is reached, then resets next day', () => {
    const g = new Game(T0);
    for (let i = 0; i < MATCH_DAILY_CAP + 3; i++) g.joinMatch('bonfire', T0);
    expect(g.snapshot.settings.matchesJoinedToday).toBe(MATCH_DAILY_CAP);
    expect(g.canJoinMatch(T0)).toBe(false);
    expect(g.canJoinMatch(T0 + 24 * 3600_000)).toBe(true);
  });

  it('auto-join is a persisted setting', () => {
    const g = new Game(T0);
    expect(g.settings.autoJoinMatches).toBe(false);
    g.setAutoJoinMatches(true);
    expect(g.settings.autoJoinMatches).toBe(true);
  });
});
