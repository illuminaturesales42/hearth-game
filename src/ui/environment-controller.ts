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
  const { dawn, dusk, night } = env.weights;
  // phase-specific tints so the chrome reads warm at dusk, cool-rose at dawn,
  // deep ink at night — midday stays neutral. Each starts from the exact static
  // value so midday === today's look. Strong enough to actually feel.
  const tint = (base: string, warm: string, cool: string, deep: string): string => {
    let c = lerpHex(base, warm, dusk * 0.42); // golden-hour amber
    c = lerpHex(c, cool, dawn * 0.3); // first-light cool rose
    c = lerpHex(c, deep, night * 0.55); // night ink
    return c;
  };

  // App background gradient stops.
  s.setProperty('--env-bg-0', tint('#0d1322', '#241826', '#111a2a', '#05080f'));
  s.setProperty('--env-bg-1', tint('#0f1626', '#2c1e30', '#182236', '#0a1020'));
  // Panels / cards.
  s.setProperty('--env-panel', tint('#1b2138', '#312632', '#212a44', '#12182c'));
  s.setProperty('--env-panel-2', tint('#232a45', '#3d3038', '#2a3352', '#182038'));
  // Primary button + progress fill + nav ring borrow the key's warmth.
  s.setProperty('--env-btn-hi', lerpHex('#ffd884', env.light, 0.1 * env.warmth));
  s.setProperty('--env-ember-hi', lerpHex('#ffd27a', env.light, 0.16 * env.warmth));
  s.setProperty('--env-nav-active', lerpHex('#ffd27a', env.light, 0.14 * env.warmth));
  s.setProperty('--env-frame', `rgba(240, 200, 120, ${(0.5 + 0.14 * env.goldenHour).toFixed(3)})`);

  // Energy pill: its ember glows stronger as the light fails — the interface's
  // own little hearth answering the dark.
  const glow = 0.06 + 0.6 * env.nightAmount;
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
