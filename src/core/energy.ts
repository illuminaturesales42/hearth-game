/**
 * Passive energy regen and the spend/grant primitives. Life-driven energy
 * (steps, sleep, photos, movement) is handled by the action + health systems;
 * this file is only the baseline timer and the arithmetic.
 */
import type { EnergyState } from './types';
import { ENERGY } from '../data/economy';

/** Hours past midnight at which the Hearth "day" turns over. A late-night player
 *  (up until 3am) keeps the same day; everything daily — energy actions, minigame
 *  goes, stats, gratitude, chronicle — resets together at 4am local. */
export const DAY_RESET_HOUR = 4;

export function localDayKey(now: number): string {
  // Shift back by the reset hour so the calendar date only flips at 4am local.
  const d = new Date(now - DAY_RESET_HOUR * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function initialEnergy(now: number): EnergyState {
  return { current: ENERGY.initial, lastRegenAt: now };
}

/** Accrue passive regen up to the cap. Life energy may sit above the cap; regen never pushes past it. */
export function accrueRegen(state: EnergyState, now: number): EnergyState {
  // Clock rewound (manual set-back, DST, timezone travel): re-anchor to now so
  // regen doesn't freeze until the wall clock catches up, and the HUD countdown
  // can't read above a full tick.
  if (now < state.lastRegenAt) return { ...state, lastRegenAt: now };
  const elapsed = now - state.lastRegenAt;
  if (elapsed < ENERGY.regenMs) return state;
  const ticks = Math.floor(elapsed / ENERGY.regenMs);
  const usable = state.current >= ENERGY.regenCap ? 0 : Math.min(ticks, ENERGY.regenCap - state.current);
  return { current: state.current + usable, lastRegenAt: state.lastRegenAt + ticks * ENERGY.regenMs };
}

export function canSpend(state: EnergyState, amount: number): boolean {
  return state.current >= amount;
}

export function spend(state: EnergyState, amount: number): EnergyState {
  if (!canSpend(state, amount)) throw new Error('Insufficient energy');
  return { ...state, current: state.current - amount };
}

export function grant(state: EnergyState, amount: number): EnergyState {
  return { ...state, current: state.current + amount };
}

/** ms until the next passive energy tick (for the HUD countdown). */
export function msToNextTick(state: EnergyState, now: number): number {
  const elapsed = Math.max(0, now - state.lastRegenAt); // guard a rewound clock
  return Math.max(0, ENERGY.regenMs - (elapsed % ENERGY.regenMs));
}
