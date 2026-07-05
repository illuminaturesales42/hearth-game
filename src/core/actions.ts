/**
 * Action ledger: which real-world actions the player has done today, their
 * positive-only streak, and chest progress. Pure and testable. Energy grants
 * flow out through the game orchestrator into EnergyState.
 */
import type { ActionState } from './types';
import { ACTIONS } from '../data/actions';
import { LOG_MEDITATION, MEDITATIONS } from '../data/meditations';
import { RECOVERY } from '../data/recovery';
import { GRATITUDE } from '../data/gratitude';
import { STARGAZE } from '../data/moon';
import { localDayKey } from './energy';

export const CHEST_EVERY = 3;
export const CHEST_COINS = 100;

export function findAction(id: string) {
  return ACTIONS.find((a) => a.id === id);
}

export interface Earnable {
  energy: number;
  timesPerDay: number;
}

/** Resolve an earnable's reward + cap from any catalogue (actions, meditations, logging). */
export function earnableById(id: string): Earnable | undefined {
  const a = ACTIONS.find((x) => x.id === id);
  if (a) return { energy: a.energy, timesPerDay: a.timesPerDay };
  const m = MEDITATIONS.find((x) => x.id === id);
  if (m) return { energy: m.energy, timesPerDay: m.timesPerDay };
  if (id === LOG_MEDITATION.id) return { energy: 0, timesPerDay: 1 }; // energy is passed in per log
  if (id === GRATITUDE.id) return { energy: 0, timesPerDay: 1 }; // energy is streak-scaled, passed in
  if (id === STARGAZE.id) return { energy: 0, timesPerDay: 1 }; // energy is moon-scaled, passed in
  const r = RECOVERY.find((x) => x.id === id);
  if (r) return { energy: 0, timesPerDay: r.timesPerDay }; // energy is passed in per log
  return undefined;
}

export function initialActionState(now: number): ActionState {
  return { day: localDayKey(now), counts: {}, streak: 0, lastActiveDay: null, chestProgress: 0 };
}

export function rolloverActions(state: ActionState, now: number): ActionState {
  const day = localDayKey(now);
  if (day === state.day) return state;
  return { ...state, day, counts: {} };
}

export function doneCount(state: ActionState, id: string): number {
  return state.counts[id] ?? 0;
}

export function canDoAction(state: ActionState, id: string, now: number): boolean {
  const e = earnableById(id);
  if (!e) return false;
  return doneCount(rolloverActions(state, now), id) < e.timesPerDay;
}

function dayGap(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / 86_400_000);
}

/** Streak multiplier applied to journal entries: 1.0 → 1.7x, capping at a 7-day streak. */
export function streakMultiplier(streak: number): number {
  return 1 + Math.min(Math.max(streak, 0), 7) * 0.1;
}

/** Energy granted the first time the player acts each day, scaled by streak. */
export function dailyBonus(streak: number): number {
  return 2 + Math.min(Math.max(streak, 1), 10);
}

export interface RecordResult {
  state: ActionState;
  energy: number;
  chestCoins: number;
  /** Streak-scaled bonus, paid once on the first action of a new day. */
  dailyBonus: number;
}

/**
 * Record one completion of an action. Enforces the per-day cap, updates the
 * streak (only grows; a missed day resets to 1 with no penalty screen) and
 * advances chest progress on the first action of each new active day.
 * `energyOverride` supplies the reward for variable earnables (logged
 * meditation minutes); otherwise the catalogue value is used.
 */
export function recordAction(state: ActionState, id: string, now: number, energyOverride?: number): RecordResult {
  const e = earnableById(id);
  const s = rolloverActions(state, now);
  if (!e || doneCount(s, id) >= e.timesPerDay) return { state: s, energy: 0, chestCoins: 0, dailyBonus: 0 };

  const energy = energyOverride ?? e.energy;
  const today = localDayKey(now);
  let { streak, chestProgress } = s;
  let lastActiveDay = s.lastActiveDay;
  let chestCoins = 0;
  let dailyBonusEnergy = 0;

  if (lastActiveDay !== today) {
    streak = lastActiveDay === null ? 1 : dayGap(lastActiveDay, today) === 1 ? streak + 1 : 1;
    lastActiveDay = today;
    chestProgress += 1;
    dailyBonusEnergy = dailyBonus(streak);
    if (chestProgress >= CHEST_EVERY) {
      chestProgress = 0;
      chestCoins = CHEST_COINS;
    }
  }

  const counts = { ...s.counts, [id]: doneCount(s, id) + 1 };
  return { state: { day: s.day, counts, streak, lastActiveDay, chestProgress }, energy, chestCoins, dailyBonus: dailyBonusEnergy };
}

export function chestDaysLeft(state: ActionState): number {
  return CHEST_EVERY - state.chestProgress;
}
