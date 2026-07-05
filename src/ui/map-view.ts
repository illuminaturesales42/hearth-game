/**
 * Emberhollow harbour, rendered on canvas so the player can *see* the town grow.
 * Buildings rise and light up, the lighthouse kindles and sweeps, and the water
 * shimmers — all driven by orders delivered. Gentle ambient motion, paused when
 * the screen isn't visible and reduced under prefers-reduced-motion.
 */
import type { Game } from '../core/game';
import { MAP_LOCATIONS } from '../data/world';
import { ORDERS, ZONE_STAGES } from '../data/economy';

interface Building {
  x: number; // 0..1 across the shore
  w: number;
  h: number; // 0..1 of town band height
  hue: string;
}

// A fixed skyline; how many are "restored" scales with progress.
const BUILDINGS: readonly Building[] = [
  { x: 0.06, w: 34, h: 0.62, hue: '#c98a4a' },
  { x: 0.17, w: 30, h: 0.82, hue: '#b56b3c' },
  { x: 0.27, w: 40, h: 0.5, hue: '#d29a58' },
  { x: 0.38, w: 28, h: 0.72, hue: '#a85a34' },
  { x: 0.48, w: 44, h: 0.9, hue: '#c4803f' },
  { x: 0.6, w: 30, h: 0.6, hue: '#bd7440' },
  { x: 0.7, w: 36, h: 0.78, hue: '#d0954f' },
  { x: 0.82, w: 26, h: 0.55, hue: '#b0602f' },
];

export class MapView {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private visible = false;
  private reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(private game: Game) {
    game.subscribe((ev) => {
      if ((ev.type === 'delivered' || ev.type === 'chapterComplete') && this.visible) {
        this.renderList();
        if (this.reduce) this.draw(0);
      }
    });
  }

