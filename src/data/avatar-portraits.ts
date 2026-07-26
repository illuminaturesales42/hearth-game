/**
 * Painted player-portrait catalogue. The avatar is portrait-first (GDD): players
 * choose a fully-painted bust that fits Emberhollow's old-seaside storybook style,
 * rather than assembling a vector paper-doll. Art is authored per the spec in
 * docs/avatar-modular-catalogue.md and dropped into public/art/; entries here
 * "light up" automatically once their PNG exists (availablePortraits filters to
 * present art), so the picker never shows a broken tile.
 *
 * Two-step selection (GDD): players pick a face-type (one of 12 base characters)
 * first, then browse that character's skin-tone × hairstyle variations. Every
 * variation is a full painted portrait — no layering/compositing (v1.2 pivot:
 * paper-doll was scrapped as it doesn't fit painterly busts).
 */
import { artUrl } from '../art-manifest';

export interface PortraitDef {
  /** Stable id stored in the save (never the raw art id, so art can be renamed). */
  readonly id: string;
  /** Accessibility label / picker title. */
  readonly name: string;
  /** Art manifest id → public/art/<artId>.png. */
  readonly artId: string;
  /** Groups variations of the same face together (1-12). Absent for legacy singles. */
  readonly characterId?: number;
  readonly tags?: readonly string[];
}

export interface FaceTypeDef {
  readonly characterId: number;
  readonly name: string;
}

/** The 12 base characters (face/identity). Names are picker labels, not lore-bound. */
export const FACE_TYPES: readonly FaceTypeDef[] = [
  { characterId: 1, name: 'Gardener' },
  { characterId: 2, name: 'Dockhand' },
  { characterId: 3, name: 'Baker' },
  { characterId: 4, name: 'Fisher' },
  { characterId: 5, name: 'Librarian' },
  { characterId: 6, name: 'Herbalist' },
  { characterId: 7, name: 'Boatswain' },
  { characterId: 8, name: 'Keeper' },
  { characterId: 9, name: 'Trader' },
  { characterId: 10, name: 'Carpenter' },
  { characterId: 11, name: 'Newcomer' },
  { characterId: 12, name: 'Postmaster' },
] as const;

const SKIN_LABELS: Record<number, string> = { 1: 'light', 2: 'medium', 3: 'tan', 4: 'deep' };
const HAIR_LABELS: Record<number, string> = {
  1: 'curly updo',
  2: 'cropped',
  3: 'braid',
  4: 'wavy',
  5: 'coils',
  6: 'capped',
};

/** The 12×4×6 modular catalogue — 288 full painted portraits, grouped by characterId. */
const CATALOGUE: readonly PortraitDef[] = FACE_TYPES.flatMap((face) =>
  Array.from({ length: 4 }, (_, si) => si + 1).flatMap((skin) =>
    Array.from({ length: 6 }, (_, hi) => hi + 1).map((hair) => {
      const cc = String(face.characterId).padStart(2, '0');
      const hh = String(hair).padStart(2, '0');
      return {
        id: `av_c${cc}_skin${skin}_hair${hh}`,
        name: `${face.name} — ${SKIN_LABELS[skin]} skin, ${HAIR_LABELS[hair]}`,
        artId: `avatar_c${cc}_skin${skin}_hair${hh}`,
        characterId: face.characterId,
      };
    }),
  ),
);

/** Legacy single-portrait set (pre-catalogue spec). Kept resolvable for any save
 *  that already persisted one of these ids; not shown as its own picker step. */
const PAINTED: readonly PortraitDef[] = Array.from({ length: 18 }, (_, i) => {
  const n = String(i + 1).padStart(2, '0');
  return { id: `av_p${n}`, name: `Villager portrait ${i + 1}`, artId: `avatar_portrait_${n}` };
});

// NOTE: the old `avatar_1..6` "framed friend portraits" fallback was removed —
// those are real in-game characters (wired into the friends list as
// `.friend-face.av-N` in styles.css). Letting players pick one as their own
// face would collide with an existing NPC identity, so they're never offered
// here. Any save that persisted one of the old `av_f{n}` ids is coerced back
// to a present catalogue id via normalizeAvatar (isPortraitId now returns
// false for them, defaultPortraitId supplies a replacement).

export const PORTRAITS: readonly PortraitDef[] = [...CATALOGUE, ...PAINTED];

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

/** Available catalogue variations for one face-type, grouped for the second
 *  picker step. Empty if that character's art hasn't landed yet. */
export function availableVariationsFor(characterId: number): readonly PortraitDef[] {
  return CATALOGUE.filter((p) => p.characterId === characterId && artUrl(p.artId) !== null);
}

/** Face-types that have at least one available variation — what the first
 *  picker step should offer. Falls back to legacy/fallback singles (as their
 *  own ungrouped tiles) if no catalogue art exists yet at all. */
export function availableFaceTypes(): readonly FaceTypeDef[] {
  return FACE_TYPES.filter((f) => availableVariationsFor(f.characterId).length > 0);
}

/** True once any catalogue art exists, so the UI knows whether to show the
 *  two-step face-type flow or fall back to the flat legacy/fallback grid. */
export function hasCatalogueArt(): boolean {
  return availableFaceTypes().length > 0;
}

/** A representative thumbnail id for a face-type (first available variation). */
export function faceTypeThumbnail(characterId: number): string | undefined {
  return availableVariationsFor(characterId)[0]?.id;
}

/** A safe default id: the first catalogue/legacy portrait whose art is
 *  present. The catalogue always has art once this module is live in a build
 *  (see docs/avatar-modular-catalogue.md), so this is never empty in practice. */
export function defaultPortraitId(): string {
  const first = availablePortraits()[0];
  if (!first) {
    throw new Error('avatar-portraits: no portrait art available — check public/art/ and the manifest');
  }
  return first.id;
}
