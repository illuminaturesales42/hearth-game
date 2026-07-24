import { describe, expect, it } from 'vitest';
import {
  BAKE_DURATION_MS,
  BAKE_LOAVES,
  type BakeGrade,
  bakeGrade,
  bakeReward,
  bakeSchedule,
  bakeScore,
} from '../src/core/minigames';

describe('The Proving — schedule', () => {
  it('is deterministic for a seed', () => {
    expect(bakeSchedule(1234)).toEqual(bakeSchedule(1234));
  });

  it('differs between seeds', () => {
    expect(bakeSchedule(1)).not.toEqual(bakeSchedule(2));
  });

  it('produces one loaf per tray slot, in time order, inside the round', () => {
    for (const seed of [1, 7, 99, 4242]) {
      const s = bakeSchedule(seed);
      expect(s.length).toBe(BAKE_LOAVES);
      for (let i = 1; i < s.length; i++) expect(s[i]!.peakMs).toBeGreaterThan(s[i - 1]!.peakMs);
      for (const l of s) {
        expect(l.peakMs).toBeGreaterThan(0);
        expect(l.peakMs + l.windowMs).toBeLessThan(BAKE_DURATION_MS);
        expect(l.windowMs).toBeGreaterThan(300);
      }
    }
  });

  it('never overlaps golden windows — every loaf is catchable', () => {
    for (const seed of [3, 21, 500, 90210]) {
      const s = bakeSchedule(seed);
      for (let i = 1; i < s.length; i++) {
        const prevEnd = s[i - 1]!.peakMs + s[i - 1]!.windowMs;
        const thisStart = s[i]!.peakMs - s[i]!.windowMs;
        expect(thisStart).toBeGreaterThan(prevEnd);
      }
    }
  });
});

describe('The Proving — grading', () => {
  const loaf = { peakMs: 10_000, windowMs: 1000 };

  it('grades by when the loaf was pulled', () => {
    expect(bakeGrade(loaf, 10_000)).toBe('golden'); // dead centre
    expect(bakeGrade(loaf, 9_200)).toBe('golden'); // inside the window
    expect(bakeGrade(loaf, 10_800)).toBe('golden');
    expect(bakeGrade(loaf, 5_000)).toBe('pale'); // too early
    expect(bakeGrade(loaf, 15_000)).toBe('dark'); // too late
  });

  it('treats a forgotten loaf as dark, never as a failure', () => {
    expect(bakeGrade(loaf, null)).toBe('dark');
  });

  it('is inclusive at the window edges', () => {
    expect(bakeGrade(loaf, 9_000)).toBe('golden');
    expect(bakeGrade(loaf, 11_000)).toBe('golden');
  });
});

describe('The Proving — reward (no-fail)', () => {
  const grades = (n: number, g: BakeGrade): BakeGrade[] => Array.from({ length: n }, () => g);

  it('rewards even a completely forgotten tray', () => {
    const r = bakeReward(grades(3, 'dark'));
    expect(r.coins).toBeGreaterThan(0);
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.ember).toBeGreaterThan(0);
    expect(r.heart).toBeTruthy();
  });

  it('pays more the more golden loaves there are', () => {
    const bad = bakeReward(grades(3, 'dark')).coins;
    const ok = bakeReward(['golden', 'dark', 'dark']).coins;
    const great = bakeReward(grades(3, 'golden')).coins;
    expect(ok).toBeGreaterThan(bad);
    expect(great).toBeGreaterThan(ok);
  });

  it('a perfect tray earns the top-tier harvest item', () => {
    const r = bakeReward(grades(3, 'golden'));
    expect(r.items.some((i) => i.chain === 'harvest' && i.level === 3)).toBe(true);
    expect(r.heart).toContain('Bran');
  });

  it('pale is better than dark but worse than golden', () => {
    expect(bakeReward(grades(3, 'pale')).coins).toBeGreaterThan(bakeReward(grades(3, 'dark')).coins);
    expect(bakeReward(grades(3, 'pale')).coins).toBeLessThan(bakeReward(grades(3, 'golden')).coins);
  });

  it('only ever yields the bakery-appropriate chain', () => {
    for (const g of ['pale', 'golden', 'dark'] as const) {
      expect(bakeReward(grades(3, g)).items.every((i) => i.chain === 'harvest')).toBe(true);
    }
  });

  it('caps sensibly — best play stays in the same band as other games', () => {
    expect(bakeReward(grades(3, 'golden')).coins).toBeLessThanOrEqual(30);
  });
});

describe('The Proving — score', () => {
  it('ranks goldens above pale above dark', () => {
    expect(bakeScore(['golden', 'golden', 'golden'])).toBeGreaterThan(bakeScore(['golden', 'golden', 'pale']));
    expect(bakeScore(['pale', 'pale', 'pale'])).toBeGreaterThan(bakeScore(['dark', 'dark', 'dark']));
  });

  it('never returns zero — something always came out of the oven', () => {
    expect(bakeScore(['dark', 'dark', 'dark'])).toBeGreaterThan(0);
  });
});