  private progress(): number {
    return Math.min(1, this.game.snapshot.orderIndex / ORDERS.length);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (v) {
      this.mount();
      this.renderList();
      this.resize();
      if (this.reduce) this.draw(0);
      else this.loop();
    } else {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private mount(): void {
    if (this.canvas) return;
    this.canvas = document.getElementById('map-canvas') as HTMLCanvasElement | null;
    this.ctx = this.canvas?.getContext('2d') ?? null;
    window.addEventListener('resize', () => {
      if (this.visible) {
        this.resize();
        if (this.reduce) this.draw(0);
      }
    });
  }

  private resize(): void {
    if (!this.canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || 360;
    const h = 240;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private loop(): void {
    const step = (t: number) => {
      this.draw(t);
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private draw(t: number): void {
    const ctx = this.ctx;
    const cv = this.canvas;
    if (!ctx || !cv) return;
    const W = cv.clientWidth || 360;
    const H = 240;
    const prog = this.progress();
    ctx.clearRect(0, 0, W, H);

    // sky (sunset warms as the town is restored)
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.7);
    sky.addColorStop(0, '#2a3358');
    sky.addColorStop(0.55, mix('#5a4a6a', '#8a5a4a', prog));
    sky.addColorStop(1, mix('#8a5540', '#e0894f', prog));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.7);

    // sun, rising with progress
    const sunY = H * (0.52 - prog * 0.18);
    const sun = ctx.createRadialGradient(W * 0.5, sunY, 4, W * 0.5, sunY, 46);
    sun.addColorStop(0, '#ffe6a8');
    sun.addColorStop(1, 'rgba(255,176,74,0)');
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(W * 0.5, sunY, 46, 0, Math.PI * 2);
    ctx.fill();

    // town band
    const bandTop = H * 0.44;
    const bandH = H * 0.28;
    const built = Math.round(prog * BUILDINGS.length);
    BUILDINGS.forEach((b, i) => {
      const isBuilt = i < built;
      const bx = b.x * W;
      const bh = bandH * b.h;
      const by = bandTop + (bandH - bh);
      if (isBuilt) {
        ctx.fillStyle = b.hue;
        ctx.fillRect(bx, by, b.w, bh);
        // roof
        ctx.fillStyle = shade(b.hue, -0.25);
        ctx.beginPath();
        ctx.moveTo(bx - 3, by);
        ctx.lineTo(bx + b.w / 2, by - 10);
        ctx.lineTo(bx + b.w + 3, by);
        ctx.closePath();
        ctx.fill();
        // warm windows, gently flickering
        const rows = Math.max(1, Math.floor(bh / 16));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < 2; c++) {
            const flick = this.reduce ? 1 : 0.75 + 0.25 * Math.sin(t / 500 + i * 2 + r + c);
            ctx.fillStyle = `rgba(255,214,140,${(0.35 + 0.5 * flick).toFixed(3)})`;
            ctx.fillRect(bx + 6 + c * (b.w - 16), by + 8 + r * 16, 7, 8);
          }
        }
      } else {
        // scaffolded / storm-struck: faint outline
        ctx.strokeStyle = 'rgba(180,160,150,0.3)';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by + bh * 0.3, b.w, bh * 0.7);
      }
    });

    // lighthouse (kindles once the harbour is coming back)
    const lit = prog >= 3 / ORDERS.length;
    const lx = W * 0.92;
    const ly = bandTop - 6;
    ctx.fillStyle = '#e9e2d0';
    ctx.fillRect(lx - 5, ly, 10, H * 0.24);
    ctx.fillStyle = lit ? '#ffe6a8' : '#3a4152';
    ctx.fillRect(lx - 7, ly - 9, 14, 9);
    if (lit) {
      const ang = this.reduce ? -0.2 : Math.sin(t / 1400) * 0.5;
      const beam = ctx.createLinearGradient(lx, ly - 4, lx - 120 * Math.cos(ang), ly - 4 - 60 * Math.sin(ang));
      beam.addColorStop(0, 'rgba(255,230,160,0.5)');
      beam.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(lx, ly - 4);
      ctx.lineTo(lx - 130 * Math.cos(ang - 0.12), ly - 4 - 90 * Math.sin(ang - 0.12));
      ctx.lineTo(lx - 130 * Math.cos(ang + 0.12), ly - 4 - 90 * Math.sin(ang + 0.12));
      ctx.closePath();
      ctx.fill();
    }

    // sea with shimmer
    const seaTop = bandTop + bandH;
    const sea = ctx.createLinearGradient(0, seaTop, 0, H);
    sea.addColorStop(0, '#1c3b4a');
    sea.addColorStop(1, '#0c1c2a');
    ctx.fillStyle = sea;
    ctx.fillRect(0, seaTop, W, H - seaTop);
    ctx.strokeStyle = 'rgba(255,220,150,0.16)';
    ctx.lineWidth = 1;
    for (let y = seaTop + 8; y < H; y += 12) {
      const off = this.reduce ? 0 : Math.sin(t / 700 + y) * 6;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= W; x += 24) ctx.lineTo(x, y + Math.sin(x / 30 + t / 600 + off) * 1.6);
      ctx.stroke();
    }

    this.updateBar(prog);
  }

  private updateBar(prog: number): void {
    const fill = document.getElementById('map-bar-fill');
    if (fill) fill.style.width = `${Math.round(prog * 100)}%`;
    const label = document.getElementById('map-progress');
    if (label) {
      const delivered = this.game.snapshot.orderIndex;
      const stage = [...ZONE_STAGES].reverse().find((z) => delivered >= z.at) ?? ZONE_STAGES[0]!;
      label.textContent = `${stage.label} · ${Math.round(prog * 100)}% restored`;
    }
  }

  private renderList(): void {
    const host = document.getElementById('map-body');
    if (!host) return;
    const delivered = this.game.snapshot.orderIndex;
    host.innerHTML =
      `<div class="loc-list">` +
      MAP_LOCATIONS.map((l) => {
        const locked = delivered < l.unlockAt;
        return (
          `<div class="loc ${locked ? 'locked' : ''}">` +
          `<div class="loc-main"><b>${l.name}</b>` +
          (locked
            ? `<span class="loc-lock">Locked · ${l.unlockAt} orders</span>`
            : `<span class="loc-lvl">Level ${l.level}</span>`) +
          `</div><p>${locked ? 'Keep restoring the harbour to reach it.' : l.blurb}</p></div>`
        );
      }).join('') +
      `</div>`;
  }
}

// ---- small colour helpers ----
function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const c = ca.map((v, i) => Math.round(v + (cb[i]! - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
function shade(hex: string, amt: number): string {
  const c = hexToRgb(hex).map((v) => Math.max(0, Math.min(255, Math.round(v * (1 + amt)))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
