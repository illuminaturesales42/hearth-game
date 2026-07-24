/**
 * Player avatar: identity within Emberhollow. Portrait-first (busts in dialogue,
 * profile, rewards) — there is no walking character yet. This module is the
 * DOM-free data model: the config that lives in the save, the curated option
 * catalogues, and the starting presets. Rendering lives in ui/avatar-render.ts.
 *
 * Design rules (see GDD §2): identity is never gated, everything is inclusive,
 * cosmetics are memories not merchandise, and nothing here ever touches gameplay
 * stats — the avatar is expression, never power.
 *
 * MVP scope: a small, hand-picked set of layers rendered as tintable SVG, so the
 * system ships with zero art dependency and zero PWA-cache pressure. Painterly
 * PNG-atlas layers replace the SVG groups slot-for-slot later; the config shape
 * below does not change.
 */

import type { AvatarAppearance, AvatarConfig } from './types';

export type { AvatarAppearance, AvatarConfig } from './types';

/** One curated colour swatch: a stable id plus the hex used to tint a layer. */
export interface Swatch {
  readonly id: string;
  readonly name: string;
  readonly hex: string;
}

/** A selectable option in a category (body, hair, face, top…). */
export interface AvatarOption {
  readonly id: string;
  readonly name: string;
}

// --- Curated catalogues (MVP counts; expand without code changes later) -------

/** Inclusive body silhouettes. MVP ships 3 of the eventual 6; all share anchors
 *  so every garment fits every body. */
export const BODIES: readonly AvatarOption[] = [
  { id: 'b_slim', name: 'Slim' },
  { id: 'b_soft', name: 'Soft' },
  { id: 'b_broad', name: 'Broad' },
];

/** Full inclusive skin-tone range — always free, never gated. */
export const SKIN_TONES: readonly Swatch[] = [
  { id: 'sk_porcelain', name: 'Porcelain', hex: '#f6d9c2' },
  { id: 'sk_fair', name: 'Fair', hex: '#eec2a0' },
  { id: 'sk_warm', name: 'Warm', hex: '#e0aa7e' },
  { id: 'sk_olive', name: 'Olive', hex: '#c98e5f' },
  { id: 'sk_tan', name: 'Tan', hex: '#b3743f' },
  { id: 'sk_bronze', name: 'Bronze', hex: '#94572c' },
  { id: 'sk_deep', name: 'Deep', hex: '#6e3d1e' },
  { id: 'sk_rich', name: 'Rich', hex: '#4a2714' },
];

/** Hair styles — texture-first representation is a launch requirement, not a
 *  later update. MVP ships a broad-texture spread of 8. */
export const HAIR_STYLES: readonly AvatarOption[] = [
  { id: 'h_crop', name: 'Short Crop' },
  { id: 'h_bob', name: 'Soft Bob' },
  { id: 'h_waves', name: 'Loose Waves' },
  { id: 'h_pony', name: 'Ponytail' },
  { id: 'h_bun', name: 'Messy Bun' },
  { id: 'h_curls', name: 'Tight Curls' },
  { id: 'h_afro', name: 'Afro' },
  { id: 'h_locs', name: 'Locs' },
];

/** Natural hair colours plus a few soft storybook tones. */
export const HAIR_COLOURS: readonly Swatch[] = [
  { id: 'hc_black', name: 'Black', hex: '#2b2622' },
  { id: 'hc_espresso', name: 'Espresso', hex: '#3f2c20' },
  { id: 'hc_chestnut', name: 'Chestnut', hex: '#6b4324' },
  { id: 'hc_auburn', name: 'Auburn', hex: '#8a3f24' },
  { id: 'hc_wheat', name: 'Wheat', hex: '#c79a5a' },
  { id: 'hc_ash', name: 'Ash', hex: '#8f8a86' },
  { id: 'hc_silver', name: 'Silver', hex: '#cfc9c2' },
  { id: 'hc_ember', name: 'Ember', hex: '#b45a2b' },
];

/** Face presets bundle a resting eye + mouth character (soft, approachable). */
export const FACES: readonly AvatarOption[] = [
  { id: 'f_gentle', name: 'Gentle' },
  { id: 'f_bright', name: 'Bright' },
  { id: 'f_calm', name: 'Calm' },
  { id: 'f_warm', name: 'Warm' },
  { id: 'f_keen', name: 'Keen' },
  { id: 'f_dreamy', name: 'Dreamy' },
];

/** Starter tops. Gender-independent; all fit all bodies. */
export const TOPS: readonly AvatarOption[] = [
  { id: 't_linen', name: 'Linen Shirt' },
  { id: 't_jumper', name: 'Knit Jumper' },
  { id: 't_tunic', name: 'Fisher Tunic' },
  { id: 't_pinafore', name: 'Pinafore' },
  { id: 't_overalls', name: 'Overalls' },
  { id: 't_cardigan', name: 'Cardigan' },
];

/** Emberhollow clothing palette — restrained, warm, world-consistent. Curated
 *  swatches (never a free RGB wheel) keep every combination on-style. */
export const CLOTH_COLOURS: readonly Swatch[] = [
  { id: 'cc_cream', name: 'Cream', hex: '#efe3cb' },
  { id: 'cc_linen', name: 'Linen', hex: '#d9c7a7' },
  { id: 'cc_moss', name: 'Moss', hex: '#7c8a5a' },
  { id: 'cc_sage', name: 'Sage', hex: '#9fb08a' },
  { id: 'cc_sea', name: 'Sea', hex: '#5c8798' },
  { id: 'cc_slate', name: 'Slate', hex: '#5b6672' },
  { id: 'cc_clay', name: 'Clay', hex: '#b05a41' },
  { id: 'cc_hearth', name: 'Hearth', hex: '#c9743a' },
  { id: 'cc_burgundy', name: 'Burgundy', hex: '#7a3b40' },
];

