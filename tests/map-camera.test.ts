import { describe, expect, it } from 'vitest';
import { clampCamera, screenToWorld, worldToScreen, zoomAt, FIT } from '../src/core/map-camera';

const W = 360;
const H = 285;

describe('map camera — pan/zoom transform', () => {
  it('fit-zoom is the identity (classic view unchanged)', () => {
    expect(worldToScreen(FIT, 120, 90)).toEqual({ x: 120, y: 90 });
    expect(screenToWorld(FIT, 120, 90)).toEqual({ x: 120, y: 90 });
  });

  it('screenToWorld is the exact inverse of worldToScreen at any camera', () => {
    const cams = [FIT, { zoom: 1.8, panX: -100, panY: -60 }, { zoom: 2.6, panX: -300, panY: -200 }];
    const points: [number, number][] = [
      [0, 0],
      [180, 142],
      [359, 284],
    ];
    for (const cam of cams) {
      for (const [wx, wy] of points) {
        const s = worldToScreen(cam, wx, wy);
        const back = screenToWorld(cam, s.x, s.y);
        expect(back.x).toBeCloseTo(wx, 6);
        expect(back.y).toBeCloseTo(wy, 6);
      }
    }
  });

  it('a tap on a zoomed building maps back to that building’s world rect', () => {
    // A building whose world hit-rect is x[300..340], y[120..160].
    const cam = { zoom: 2, panX: -400, panY: -180 };
    // Tap the world centre (320,140) → its screen position → back to world.
    const screen = worldToScreen(cam, 320, 140);
    const world = screenToWorld(cam, screen.x, screen.y);
    expect(world.x).toBeGreaterThanOrEqual(300);
    expect(world.x).toBeLessThanOrEqual(340);
    expect(world.y).toBeGreaterThanOrEqual(120);
    expect(world.y).toBeLessThanOrEqual(160);
  });

  it('clamp keeps the viewport inside the scaled scene', () => {
    // Over-panned right/down past the origin → clamped to 0.
    expect(clampCamera({ zoom: 2, panX: 50, panY: 50 }, W, H)).toEqual({ zoom: 2, panX: 0, panY: 0 });
    // Over-panned left/up past the far edge → clamped to W(1-z), H(1-z).
    const far = clampCamera({ zoom: 2, panX: -9999, panY: -9999 }, W, H);
    expect(far.panX).toBe(W - W * 2);
    expect(far.panY).toBe(H - H * 2);
  });

  it('fit-zoom always recentres to the origin', () => {
    expect(clampCamera({ zoom: 1, panX: -80, panY: -40 }, W, H)).toEqual(FIT);
    expect(clampCamera({ zoom: 0.5, panX: 20, panY: 20 }, W, H)).toEqual(FIT);
  });

  it('zoomAt keeps the point under the cursor fixed', () => {
    const cursor = { x: 200, y: 120 };
    const worldBefore = screenToWorld(FIT, cursor.x, cursor.y);
    const cam = zoomAt(FIT, 1.8, cursor.x, cursor.y, W, H);
    const worldAfter = screenToWorld(cam, cursor.x, cursor.y);
    // Unless clamping intervenes, the same world point stays under the cursor.
    expect(worldAfter.x).toBeCloseTo(worldBefore.x, 3);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y, 3);
  });
});
