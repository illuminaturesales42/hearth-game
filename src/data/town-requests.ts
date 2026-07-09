/**
 * Town Requests: villagers ask for a few craft resources and pay coins for
 * them — the demand side of the Workshop economy. Deterministic daily rotation
 * (like daily quests), reset each day, and only for the resource chains the
 * Workshop can make, so they're always fulfillable. Coins only, never energy.
 */
import type { ChainId } from '../core/types';

export interface TownRequest {
  id: string;
  who: string;
  chain: ChainId;
  level: number;
  qty: number;
  coins: number;
}

const WHO = ['Bran', 'Wren', 'Sorin', 'Marta', 'Joss'];

// Only chains the Workshop can spawn (see RESOURCE_SPAWN_TABLE) so a request
// is always achievable once the Workshop is unlocked.
const REQ_CHAINS: readonly ChainId[] = ['stone', 'clay', 'flowers', 'water', 'herbs', 'wool'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Three requests for a given local day key, stable all day, reset daily. */
export function requestsForDay(day: string): TownRequest[] {
  const seed = hash(day);
  const out: TownRequest[] = [];
  for (let i = 0; i < 3; i++) {
    const r = seed >> (i * 6);
    const chain = REQ_CHAINS[r % REQ_CHAINS.length]!;
    const level = 1 + ((r >> 3) % 2); // 1 or 2 — reachable with a merge or two
    const qty = 2 + ((r >> 5) % 2); // 2 or 3
    const coins = (level + 1) * qty * 14; // scales with effort
    out.push({ id: `tr-${i}`, who: WHO[(r >> 7) % WHO.length]!, chain, level, qty, coins });
  }
  return out;
}
