/**
 * The corner time-of-day badge on the Home map. A painted framed vignette
 * (sunrise / midday / sunset / night) that reflects the real clock and refreshes
 * itself as the hours turn — the same phase that drives the map's own lighting
 * (see core/time-of-day + map-view), so the badge and the scene stay in step.
 *
 * Art-gated: until the badge art is sliced, artUrl() returns null and the badge
 * simply stays hidden — the map is unaffected.
 */
import { phaseForTime, PHASE_META, type TimeOfDay } from '../core/time-of-day';
import { latestSunTimes } from './weather';
import { artUrl } from './art';

let current: TimeOfDay | null = null;
let timer: number | undefined;

function paint(): void {
  const badge = document.getElementById('time-badge');
  if (!badge) return;
  // Same real solar clock (sunrise/sunset) the map's lighting reads, so the
  // badge and the whole scene always show the same time of day.
  const p = PHASE_META[phaseForTime(Date.now(), latestSunTimes()).phase];
  if (p.phase === current) return; // only touch the DOM when the phase actually turns
  const url = artUrl(p.art);
  if (!url) {
    badge.hidden = true;
    return;
  }
  current = p.phase;
  badge.style.backgroundImage = `url(${url})`;
  badge.setAttribute('aria-label', `Time of day: ${p.label}`);
  badge.title = p.label;
  badge.hidden = false;
  // a gentle cross-fade as the light turns
  badge.classList.remove('turn');
  void badge.offsetWidth;
  badge.classList.add('turn');
}

/** Start the badge: paint now, then re-check every minute (cheap; only redraws
 *  on an actual phase change) and whenever the app returns to the foreground. */
export function initTimeBadge(): void {
  paint();
  if (timer === undefined) timer = window.setInterval(paint, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) paint();
  });
  // The first paint may predate the weather fetch (clock-band fallback); repaint
  // the moment real sun times land or the player changes town, so the medallion
  // snaps to the true solar phase instead of waiting out the minute timer.
  document.addEventListener('hearth:sky-updated', paint);
  document.addEventListener('hearth:location-changed', paint);
}
