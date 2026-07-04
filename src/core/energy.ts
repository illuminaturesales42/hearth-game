/**
 * Life Energy: the design core. Energy comes from time regen and from the
 * player's real day. It is never sold. Pure, timestamp-driven functions so
 * the system is fully testable and cheat-resistant enough for M1.
 */
import type { EnergyState } from './types';
import { ENERGY, LIFE_QUESTS } from '../data/economy';

export function localDayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function initialEnergy(now: number): EnergyState {
  return { current: ENERGY.initial, lastRegenAt: now, questsDoneToday: [], questDay: localDayKey(now) };
}

/** Accrue passive time regen up to the cap. Life-quest energy may sit above the cap; regen never pushes past it. */
export function accrueRegen(state: EnergyState, now: number): EnergyState {
  const elapsed = now - state.lastRegenAt;
  if (elapsed < ENERGY.regenMs) return rolloverDay(state, now);
  const ticks = Math.floor(elapsed / ENERGY.regenMs);
  const usable = state.current >= ENERGY.regenCap ? 0 : Math.min(ticks, ENERGY.regenCap - state.current);
  return rolloverDay(
    {
      ...state,
      current: state.current + usable,
      lastRegenAt: state.lastRegenAt + ticks * ENERGY.regenMs,
    },
    now,
  );
}

function rolloverDay(state: EnergyState, now: number): EnergyState {
  const day = localDayKey(now);
  if (day === state.questDay) return state;
  return { ...state, questsDoneToday: [], questDay: day };
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

export interface QuestResult {
  state: EnergyState;
  granted: number;
}

/** Complete a life quest (once per day each). Returns granted=0 if already done. */
export function completeQuest(state: EnergyState, questId: string, now: number): QuestResult {
  const rolled = rolloverDay(state, now);
  if (rolled.questsDoneToday.includes(questId)) return { state: rolled, granted: 0 };
  const quest = LIFE_QUESTS.find((q) => q.id === questId);
  if (!quest) return { state: rolled, granted: 0 };
  return {
    state: {
      ...rolled,
      current: rolled.current + quest.energy,
      questsDoneToday: [...rolled.questsDoneToday, questId],
    },
    granted: quest.energy,
  };
}

/** ms until the next passive energy tick (for the HUD countdown). */
export function msToNextTick(state: EnergyState, now: number): number {
  const elapsed = now - state.lastRegenAt;
  return Math.max(0, ENERGY.regenMs - (elapsed % ENERGY.regenMs));
}
