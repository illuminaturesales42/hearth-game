/**
 * Daily quests: three gentle nudges a day, rotating deterministically by date.
 * They pay coins (never energy) and auto-complete — no claiming chores.
 */
import type { GameState } from '../core/types';

export interface DailyQuestDef {
  id: string;
  label: string;
  target: number;
  coins: number;
  progress: (s: GameState) => number;
}

// Grouped by category so each day picks one of each — variety guaranteed, and
// a deeper pool per group means far less week-to-week repetition.
const MERGE: readonly DailyQuestDef[] = [
  { id: 'dq-merge8', label: 'Make 8 merges', target: 8, coins: 30, progress: (s) => s.stats.dayMerges },
  { id: 'dq-merge15', label: 'Make 15 merges', target: 15, coins: 45, progress: (s) => s.stats.dayMerges },
  { id: 'dq-merge25', label: 'Make 25 merges', target: 25, coins: 60, progress: (s) => s.stats.dayMerges },
];
const DELIVER: readonly DailyQuestDef[] = [
  { id: 'dq-deliver1', label: 'Deliver an order', target: 1, coins: 30, progress: (s) => s.stats.dayDelivers },
  { id: 'dq-deliver2', label: 'Deliver 2 orders', target: 2, coins: 45, progress: (s) => s.stats.dayDelivers },
  { id: 'dq-deliver3', label: 'Deliver 3 orders', target: 3, coins: 65, progress: (s) => s.stats.dayDelivers },
];
const ACTION: readonly DailyQuestDef[] = [
  { id: 'dq-actions1', label: 'Do a real-world action', target: 1, coins: 30, progress: (s) => s.stats.dayActions },
  { id: 'dq-actions2', label: 'Do 2 real-world actions', target: 2, coins: 45, progress: (s) => s.stats.dayActions },
  { id: 'dq-actions3', label: 'Do 3 real-world actions', target: 3, coins: 70, progress: (s) => s.stats.dayActions },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Three distinct quests for a given local day key, stable all day. */
export function questsForDay(day: string): DailyQuestDef[] {
  const seed = hash(day);
  return [MERGE[seed % MERGE.length]!, DELIVER[(seed >> 2) % DELIVER.length]!, ACTION[(seed >> 4) % ACTION.length]!];
}

/**
 * Streak reward multiplier for daily-quest coins: a small, capped bonus so
 * regulars feel rewarded without runaway inflation. 1.0 at streak 0 → 1.5 at
 * streak 10+.
 */
export function questMultiplier(streak: number): number {
  return 1 + Math.min(Math.max(streak, 0), 10) * 0.05;
}
