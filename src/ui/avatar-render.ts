/**
 * Avatar bust renderer (MVP, SVG). Turns an AvatarAppearance into a tintable,
 * chest-up storybook bust — the single primitive reused by the creator preview,
 * dialogue portraits, the profile and reward cards (one source of truth, GDD
 * §7.3 / §13.7). SVG keeps payload near-zero, recolour instant, and is trivially
 * reduced-motion-safe (it never animates). Painterly PNG-atlas layers replace
 * these groups slot-for-slot later; callers stay unchanged.
 *
 * Layer order (back → front): backdrop · body/shoulders (garment) · neck · head
 * · hair-back · face features · hair-front. All share one 100×100 viewBox so
 * layers stay registered — the same principle as the town's building composite.
 */
import type { AvatarAppearance } from '../core/types';
import { CLOTH_COLOURS, HAIR_COLOURS, SKIN_TONES, swatchHex } from '../core/avatar';

export interface BustOptions {
  /** Soft round backdrop behind the bust (as in dialogue cards). */
  backdrop?: string | null;
  /** Expression override for reactions (defaults to the face preset's rest). */
  expression?: 'neutral' | 'happy' | 'thinking';
  /** Decorative — accessibility label for the <svg>. */
  label?: string;
}

/** Shoulder half-width per body silhouette (all share the same neck/head). */
const SHOULDER: Record<string, number> = { b_slim: 30, b_soft: 36, b_broad: 42 };

/** Shade a hex toward black for shadow tones (0..1). */
function darken(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amt)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amt)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amt)));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Hair silhouette: a back mass (behind the head) + a front piece (fringe/edge).
 *  Each id gets a recognisable shape; kept simple to read at small sizes. */
function hairPaths(id: string): { back: string; front: string } {
  switch (id) {
    case 'h_crop':
      return { back: '', front: '<path d="M32 40 Q50 22 68 40 Q64 32 50 30 Q36 32 32 40 Z"/>' };
    case 'h_bob':
      return {
        back: '<path d="M30 42 Q30 66 34 74 L34 44 Q40 30 50 29 Q60 30 66 44 L66 74 Q70 66 70 42 Q70 24 50 24 Q30 24 30 42 Z"/>',
        front: '<path d="M32 42 Q50 26 68 42 Q60 33 50 32 Q40 33 32 42 Z"/>',
      };
    case 'h_waves':
      return {
        back: '<path d="M28 44 Q26 70 32 80 Q34 60 34 46 Q40 30 50 29 Q60 30 66 46 Q66 60 68 80 Q74 70 72 44 Q72 24 50 24 Q28 24 28 44 Z"/>',
        front: '<path d="M32 42 Q42 28 50 30 Q58 28 68 42 Q60 34 50 33 Q40 34 32 42 Z"/>',
      };
    case 'h_pony':
      return {
        back: '<path d="M66 40 Q78 46 74 66 Q70 74 66 70 Q70 52 64 44 Z"/>',
        front: '<path d="M32 42 Q50 24 68 42 Q64 32 50 30 Q36 32 32 42 Z"/>',
      };
    case 'h_bun':
      return {
        back: '<circle cx="50" cy="20" r="9"/>',
        front: '<path d="M33 41 Q50 26 67 41 Q62 32 50 31 Q38 32 33 41 Z"/>',
      };
    case 'h_curls':
      return {
        back: '<path d="M28 40 Q24 58 32 70 Q28 54 34 44 Q38 28 50 27 Q62 28 66 44 Q72 54 68 70 Q76 58 72 40 Q72 22 50 22 Q28 22 28 40 Z"/>',
        front: '<path d="M31 42 Q35 30 42 31 Q46 27 50 30 Q54 27 58 31 Q65 30 69 42 Q60 34 50 34 Q40 34 31 42 Z"/>',
      };
    case 'h_afro':
      return {
        back: '<circle cx="50" cy="34" r="26"/>',
        front: '',
      };
    case 'h_locs':
      return {
        back: '<path d="M28 40 L30 80 L36 80 L35 46 Q40 28 50 27 Q60 28 65 46 L64 80 L70 80 L72 40 Q72 22 50 22 Q28 22 28 40 Z"/>',
        front: '<path d="M32 42 Q50 26 68 42 Q60 33 50 32 Q40 33 32 42 Z"/>',
      };
    default:
      return { back: '', front: '<path d="M32 40 Q50 24 68 40 Q64 32 50 30 Q36 32 32 40 Z"/>' };
  }
}

