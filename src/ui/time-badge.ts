/**
 * The corner time-of-day badge on the Home map. Four painted framed vignettes
 * (sunrise / midday / sunset / night) stacked as layers, their opacities driven
 * by the SAME continuous phase weights that grade the map — so the medallion
 * blends smoothly through the day (dawn melting into midday into dusk into
 * night) instead of snapping, and always matches the scene's light.
 *
 * Art-gated: any layer whose art isn't sliced stays absent; if none resolve the
 * badge hides. The blend follows a hearthSky() override instantly.
 */
import { phaseForTime, PHASE_META, type PhaseWeights, type TimeOfDay } from '../core/time-of-day';
import { latestSunTimes } from './weather';
import { artUrl } from './art';

let timer: number | undefined;
// weight key → phase art, in draw order
const LAYERS: { key: keyof PhaseWeights; phase: TimeOfDay }[] = [
  { key: 'night', phase: 'night' },
  { key: 'day', phase: 'midday' },
  { key: 'dawn', phase: 'sunrise' },
  { key: 'dusk', phase: 'sunset' },
];
let built = false;

function build(badge: HTMLElement): boolean {
  let any = false;
  for (const { phase } of LAYERS) {
    const url = artUrl(PHASE_META[phase].art);
    const layer = document.createElement('div');
    layer.className = 'time-badge__layer';
    layer.dataset.phase = phase;
    if (url) {
      layer.style.backgroundImage = `url(${url})`;
      any = true;
    }
    layer.style.opacity = '0';
    badge.appendChild(layer);
  }
  return any;
}

function paint(): void {
  const badge = document.getElementById('time-badge');
  if (!badge) return;
  if (!built) {
    if (!build(badge)) {
      badge.hidden = true; // no badge art at all
      return;
    }
    built = true;
  }
  const { phase, weights } = phaseForTime(Date.now(), latestSunTimes());
  badge.hidden = false;
  for (const el of Array.from(badge.children) as HTMLElement[]) {
    const layer = LAYERS.find((l) => l.phase === el.dataset.phase);
    // evening has no bespoke badge art yet — it rides the sunset vignette so
    // the medallion never goes dark in deep twilight
    if (layer) el.style.opacity = Math.min(1, weights[layer.key] + (layer.key === 'dusk' ? weights.evening : 0)).toFixed(3);
  }
  badge.setAttribute('aria-label', `Time of day: ${PHASE_META[phase].label}`);
  badge.title = PHASE_META[phase].label;
}

/** Start the badge: paint now, then re-check every minute (cheap) and on the
 *  same sky events as the map + UI theme, so the blend stays in step. */
export function initTimeBadge(): void {
  paint();
  if (timer === undefined) timer = window.setInterval(paint, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) paint();
  });
  document.addEventListener('hearth:sky-updated', paint);
  document.addEventListener('hearth:location-changed', paint);
}
