/**
 * Painted player-portrait catalogue. The avatar is portrait-first (GDD): players
 * choose a fully-painted bust that fits Emberhollow's old-seaside storybook style,
 * rather than assembling a vector paper-doll. Art is authored per the spec in
 * docs/avatar-portrait-art-spec.md and dropped into public/art/; entries here
 * "light up" automatically once their PNG exists (availablePortraits filters to
 * present art), so the picker never shows a broken tile.
 *
 * Until the bespoke `avatar_portrait_NN` set lands, the picker falls back to the
 * existing framed friend portraits (avatar_1..6) so it is testable today.
 */
import { artUrl } from '../art-manifest';

export interface PortraitDef {
  /** Stable id stored in the save (never the raw art id, so art can be renamed). */
  readonly id: string;
  /** Accessibility label / picker title. */
  readonly name: string;
  /** Art manifest id → public/art/<artId>.png. */
  readonly artId: string;
  readonly tags?: readonly string[];
}

/** The bespoke painterly set (see docs/avatar-portrait-art-spec.md). Ids are
 *  stable; art fills in as the PNGs are generated. */
const PAINTED: readonly PortraitDef[] = Array.from({ length: 18 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return { id: `av_p${n}`, name: `Villager portrait ${i + 1}`, artId: `avatar_portrait_${n}` };
});

/** Interim fallback: the existing framed friend portraits. Cosy and on-style, so
 *  the picker works before the bespoke set exists. Remove once PAINTED is filled. */
const FALLBACK: readonly PortraitDef[] = Array.from({ length: 6 }, (_, i) => ({
  id: `av_f${i + 1}`,
  name: `Traveller ${i + 1}`,
  artId: `avatar_${i + 1}`,
}));

export const PORTRAITS: readonly PortraitDef[] = [...PAINTED, ...FALLBACK];

const BY_ID = new Map(PORTRAITS.map((p) => [p.id, p] as const));

/** Resolve a portrait id to its art URL, or null if the art isn't present. */
export function portraitArt(id: string): string | null {
  const def = BY_ID.get(id);
  return def ? artUrl(def.artId) : null;
}

export function isPortraitId(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

/** Portraits whose art actually exists — what the picker should offer. */
export function availablePortraits(): readonly PortraitDef[] {
  return PORTRAITS.filter((p) => artUrl(p.artId) !== null);
}

/** A safe default id: the first portrait whose art is present (else the first
 *  fallback id, which is guaranteed to exist in the repo). */
export function defaultPortraitId(): string {
  return availablePortraits()[0]?.id ?? FALLBACK[0]!.id;
}
