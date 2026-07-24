/**
 * Player avatar: identity within Emberhollow. Portrait-first — the player chooses
 * a painted bust that fits the town's storybook style (catalogue in
 * data/avatar-portraits.ts), rather than assembling features. This module is the
 * DOM-free model: the save block factory + normalisation. Cosmetic only; never
 * touches gameplay stats (the avatar is expression, never power).
 */
import type { AvatarConfig } from './types';
import { defaultPortraitId, isPortraitId } from '../data/avatar-portraits';

export type { AvatarConfig } from './types';

/** The neutral traveller carried until the player uses the picker once. */
export function defaultAvatar(): AvatarConfig {
  return { created: false, portrait: defaultPortraitId() };
}

/**
 * Coerce any avatar (imported/legacy save, or a build that removed a portrait)
 * into a valid one. Never throws — an unknown portrait falls back to a present
 * one, and absent optionals are omitted (exactOptionalPropertyTypes).
 */
export function normalizeAvatar(cfg: Partial<AvatarConfig> | undefined): AvatarConfig {
  if (!cfg) return defaultAvatar();
  const out: AvatarConfig = {
    created: Boolean(cfg.created),
    portrait: isPortraitId(cfg.portrait) ? cfg.portrait : defaultPortraitId(),
  };
  if (typeof cfg.name === 'string') out.name = cfg.name.slice(0, 24);
  if (typeof cfg.pronouns === 'string') out.pronouns = cfg.pronouns.slice(0, 24);
  return out;
}
