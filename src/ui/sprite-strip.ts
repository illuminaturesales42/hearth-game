/**
 * Play a sliced sprite-strip animation (the fx_* atlas: N equal frames laid out
 * horizontally in one PNG) on a DOM element by stepping its background-position
 * each frame. One shared, verified stepper so every FX animates the same correct
 * way — no CSS `steps()` off-by-one, no frame-count drift, no trailing blank
 * frame. Loop for ambient flames; one-shot (default) for a burst.
 *
 * Returns a stop() — call it to cancel a loop (or on teardown). One-shots stop
 * themselves after the last frame and invoke `onEnd` (e.g. to remove the node).
 */
export function playStrip(
  host: HTMLElement,
  url: string,
  opts: { frames?: number; fps?: number; loop?: boolean; onEnd?: () => void } = {},
): () => void {
  const frames = Math.max(2, opts.frames ?? 7);
  const fps = opts.fps ?? 16;
  host.style.backgroundImage = `url(${url})`;
  host.style.backgroundRepeat = 'no-repeat';
  host.style.backgroundSize = `${frames * 100}% 100%`;
  host.style.animation = 'none'; // ensure no CSS keyframe also drives the position
  let f = 0;
  let last = 0;
  let stopped = false;
  let raf = 0;
  const stepMs = 1000 / fps;
  const tick = (t: number): void => {
    if (stopped) return;
    if (!last) last = t;
    if (t - last >= stepMs) {
      last = t;
      f += 1;
      if (f >= frames) {
        if (opts.loop) f = 0;
        else {
          stopped = true;
          opts.onEnd?.();
          return;
        }
      }
    }
    // background-size is frames×wide, so the scrollable range is (frames-1)×box;
    // a position of f/(frames-1) shows exactly frame f (0..frames-1), never past.
    host.style.backgroundPositionX = `${(f / (frames - 1)) * 100}%`;
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
  };
}
