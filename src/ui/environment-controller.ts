/**
 * The Environment Controller (design guide §2): recomputes the WorldEnvironment
 * from the real clock/sun/weather and pushes it to the interface as CSS custom
 * properties on <html>, so the whole UI breathes with the player's day. Also
 * fires `hearth:environment` for future consumers (audio, map).
 *
 * The theme is decorative only — it never touches text, semantic (good/danger),
 * currency or focus colours. Consuming surfaces carry slow CSS transitions, so a
 * var change eases in; body.high-contrast pins every var to its default. Same
 * update triggers as the time badge, so a hearthSky() override themes instantly.
 */
import { computeEnvironment, lerpHex, type WorldEnvironment } from '../core/environment';
import { latestSunTimes, latestWeather } from './weather';

const root = () => document.documentElement;

/** Compute + apply the theme now. */
function apply(): void {
  const env = computeEnvironment(Date.now(), latestSunTimes(), latestWeather());
  const s = root().style;
  const night = env.nightAmount;

  // App background: deepen toward ink at night, a plum hint at dusk, a slight
  // lift at dawn — always dark enough for the storybook mood.
  s.setProperty('--env-bg-0', lerpHex('#0d1322', night > 0 ? '#080d1a' : '#0d1322', night));
  s.setProperty('--env-bg-1', lerpHex('#0f1626', env.ambient, 0.14 + 0.14 * night));

  // Panels: a whisper of the ambient colour so cards feel lit by the same sky.
  s.setProperty('--env-panel', lerpHex('#1b2138', env.ambient, 0.06 + 0.04 * night));
  s.setProperty('--env-panel-2', lerpHex('#232a45', env.ambient, 0.05 + 0.03 * night));

  // Primary button + progress fill + trim borrow a touch of the key warmth.
  s.setProperty('--env-btn-hi', lerpHex('#ffd884', env.light, 0.06 * env.warmth));
  s.setProperty('--env-ember-hi', lerpHex('#ffd27a', env.light, 0.12 * env.warmth));
  s.setProperty('--env-frame', `rgba(240, 200, 120, ${(0.5 + 0.12 * env.goldenHour).toFixed(3)})`);
  s.setProperty('--env-nav-active', lerpHex('#f4a63b', env.light, 0.1 * env.warmth));

  // Energy pill: its ember quietly glows stronger as the light fails — the
  // interface's own little hearth answering the dark.
  const glow = 0.1 + 0.5 * night;
  s.setProperty('--env-pill-glow', `rgba(244, 166, 59, ${glow.toFixed(3)})`);

  document.dispatchEvent(new CustomEvent<WorldEnvironment>('hearth:environment', { detail: env }));
}

let started = false;

/** Start the controller: apply now, then on the same cadence as the badge. */
export function initEnvironmentController(): void {
  if (started) return;
  started = true;
  apply();
  window.setInterval(apply, 60_000);
  document.addEventListener('hearth:sky-updated', apply);
  document.addEventListener('hearth:location-changed', apply);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) apply();
  });
}
