/**
 * How Emberhollow remembers you (Codex Book III — The Living Village).
 *
 * Bonds grow from meaningful moments — bringing a villager what they asked
 * for, bringing their home back from the storm. Those moments are *kept* as
 * memories and resurface in how villagers greet you. Pure and deterministic:
 * no RNG, so greetings are testable and stable across a session.
 *
 * Market note: genuine attachment is the retention moat (habit apps hold
 * D30 ~40% vs ~3% for merge games). This system is where attachment lives.
 */
import type { Memory, RelationshipState, VillagerBond } from './types';
import { villagerDef } from '../data/villagers';

/** Hearts shown top out at 5 (Book III), but bond points keep accruing. */
export const HEARTS_MAX = 5;
const POINTS_PER_HEART = 4;

export function initialRelationships(): RelationshipState {
  return {};
}

const EMPTY_BOND: VillagerBond = { points: 0, memories: [] };

export function bondFor(state: RelationshipState, id: string): VillagerBond {
  return state[id] ?? EMPTY_BOND;
}

/** 0..5 hearts from accumulated bond points. */
export function hearts(points: number): number {
  return Math.min(HEARTS_MAX, Math.floor(points / POINTS_PER_HEART));
}

/** Whether this villager has become a close friend (full hearts). */
export function isDear(state: RelationshipState, id: string): boolean {
  return hearts(bondFor(state, id).points) >= HEARTS_MAX;
}

/**
 * Record a moment. Adds bond points and keeps up to 8 recent memories
 * (newest first). Returns a new state — never mutates.
 */
export function recordMemory(state: RelationshipState, id: string, memory: Memory): RelationshipState {
  const cur = bondFor(state, id);
  return {
    ...state,
    [id]: {
      points: cur.points + memory.warmth,
      memories: [memory, ...cur.memories].slice(0, 8),
    },
  };
}

/**
 * A greeting that reflects the bond and resurfaces the latest memory
 * ("Memories should appear naturally in future conversations" — Book III).
 */
export function greetingFor(state: RelationshipState, id: string, playerName?: string): string {
  const def = villagerDef(id);
  const name = def?.name ?? 'They';
  const bond = bondFor(state, id);
  const h = hearts(bond.points);
  // The player's own name is a bond-deepening payoff, not a constant refrain:
  // only a villager who has really come to know you (max hearts) uses it, so
  // hearing your name said back to you means something the first time it lands.
  const you = playerName?.trim();
  const tier =
    h >= HEARTS_MAX
      ? you
        ? `${name} lights up the moment you appear, ${you}.`
        : `${name} lights up the moment you appear.`
      : h >= 3
        ? `${name} greets you like an old friend.`
        : h >= 1
          ? `${name} gives you a warm nod.`
          : `${name} is still getting to know you.`;
  const latest = bond.memories[0];
  return latest ? `${tier} They remember: “${latest.text}.”` : tier;
}

/** Compose the memory text for delivering `itemName` to a villager. */
export function deliveryMemory(day: string, name: string, itemName: string): Memory {
  return { day, text: `you brought ${name} ${itemName.toLowerCase()}`, warmth: 2 };
}

/** Compose the memory text for bringing a villager's home back. */
export function restoreMemory(day: string, buildingName: string): Memory {
  return { day, text: `you brought ${buildingName} back to life`, warmth: 3 };
}
