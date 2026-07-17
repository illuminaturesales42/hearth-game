/**
 * Pure camera math for the Home map's pan/zoom. Kept dependency-free and unit
 * tested because the one real trap in a pannable canvas is the draw-space ↔
 * hit-space transform drifting apart: draw() applies `translate(pan)·scale(zoom)`
 * and the click hit-test must apply the exact inverse, or taps land on the wrong
 * building. worldToScreen/screenToWorld here are exact inverses by construction.
 *
 * Coordinates: "world" = the logical scene space (W × H, where buildings are
 * positioned); "screen" = viewport CSS pixels within the canvas.
 */
export interface Camera {
  /** 1 = fit (identity); >1 zooms into the same scene. */
  zoom: number;
  /** Viewport offset in CSS px (≤ 0 when zoomed in). */
  panX: number;
  panY: number;
}

export const FIT: Camera = { zoom: 1, panX: 0, panY: 0 };

/**
 * Keep the viewport inside the scaled scene. At fit-zoom (≤1) the camera is
 * always centred at the origin (identity), matching the classic non-zoom view.
 */
export function clampCamera(cam: Camera, w: number, h: number): Camera {
  if (cam.zoom <= 1) return { ...FIT };
  return {
    zoom: cam.zoom,
    panX: Math.min(0, Math.max(w - w * cam.zoom, cam.panX)),
    panY: Math.min(0, Math.max(h - h * cam.zoom, cam.panY)),
  };
}

/** Screen (viewport CSS px) → world (logical scene) — the hit-test transform. */
export function screenToWorld(cam: Camera, x: number, y: number): { x: number; y: number } {
  return { x: (x - cam.panX) / cam.zoom, y: (y - cam.panY) / cam.zoom };
}

/** World → screen — the draw transform (translate·scale), exact inverse of above. */
export function worldToScreen(cam: Camera, x: number, y: number): { x: number; y: number } {
  return { x: x * cam.zoom + cam.panX, y: y * cam.zoom + cam.panY };
}

/**
 * Zoom to `z`, keeping the world point currently under the screen point
 * (cx, cy) fixed — so wheel/button zoom feels anchored, not jumpy. Result is
 * clamped to the scene.
 */
export function zoomAt(cam: Camera, z: number, cx: number, cy: number, w: number, h: number): Camera {
  const world = screenToWorld(cam, cx, cy);
  return clampCamera({ zoom: z, panX: cx - world.x * z, panY: cy - world.y * z }, w, h);
}
