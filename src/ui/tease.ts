/**
 * The day-2 hook: a forward-looking line that gives tomorrow a face. Research
 * note (docs/market-research-2026-07.md): below D1 20% nothing saves a game —
 * the cheapest lever is a reason to come back that's story, not pressure.
 */
import { orderAt } from '../data/endless';
import { chainDef } from '../core/board';
import { BUILDING_INFO, TOWN_BUILDINGS } from '../data/town-layout';
import { dailyBonus } from '../core/actions';
import type { GameState } from '../core/types';

/** "Wren waits for a lantern. The Market returns when it arrives." */
export function nextTease(orderIndex: number): string | null {
  const order = orderAt(orderIndex);
  const def = chainDef(order.need.chain);
  const item = def.levelNames[order.need.level] ?? 'something special';
  const building = TOWN_BUILDINGS.find((b) => b.unlockAt === orderIndex + 1);
  const returning = building ? BUILDING_INFO[building.art] : null;
  return `${order.who} waits for ${item.toLowerCase()}${returning ? ` — ${returning} returns when it arrives` : ''}.`;
}

/** The dawn line for Home: what tomorrow's sunrise is worth, plus the story pull. */
export function tomorrowLine(s: GameState): string {
  const bonus = dailyBonus(s.actions.streak + 1);
  const tease = nextTease(s.orderIndex);
  return `Tomorrow at dawn: +${bonus} energy for returning${tease ? ` · ${tease}` : ''}`;
}