// --- Presets: complete, characterful starting people (not blank bases) --------

export interface AvatarPreset {
  readonly id: string;
  readonly name: string;
  readonly appearance: AvatarAppearance;
}

export const PRESETS: readonly AvatarPreset[] = [
  {
    id: 'p_reader',
    name: 'The Reader',
    appearance: { body: 'b_slim', skin: 'sk_fair', hair: 'h_bob', hairColour: 'hc_chestnut', face: 'f_dreamy', top: 't_cardigan', topColour: 'cc_sea' },
  },
  {
    id: 'p_gardener',
    name: 'The Gardener',
    appearance: { body: 'b_soft', skin: 'sk_tan', hair: 'h_bun', hairColour: 'hc_espresso', face: 'f_warm', top: 't_overalls', topColour: 'cc_moss' },
  },
  {
    id: 'p_fisher',
    name: 'The Fisher',
    appearance: { body: 'b_broad', skin: 'sk_bronze', hair: 'h_crop', hairColour: 'hc_black', face: 'f_keen', top: 't_tunic', topColour: 'cc_slate' },
  },
  {
    id: 'p_baker',
    name: 'The Baker',
    appearance: { body: 'b_soft', skin: 'sk_warm', hair: 'h_curls', hairColour: 'hc_auburn', face: 'f_bright', top: 't_linen', topColour: 'cc_cream' },
  },
  {
    id: 'p_keeper',
    name: 'The Keeper',
    appearance: { body: 'b_broad', skin: 'sk_deep', hair: 'h_locs', hairColour: 'hc_black', face: 'f_calm', top: 't_jumper', topColour: 'cc_burgundy' },
  },
  {
    id: 'p_wanderer',
    name: 'The Wanderer',
    appearance: { body: 'b_slim', skin: 'sk_rich', hair: 'h_afro', hairColour: 'hc_espresso', face: 'f_gentle', top: 't_pinafore', topColour: 'cc_clay' },
  },
];

// --- Factory + normalisation (validate at the boundary) -----------------------

/** The neutral traveller look worn until the player visits the creator. Kept
 *  deliberately plain so first creation feels like a real change. */
export function defaultAvatar(): AvatarConfig {
  return {
    created: false,
    appearance: {
      body: 'b_soft',
      skin: 'sk_warm',
      hair: 'h_crop',
      hairColour: 'hc_chestnut',
      face: 'f_gentle',
      top: 't_linen',
      topColour: 'cc_linen',
    },
  };
}

/** Return `id` if it names an option in `opts`, else the fallback. */
const pick = (opts: readonly { id: string }[], id: unknown, fallback: string): string =>
  typeof id === 'string' && opts.some((o) => o.id === id) ? id : fallback;

/**
 * Coerce any appearance (e.g. from an imported/legacy save, or a future build
 * that removed an option) into a valid one, falling back per-field to the
 * neutral default. Never throws — a stray id must never break the portrait.
 */
export function normalizeAppearance(a: Partial<AvatarAppearance> | undefined): AvatarAppearance {
  const d = defaultAvatar().appearance;
  return {
    body: pick(BODIES, a?.body, d.body),
    skin: pick(SKIN_TONES, a?.skin, d.skin),
    hair: pick(HAIR_STYLES, a?.hair, d.hair),
    hairColour: pick(HAIR_COLOURS, a?.hairColour, d.hairColour),
    face: pick(FACES, a?.face, d.face),
    top: pick(TOPS, a?.top, d.top),
    topColour: pick(CLOTH_COLOURS, a?.topColour, d.topColour),
  };
}

export function normalizeAvatar(cfg: Partial<AvatarConfig> | undefined): AvatarConfig {
  if (!cfg) return defaultAvatar();
  // Build without explicit `undefined` keys (exactOptionalPropertyTypes).
  const out: AvatarConfig = {
    created: Boolean(cfg.created),
    appearance: normalizeAppearance(cfg.appearance),
  };
  if (typeof cfg.name === 'string') out.name = cfg.name.slice(0, 24);
  if (typeof cfg.pronouns === 'string') out.pronouns = cfg.pronouns.slice(0, 24);
  if (Array.isArray(cfg.owned)) out.owned = cfg.owned.filter((x): x is string => typeof x === 'string');
  if (Array.isArray(cfg.presets)) {
    const raw = cfg.presets as ReadonlyArray<{ name?: unknown; appearance?: Partial<AvatarAppearance> }>;
    out.presets = raw.map((p) => ({
      name: (typeof p.name === 'string' ? p.name : '').slice(0, 24),
      appearance: normalizeAppearance(p.appearance),
    }));
  }
  return out;
}

/** Look up the hex for a swatch id in a given palette (for the renderer). */
export function swatchHex(palette: readonly Swatch[], id: string): string {
  return palette.find((s) => s.id === id)?.hex ?? palette[0]!.hex;
}

/** A deterministic-but-varied random look (curated, never ugly): draws only
 *  from the catalogues so every roll is on-style. Pass an index to vary. */
export function randomAppearance(pick: (n: number) => number): AvatarAppearance {
  const at = <T,>(arr: readonly T[]): T => arr[pick(arr.length) % arr.length]!;
  return {
    body: at(BODIES).id,
    skin: at(SKIN_TONES).id,
    hair: at(HAIR_STYLES).id,
    hairColour: at(HAIR_COLOURS).id,
    face: at(FACES).id,
    top: at(TOPS).id,
    topColour: at(CLOTH_COLOURS).id,
  };
}
