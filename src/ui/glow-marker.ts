/**
 * Discovery glow — a small, soft pulse that points at a feature the player
 * hasn't tried yet. Reads `game.pendingNudges()` (see core/discovery) and lights
 * the matching nav items, the energy pill, the Village Life cards and the
 * Almanac. Each marker retires the moment the player engages, and never returns.
 *
 * Cosy: capped upstream at ~3 live glows, a slow gentle pulse, and a static ring
 * under reduce-motion. An invitation, never a badge count.
 */
import type { Game } from '../core/game';
import { nudgesForScreen, pendingNudges } from '../core/discovery';

/** Toggle a single glow dot on a host element (idempotent). */
export function setGlow(host: HTMLElement | null, on: boolean): void {
  if (!host) return;
  const has = host.querySelector(':scope > .glow-dot');
  if (on && !has) {
    const dot = document.createElement('span');
    dot.className = 'glow-dot';
    dot.setAttribute('aria-hidden', 'true');
    // the host must position the dot; ensure a positioning context
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(dot);
  } else if (!on && has) {
    has.remove();
  }
}

/**
 * Repaint the top-level discovery glows (bottom-nav items + the energy pill)
 * from the current pending nudges. Cheap; call on every `state` event and after
 * a screen change. Per-feature glows (mini-game cards, Almanac) are painted by
 * their own renderers.
 */
export function refreshGlobalGlows(game: Game): void {
  const state = game.snapshot;
  // Bottom nav — a dot on the screens you'd navigate TO (Villagers, Journal)
  // when they hold something untried. Home is deliberately skipped: you're
  // usually already on it, and its game/almanac nudges glow on the map itself
  // (a dot on the round Home icon read as a stray second circle).
  document.querySelectorAll<HTMLElement>('.nav-btn').forEach((btn) => {
    const screen = btn.dataset.screen;
    const lit = (screen === 'villagers' || screen === 'journal') && nudgesForScreen(state, screen).length > 0;
    setGlow(btn, lit);
  });
  // The energy pill — a dot when there's a way to earn energy never tried.
  const pill = document.getElementById('energy-pill');
  const actionsUntried = pendingNudges(state).some((n) => n.startsWith('action:'));
  setGlow(pill, actionsUntried);
}
