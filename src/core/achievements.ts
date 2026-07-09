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
  icon: string; // emoji fallback
  art?: string; // sliced badge art id
  coins: number; // a small coin payoff on earning (never energy)
  earned: (s: GameState) => boolean;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first-merge', art: 'badge_event_1', title: 'First Spark', desc: 'Make your first merge.', icon: '✨', coins: 20,
    earned: (s) => s.stats.merges >= 1 },
  { id: 'first-order', art: 'badge_event_6', title: 'A Neighbour Helped', desc: 'Deliver your first order.', icon: '⭐', coins: 30,
    earned: (s) => s.orderIndex >= 1 },
  { id: 'ch1-complete', art: 'badge_event_2', title: 'The Letter, Answered', desc: 'Complete Chapter 1.', icon: '✉️', coins: 150,
    earned: (s) => s.orderIndex >= 12 },
  { id: 'ch2-complete', art: 'badge_event_4', title: 'Shadows, Lifted', desc: 'Complete Chapter 2.', icon: '🕯️', coins: 250,
    earned: (s) => s.orderIndex >= 24 },
  { id: 'streak-7', art: 'badge_habit_hero', title: 'Keeper of the Flame', desc: 'Tend the hearth 7 days running.', icon: '🔥', coins: 100,
    earned: (s) => s.actions.streak >= 7 },
  { id: 'first-duel-win', art: 'badge_event_7', title: 'Bonfire Champion', desc: 'Win a Bonfire Duel.', icon: '⚔️', coins: 60,
    earned: (s) => s.stats.duelWins >= 1 },
  { id: 'town-half', art: 'badge_master_builder', title: 'Half the Lights On', desc: 'Restore half of Emberhollow.', icon: '🏘️', coins: 120,
    earned: (s) => s.orderIndex >= 12 },
  { id: 'town-full', art: 'badge_hearth_guardian', title: 'Beacon of Emberhollow', desc: 'Restore the whole village.', icon: '🌟', coins: 300,
    earned: (s) => s.orderIndex >= 24 },
  { id: 'first-flashback', art: 'badge_event_5', title: 'A Good Day, Remembered', desc: 'Hold onto a resurfaced memory.', icon: '📖', coins: 40,
    earned: (s) => s.stats.flashbacks >= 1 },
  { id: 'merges-100', art: 'badge_merge_master', title: 'Hundred Hands', desc: 'Make 100 merges.', icon: '🔨', coins: 100,
    earned: (s) => s.stats.merges >= 100 },
] as const;

/** Ids newly earned given current state vs the already-granted list. */
export function newlyEarned(state: GameState): AchievementDef[] {
  const have = new Set(state.achievements);
  return ACHIEVEMENTS.filter((a) => !have.has(a.id) && a.earned(state));
}
