/**
 * Streak milestones: gentle ceremonies for showing up. Each is granted once
 * (tracked in GameState.milestonesSeen) with a coin reward — never energy,
 * never pressure. The daily energy bonus stays capped; these celebrate the
 * habit without power-creep.
 */
export interface StreakMilestone {
  id: string;
  at: number; // consecutive active days
  coins: number;
  title: string;
  note: string;
}

export const STREAK_MILESTONES: readonly StreakMilestone[] = [
  { id: 'ms-3', at: 3, coins: 40, title: 'Three Days Kindled', note: 'The hearth remembers a steady hand.' },
  {
    id: 'ms-7',
    at: 7,
    coins: 90,
    title: 'A Week by the Fire',
    note: 'Emberhollow keeps a light in the window for you.',
  },
  {
    id: 'ms-14',
    at: 14,
    coins: 180,
    title: 'A Fortnight’s Warmth',
    note: 'The village has grown used to your footsteps.',
  },
  { id: 'ms-30', at: 30, coins: 400, title: 'A Month of Mornings', note: 'The harbour feels like home now.' },
  {
    id: 'ms-100',
    at: 100,
    coins: 1500,
    title: 'A Hundred Days’ Light',
    note: 'A keeper of the flame, in the oldest sense.',
  },
] as const;

/** Milestones now reached but not yet celebrated. */
export function newMilestones(streak: number, seen: readonly string[]): StreakMilestone[] {
  const have = new Set(seen);
  return STREAK_MILESTONES.filter((m) => m.at <= streak && !have.has(m.id));
}

/** The next milestone still ahead of the current streak, or null if maxed. */
export function nextMilestone(streak: number): StreakMilestone | null {
  return STREAK_MILESTONES.find((m) => m.at > streak) ?? null;
}
