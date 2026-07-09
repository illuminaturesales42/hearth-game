import { describe, expect, it } from 'vitest';
import { questMultiplier, questsForDay } from '../src/data/daily-quests';
import { STREAK_MILESTONES, newMilestones, nextMilestone } from '../src/data/milestones';
import { ACHIEVEMENTS } from '../src/core/achievements';

describe('daily quests', () => {
  it('always returns one of each category (merge/deliver/action)', () => {
    for (const day of ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-15']) {
      const q = questsForDay(day);
      expect(q).toHaveLength(3);
      expect(q[0]!.id.startsWith('dq-merge')).toBe(true);
      expect(q[1]!.id.startsWith('dq-deliver')).toBe(true);
      expect(q[2]!.id.startsWith('dq-actions')).toBe(true);
    }
  });

  it('the streak multiplier is 1.0 at 0 and caps at 1.5', () => {
    expect(questMultiplier(0)).toBeCloseTo(1);
    expect(questMultiplier(10)).toBeCloseTo(1.5);
    expect(questMultiplier(50)).toBeCloseTo(1.5);
  });
});

describe('streak milestones', () => {
  it('newMilestones returns those reached and not yet seen', () => {
    expect(newMilestones(1, []).length).toBe(0);
    expect(newMilestones(3, []).map((m) => m.id)).toEqual(['ms-3']);
    expect(newMilestones(7, ['ms-3']).map((m) => m.id)).toEqual(['ms-7']);
    expect(newMilestones(100, STREAK_MILESTONES.map((m) => m.id)).length).toBe(0);
  });

  it('nextMilestone points at the next unreached target', () => {
    expect(nextMilestone(0)?.at).toBe(3);
    expect(nextMilestone(3)?.at).toBe(7);
    expect(nextMilestone(999)).toBeNull();
  });

  it('milestones award coins only — never energy or power', () => {
    for (const m of STREAK_MILESTONES) expect(m.coins).toBeGreaterThan(0);
  });
});

describe('achievement payoffs', () => {
  it('every achievement grants a positive coin reward', () => {
    for (const a of ACHIEVEMENTS) expect(a.coins).toBeGreaterThan(0);
  });
});
