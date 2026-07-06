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

const POOL: readonly DailyQuestDef[] = [
  { id: 'dq-merge8', label: 'Make 8 merges', target: 8, coins: 30, progress: (s) => s.stats.dayMerges },
  { id: 'dq-merge15', label: 'Make 15 merges', target: 15, coins: 45, progress: (s) => s.stats.dayMerges },
  { id: 'dq-deliver1', label: 'Deliver an order', target: 1, coins: 30, progress: (s) => s.stats.dayDelivers },
  { id: 'dq-deliver2', label: 'Deliver 2 orders', target: 2, coins: 45, progress: (s) => s.stats.dayDelivers },
  { id: 'dq-actions1', label: 'Do a real-world action', target: 1, coins: 30, progress: (s) => s.stats.dayActions },
  { id: 'dq-actions2', label: 'Do 2 real-world actions', target: 2, coins: 45, progress: (s) => s.stats.dayActions },
] as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Three distinct quests for a given local day key, stable all day. */
export function questsForDay(day: string): DailyQuestDef[] {
  const seed = hash(day);
  const picked: DailyQuestDef[] = [];
  // Pick one merge quest, one deliver quest, one action quest — variety guaranteed.
  picked.push(POOL[seed % 2]!);
  picked.push(POOL[2 + ((seed >> 2) % 2)]!);
  picked.push(POOL[4 + ((seed >> 4) % 2)]!);
  return picked;
}
