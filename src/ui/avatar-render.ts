/**
 * Player-portrait renderer. Portrait-first MVP: the avatar is a painted bust
 * chosen from data/avatar-portraits, rendered as a circular (or framed) crop —
 * the same treatment as the villager busts (background-image, cover, center-top),
 * so the player sits convincingly beside Bran, Sorin and the rest. Static image,
 * so it is reduced-motion-safe by construction.
 */
import { portraitArt } from '../data/avatar-portraits';

export interface PortraitOptions {
  /** Add a soft ring/frame (profile & cards); off for inline dialogue busts. */
  framed?: boolean;
  /** Accessibility label. */
  label?: string;
}

/** Inline HTML for a portrait id. Safe to inject (values are our own art ids). */
export function avatarPortraitHTML(portraitId: string, opts: PortraitOptions = {}): string {
  const url = portraitArt(portraitId) ?? '';
  const cls = `avatar-portrait${opts.framed ? ' framed' : ''}`;
  const style = url ? ` style="background-image:url(${url})"` : '';
  return `<span class="${cls}" role="img" aria-label="${opts.label ?? 'player avatar'}"${style}></span>`;
}

/** Render a portrait into a container element (UI convenience). */
export function renderPortraitInto(el: HTMLElement, portraitId: string, opts?: PortraitOptions): void {
  el.innerHTML = avatarPortraitHTML(portraitId, opts);
}
