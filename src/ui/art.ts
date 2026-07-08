/**
 * Art lookup helpers: bridge from game ids to sliced sheet assets
 * (public/art, via the generated manifest), with emoji fallbacks so the game
 * never breaks when an asset is missing.
 */
import { artUrl } from '../art-manifest';
import { chainDef } from '../core/board';
import type { ChainId } from '../core/types';

/** Inner markup for a merge tile: painted icon if sliced, emoji otherwise. */
export function tileMarkup(chain: ChainId, level: number): string {
  const url = artUrl(`item_${chain}_${level}`);
  if (url) return `<img class="tile-art" src="${url}" alt="" draggable="false" />`;
  const glyph = chainDef(chain).levels[level] ?? '❔';
  return `<span class="glyph">${glyph}</span>`;
}

/** Character bust for a villager display name (order.who etc), or null. */
export function portraitFor(who: string): string | null {
  const name = who.toLowerCase();
  for (const id of ['bran', 'wren', 'sorin', 'marta', 'joss', 'mayor']) {
    if (name.includes(id)) return artUrl(`char_${id}_bust`);
  }
  return null;
}

/** Energy-action id -> painted wellness medallion (Batch 10). */
const ACTION_ART: Record<string, string> = {
  steps: 'action_walk',
  stairs: 'action_exercise',
  sleep: 'action_sleep',
  water: 'action_water',
  'photo-outside': 'action_photo',
  squats: 'action_exercise',
  'sunrise-photo': 'action_sunrise',
  'sunset-photo': 'action_sunset',
  'nature-photo': 'action_nature',
  stretch: 'action_stretch',
  breathe: 'action_breathe',
  'log-meditation': 'action_meditate',
  kindness: 'action_kindness',
  stargaze: 'action_sleep',
  'cold-plunge': 'action_cold_plunge',
  sauna: 'action_sauna',
  gratitude: 'action_journal',
  reading: 'action_reading',
};

/** Markup for an energy action's icon: painted medallion if we have one, else the emoji. */
export function actionIcon(actionId: string, emoji: string, cls = 'earn-ico'): string {
  const art = ACTION_ART[actionId];
  const url = art ? artUrl(art) : null;
  if (url) return `<span class="${cls} act-art"><img src="${url}" alt="" /></span>`;
  return `<span class="${cls}">${emoji}</span>`;
}

/** Direct action-art url for a known subject (e.g. a CTA), or null. */
export function actionArt(subject: string): string | null {
  return artUrl(`action_${subject}`);
}

export { artUrl };
