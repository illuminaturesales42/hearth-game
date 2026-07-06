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
  for (const id of ['bran', 'wren', 'sorin', 'marta', 'joss']) {
    if (name.includes(id)) return artUrl(`char_${id}_bust`);
  }
  return null;
}

export { artUrl };
