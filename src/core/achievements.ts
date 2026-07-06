/**
 * Achievements: quiet recognitions, never pressure (Hearth Test compliant —
 * all celebrate what happened, none demand what hasn't). Pure evaluation over
 * GameState; the Game grants and emits.
 */
import type { GameState } from './types';

export interface AchievementDef {
  id: string;
  title: string;
  desc: string;
  icon: string; // sliced icon id or emoji fallback
  earned: (s: GameState) => boolean;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first-merge', title: 'First Spark', desc: 'Make your first merge.', icon: '✨',
    earned: (s) => s.stats.merges >= 1 },
  { id: 'first-order', title: 'A Neighbour Helped', desc: 'Deliver your first order.', icon: '⭐',
    earned: (s) => s.orderIndex >= 1 },
  { id: 'ch1-complete', title: 'The Letter, Answered', desc: 'Complete Chapter 1.', icon: '✉️',
    earned: (s) => s.orderIndex >= 12 },
  { id: 'ch2-complete', title: 'Shadows, Lifted', desc: 'Complete Chapter 2.', icon: '🕯️',
    earned: (s) => s.orderIndex >= 24 },
  { id: 'streak-7', title: 'Keeper of the Flame', desc: 'Tend the hearth 7 days running.', icon: '🔥',
    earned: (s) => s.actions.streak >= 7 },
  { id: 'first-duel-win', title: 'Bonfire Champion', desc: 'Win a Bonfire Duel.', icon: '⚔️',
    earned: (s) => s.stats.duelWins >= 1 },
  { id: 'town-half', title: 'Half the Lights On', desc: 'Restore half of Emberhollow.', icon: '🏘️',
    earned: (s) => s.orderIndex >= 12 },
  { id: 'town-full', title: 'Beacon of Emberhollow', desc: 'Restore the whole village.', icon: '🌟',
    earned: (s) => s.orderIndex >= 24 },
  { id: 'first-flashback', title: 'A Good Day, Remembered', desc: 'Hold onto a resurfaced memory.', icon: '📖',
    earned: (s) => s.stats.flashbacks >= 1 },
  { id: 'merges-100', title: 'Hundred Hands', desc: 'Make 100 merges.', icon: '🔨',
    earned: (s) => s.stats.merges >= 100 },
] as const;

/** Ids newly earned given current state vs the already-granted list. */
export function newlyEarned(state: GameState): AchievementDef[] {
  const have = new Set(state.achievements);
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.earned(state));
}