/** Face features per preset, adjusted by expression. Eyes + brows + mouth. */
function facePaths(id: string, expr: 'neutral' | 'happy' | 'thinking'): string {
  // Eye y and mouth curve vary a little by preset for character.
  const keen = id === 'f_keen';
  const dreamy = id === 'f_dreamy';
  const eyeY = dreamy ? 49 : 48;
  const eye = keen
    ? `<path d="M40 ${eyeY} q3 -2 6 0" stroke="#3a2b22" stroke-width="1.6" fill="none" stroke-linecap="round"/>
       <path d="M54 ${eyeY} q3 -2 6 0" stroke="#3a2b22" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
    : `<circle cx="43" cy="${eyeY}" r="1.8" fill="#3a2b22"/><circle cx="57" cy="${eyeY}" r="1.8" fill="#3a2b22"/>`;
  const brow =
    id === 'f_bright' || expr === 'happy'
      ? `<path d="M40 44 q3 -1.5 6 0" stroke="#4a3526" stroke-width="1.2" fill="none" stroke-linecap="round"/>
         <path d="M54 44 q3 -1.5 6 0" stroke="#4a3526" stroke-width="1.2" fill="none" stroke-linecap="round"/>`
      : `<path d="M40 44 h6" stroke="#4a3526" stroke-width="1.2" stroke-linecap="round"/>
         <path d="M54 44 h6" stroke="#4a3526" stroke-width="1.2" stroke-linecap="round"/>`;
  const smile = id === 'f_gentle' || id === 'f_warm' || id === 'f_bright';
  const mouth =
    expr === 'thinking'
      ? `<path d="M46 57 q4 1 8 0" stroke="#8a4a3a" stroke-width="1.4" fill="none" stroke-linecap="round"/>`
      : expr === 'happy' || smile
        ? `<path d="M44 56 q6 5 12 0" stroke="#8a4a3a" stroke-width="1.6" fill="none" stroke-linecap="round"/>`
        : `<path d="M45 57 q5 2 10 0" stroke="#8a4a3a" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
  const blush =
    id === 'f_warm' || id === 'f_bright'
      ? `<circle cx="38" cy="53" r="3" fill="#e8887a" opacity="0.35"/><circle cx="62" cy="53" r="3" fill="#e8887a" opacity="0.35"/>`
      : '';
  return `${blush}${eye}${brow}${mouth}`;
}

/**
 * Build a self-contained SVG bust string for an appearance. Safe to inject as
 * innerHTML (all values are numeric/hex from our own catalogues — no user text).
 */
export function avatarBustSVG(appearance: AvatarAppearance, opts: BustOptions = {}): string {
  const skin = swatchHex(SKIN_TONES, appearance.skin);
  const skinShade = darken(skin, 0.12);
  const hairHex = swatchHex(HAIR_COLOURS, appearance.hairColour);
  const hairShade = darken(hairHex, 0.18);
  const cloth = swatchHex(CLOTH_COLOURS, appearance.topColour);
  const clothShade = darken(cloth, 0.14);
  const sw = SHOULDER[appearance.body] ?? SHOULDER.b_soft!;
  const { back, front } = hairPaths(appearance.hair);
  const expr = opts.expression ?? 'neutral';
  const face = facePaths(appearance.face, expr);
  const backdrop =
    opts.backdrop === null
      ? ''
      : `<rect x="0" y="0" width="100" height="100" rx="14" fill="${opts.backdrop ?? '#f3e7cf'}"/>`;
  const label = opts.label ? `<title>${opts.label}</title>` : '';

  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" class="avatar-bust" role="img" aria-label="${opts.label ?? 'player avatar'}">${label}
  ${backdrop}
  <!-- shoulders / garment -->
  <path d="M${50 - sw} 100 Q50 ${76} ${50 + sw} 100 Z" fill="${cloth}"/>
  <path d="M${50 - sw} 100 Q50 ${76} ${50 + sw} 100 L${50 + sw} 100 Q50 ${82} ${50 - sw} 100 Z" fill="${clothShade}" opacity="0.5"/>
  <!-- neck -->
  <rect x="45" y="60" width="10" height="14" rx="4" fill="${skinShade}"/>
  <!-- hair back -->
  <g fill="${hairShade}">${back}</g>
  <!-- head -->
  <ellipse cx="50" cy="46" rx="19" ry="21" fill="${skin}"/>
  <!-- ears -->
  <circle cx="31" cy="48" r="3.4" fill="${skin}"/><circle cx="69" cy="48" r="3.4" fill="${skin}"/>
  <!-- face features -->
  <g>${face}</g>
  <!-- hair front -->
  <g fill="${hairHex}">${front}</g>
</svg>`;
}

/** Render a bust into a container element (UI convenience). */
export function renderBustInto(el: HTMLElement, appearance: AvatarAppearance, opts?: BustOptions): void {
  el.innerHTML = avatarBustSVG(appearance, opts);
}
