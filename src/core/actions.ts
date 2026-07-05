/**
 * Action ledger: which real-world actions the player has done today, their
 * positive-only streak, and chest progress. Pure and testable. Energy grants
 * flow out through the game orchestrator into EnergyState.
 */
import type { ActionState } from './types';
import { ACTIONS } from '../data/actions';
import { localDayKey } from './energy';

export const CHEST_EVERY = 3;
export const CHEST_COINS = 100;

export function findAction(id: string) {
  return ACTIONS.find((a) => a.id === id);
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
  const a = findAction(id);
  if (!a) return false;
  return doneCount(rolloverActions(state, now), id) < a.timesPerDay;
}

function dayGap(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / 86_400_000);
}

export interface RecordResult {
  state: ActionState;
  energy: number;
  chestCoins: number;
}

/**
 * Record one completion of an action. Enforces the per-day cap, updates the
 * streak (only grows; a missed day resets to 1 with no penalty screen) and
 * advances chest progress on the first action of each new active day.
 */
export function recordAction(state: ActionState, id: string, now: number): RecordResult {
  const a = findAction(id);
  const s = rolloverActions(state, now);
  if (!a || doneCount(s, id) >= a.timesPerDay) return { state: s, energy: 0, chestCoins: 0 };

  const today = localDayKey(now);
  let { streak, chestProgress } = s;
  let lastActiveDay = s.lastActiveDay;
  let chestCoins = 0;

  if (lastActiveDay !== today) {
    streak = lastActiveDay === null ? 1 : dayGap(lastActiveDay, today) === 1 ? streak + 1 : 1;
    lastActiveDay = today;
    chestProgress += 1;
    if (chestProgress >= CHEST_EVERY) {
      chestProgress = 0;
      chestCoins = CHEST_COINS;
    }
  }

  const counts = { ...s.counts, [id]: doneCount(s, id) + 1 };
  return { state: { day: s.day, counts, streak, lastActiveDay, chestProgress }, energy: a.energy, chestCoins };
}

export function chestDaysLeft(state: ActionState): number {
  return CHEST_EVERY - state.chestProgress;
}
