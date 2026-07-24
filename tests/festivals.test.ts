import { describe, expect, it } from 'vitest';
import {
  FULL_MOON_THRESHOLD,
  activeFestival,
  daysUntil,
  isActive,
  upcomingFestivals,
  whenLabel,
} from '../src/core/festivals';
import { FESTIVALS } from '../src/data/festivals';
import { illumination } from '../src/data/moon';

const def = (id: string) => FESTIVALS.find((f) => f.id === id)!;
/** Local-midday timestamp, so the tests never straddle a timezone boundary. */
const at = (y: number, m: number, d: number) => new Date(y, m, d, 12, 0, 0, 0).getTime();

describe('festival calendar — solar marks', () => {
  it('Midwinter Hearth is celebrated at the December solstice in the north', () => {
    expect(isActive(def('midwinter-hearth'), at(2026, 11, 21), false)).toBe(true);
    expect(isActive(def('midwinter-hearth'), at(2026, 5, 21), false)).toBe(false);
  });

  it('…and at the JUNE solstice in the south (hemisphere flip)', () => {
    expect(isActive(def('midwinter-hearth'), at(2026, 5, 21), true)).toBe(true);
    expect(isActive(def('midwinter-hearth'), at(2026, 11, 21), true)).toBe(false);
  });

  it('Blossomtide and Harvest Home swap over the equator', () => {
    const marchDay = at(2026, 2, 20);
    expect(isActive(def('blossomtide'), marchDay, false)).toBe(true); // spring up north
    expect(isActive(def('harvest-home'), marchDay, true)).toBe(true); // autumn down south
  });

  it('honours the celebration window either side of the mark', () => {
    const d = def('blossomtide'); // windowDays: 2
    expect(isActive(d, at(2026, 2, 18), false)).toBe(true); // -2
    expect(isActive(d, at(2026, 2, 22), false)).toBe(true); // +2
    expect(isActive(d, at(2026, 2, 15), false)).toBe(false); // -5
  });

  it('daysUntil counts forward and rolls into next year once past', () => {
    expect(daysUntil(def('blossomtide'), at(2026, 2, 20), false)).toBe(0);
    expect(daysUntil(def('blossomtide'), at(2026, 2, 10), false)).toBe(10);
    // Well past March: the next one is next year, so it must be a large number.
    expect(daysUntil(def('blossomtide'), at(2026, 6, 1), false)).toBeGreaterThan(200);
  });
});

describe('festival calendar — lunar mark', () => {
  it('Full Moon Tide tracks real illumination, not the calendar', () => {
    // Walk a synodic month and find a genuinely full night.
    let full: number | null = null;
    for (let i = 0; i < 30; i++) {
      const t = at(2026, 0, 1) + i * 86_400_000;
      if (illumination(t) >= FULL_MOON_THRESHOLD) full = t;
    }
    expect(full).not.toBeNull();
    expect(isActive(def('full-moon-tide'), full!, false)).toBe(true);
  });

  it('is not active at a new moon', () => {
    let newMoon: number | null = null;
    for (let i = 0; i < 30; i++) {
      const t = at(2026, 0, 1) + i * 86_400_000;
      if (illumination(t) < 0.02) newMoon = t;
    }
    expect(newMoon).not.toBeNull();
    expect(isActive(def('full-moon-tide'), newMoon!, false)).toBe(false);
  });

  it('is hemisphere-independent — the same night for everyone', () => {
    const t = at(2026, 0, 3);
    expect(isActive(def('full-moon-tide'), t, false)).toBe(isActive(def('full-moon-tide'), t, true));
  });
});

describe('activeFestival + upcoming', () => {
  it('returns null on an ordinary day', () => {
    // Early February: no solstice/equinox, and pick a day the moon is not full.
    let plain: number | null = null;
    for (let i = 0; i < 20; i++) {
      const t = at(2026, 1, 1) + i * 86_400_000;
      if (illumination(t) < 0.5) plain = t;
    }
    expect(activeFestival(plain!, false)).toBeNull();
  });

  it('a solar festival outranks a coinciding full moon', () => {
    const solstice = at(2026, 11, 21);
    const f = activeFestival(solstice, false);
    expect(f?.id).toBe('midwinter-hearth');
  });

  it('upcoming is sorted, excludes the active one, and respects the limit', () => {
    const now = at(2026, 2, 20); // Blossomtide is active
    const up = upcomingFestivals(now, false, 3);
    expect(up.length).toBe(3);
    expect(up.some((u) => u.def.id === 'blossomtide')).toBe(false);
    expect(up[0]!.days).toBeLessThanOrEqual(up[1]!.days);
    expect(up.every((u) => u.days >= 0)).toBe(true);
  });

  it('every festival resolves a next occurrence from any day of the year', () => {
    for (let m = 0; m < 12; m++) {
      for (const f of FESTIVALS) {
        const d = daysUntil(f, at(2026, m, 15), false);
        expect(Number.isFinite(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(-f.windowDays);
      }
    }
  });
});

describe('whenLabel — honest phrasing, never a countdown clock', () => {
  it('reads warmly and vaguely at distance', () => {
    expect(whenLabel(0)).toBe('today');
    expect(whenLabel(1)).toBe('tomorrow');
    expect(whenLabel(4)).toBe('in 4 days');
    expect(whenLabel(20)).toContain('weeks');
    expect(whenLabel(90)).toContain('months');
  });

  it('never emits a ticking countdown (no "2d 14h", no hours/minutes/seconds)', () => {
    for (const d of [0, 1, 5, 30, 200]) {
      const label = whenLabel(d);
      expect(label).not.toMatch(/\d+\s*[dhms]\b/i); // "2d", "14h", "30m"
      expect(label).not.toMatch(/\b(hour|minute|second)s?\b/i);
    }
  });
});
