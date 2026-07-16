/**
 * Reaction onsets — the *felt* half of the living world.
 *
 * The town already paints gentle resting states from the WorldMood each frame
 * (see map-view.drawReactions). But a gradually-appearing static state is the
 * exact thing human perception ignores (just-noticeable-difference + slow-change
 * blindness), so players never notice the world answering them. The fix, from
 * the research: when a real action happens, fire a brief, LOCAL, animated ONSET
 * cue right at the effect's spot — motion + light + one soft tone — then let the
 * scene settle back to its calm resting state. Big-brief-local onset → gentle rest.
 *
 * This module owns a tiny queue of one-shot cues and draws them in world space
 * (normalized 0..1 coords → the same camera transform as the town). Pure drawing
 * + a little time; no game logic. Pillar-safe: every cue is warm and additive.
 */

export type OnsetKind = 'ripple' | 'motes' | 'bloom' | 'heart' | 'glow' | 'mist' | 'caption';

interface Onset {
  kind: OnsetKind;
  x: number; // 0..1 of canvas width
  y: number; // 0..1 of canvas height
  start: number; // performance.now()
  dur: number; // ms
  colour: string;
  text?: string; // for 'caption'
}

const FLOWER_COLOURS = ['#e6739a', '#ffd27a', '#a06be0', '#f2996b', '#7fbf6a'];
const easeOut = (p: number): number => 1 - Math.pow(1 - p, 3);

export class ReactionOnsets {
  private list: Onset[] = [];

  /** Enqueue a cue at a normalized map location. */
  add(kind: OnsetKind, x: number, y: number, opts: { dur?: number; colour?: string; text?: string } = {}): void {
    this.list.push({
      kind,
      x,
      y,
      start: nowMs(),
      dur: opts.dur ?? (kind === 'caption' ? 3000 : 1200),
      colour: opts.colour ?? '#ffe6b8',
      ...(opts.text !== undefined ? { text: opts.text } : {}),
    });
  }

  get active(): boolean {
    return this.list.length > 0;
  }

  clear(): void {
    this.list = [];
  }

  /** Draw all live cues and drop finished ones. Call inside the town transform. */
  draw(ctx: CanvasRenderingContext2D, W: number, H: number, reduce: boolean): void {
    const now = nowMs();
    this.list = this.list.filter((o) => now - o.start < o.dur);
    for (const o of this.list) {
      const p = Math.min(1, (now - o.start) / o.dur);
      drawOnset(ctx, o, W, H, p, reduce);
    }
  }
}

function drawOnset(ctx: CanvasRenderingContext2D, o: Onset, W: number, H: number, p: number, reduce: boolean): void {
  const x = o.x * W;
  const y = o.y * H;
  const fade = 1 - p; // most cues fade out across their life
  switch (o.kind) {
    case 'ripple': {
      // Expanding rings on the water/plaza — the classic "something happened here".
      ctx.save();
      const rings = reduce ? 1 : 3;
      for (let r = 0; r < rings; r++) {
        const rp = Math.min(1, p + r * 0.18);
        const rad = W * (0.02 + easeOut(rp) * 0.08);
        ctx.globalAlpha = (1 - rp) * 0.7;
        ctx.strokeStyle = o.colour;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y, rad, rad * 0.42, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      break;
    }
    case 'motes': {
      // A burst of light-motes rising and fading — a warm "onset" transient.
      ctx.save();
      const n = reduce ? 3 : 6;
      for (let i = 0; i < n; i++) {
        const seed = i * 1.7;
        const rise = easeOut(p) * H * 0.09;
        const sway = reduce ? 0 : Math.sin(p * 6 + seed) * W * 0.012;
        const mx = x + sway + Math.cos(seed) * W * 0.02;
        const my = y - rise - (i % 3) * 4;
        const g = ctx.createRadialGradient(mx, my, 0, mx, my, 5);
        g.addColorStop(0, `rgba(255, 236, 190, ${(fade * 0.95).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255, 236, 190, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(mx, my, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'bloom': {
      // A few petals pop into being with an overshoot, then hold.
      ctx.save();
      const pop = p < 0.5 ? easeOut(p / 0.5) * 1.15 : 1.15 - (p - 0.5) * 0.3;
      const n = reduce ? 3 : 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const px = x + Math.cos(a) * W * 0.03;
        const py = y + Math.sin(a) * H * 0.02;
        const size = 3 * pop;
        ctx.fillStyle = FLOWER_COLOURS[i % FLOWER_COLOURS.length]!;
        ctx.globalAlpha = Math.min(1, p * 3);
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    }
    case 'heart': {
      // A single warm heart drifts up (kindness).
      ctx.save();
      const hy = y - easeOut(p) * H * 0.08;
      const s = W * 0.02 * (p < 0.3 ? easeOut(p / 0.3) : 1);
      ctx.globalAlpha = fade;
      ctx.fillStyle = o.colour === '#ffe6b8' ? '#e6739a' : o.colour;
      ctx.beginPath();
      ctx.moveTo(x, hy + s * 0.6);
      ctx.bezierCurveTo(x + s, hy - s * 0.3, x + s * 0.4, hy - s, x, hy - s * 0.3);
      ctx.bezierCurveTo(x - s * 0.4, hy - s, x - s, hy - s * 0.3, x, hy + s * 0.6);
      ctx.fill();
      ctx.restore();
      break;
    }
    case 'glow': {
      // A soft brightness bloom that rises then eases away (a warm swell).
      ctx.save();
      const k = Math.sin(p * Math.PI); // 0→1→0
      const rad = W * 0.28;
      const g = ctx.createRadialGradient(x, y, 4, x, y, rad);
      g.addColorStop(0, `rgba(255, 210, 130, ${(k * 0.22).toFixed(3)})`);
      g.addColorStop(1, 'rgba(255, 210, 130, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      ctx.restore();
      break;
    }
    case 'mist': {
      // A cool translucent band drifts across (cold plunge / sea mist).
      ctx.save();
      const drift = (p - 0.5) * W * 0.2;
      const g = ctx.createLinearGradient(x - W * 0.2, y, x + W * 0.2, y);
      const a = (Math.sin(p * Math.PI) * 0.28).toFixed(3);
      g.addColorStop(0, 'rgba(214, 238, 246, 0)');
      g.addColorStop(0.5, `rgba(214, 238, 246, ${a})`);
      g.addColorStop(1, 'rgba(214, 238, 246, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - W * 0.2 + drift, y - H * 0.05, W * 0.4, H * 0.1);
      ctx.restore();
      break;
    }
    case 'caption': {
      // One diegetic line by the effect — "the town noticed" — then it recedes.
      if (!o.text) break;
      ctx.save();
      const alpha = p < 0.15 ? p / 0.15 : p > 0.8 ? (1 - p) / 0.2 : 1;
      ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
      ctx.font = '600 12px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const padX = 10;
      const w = ctx.measureText(o.text).width + padX * 2;
      const cy = y - easeOut(Math.min(1, p * 2)) * H * 0.03;
      const bx = Math.max(w / 2 + 4, Math.min(W - w / 2 - 4, x)); // keep on-canvas
      ctx.fillStyle = 'rgba(20, 16, 30, 0.72)';
      roundRect(ctx, bx - w / 2, cy - 11, w, 22, 11);
      ctx.fill();
      ctx.fillStyle = '#ffe6b8';
      ctx.fillText(o.text, bx, cy);
      ctx.restore();
      break;
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// performance.now is fine at runtime; guard for non-DOM test envs.
function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : 0;
}
