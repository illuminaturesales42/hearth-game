/**
 * Emberhollow homestead, rendered on canvas so the player can *see* it grow —
 * following the concept art's five-stage progression from a storm-wrecked frame
 * to the Beacon of Emberhollow. A single central cottage gains walls, a roof,
 * lit windows, a garden, and finally a beacon as orders are delivered. Gentle
 * ambient motion, paused when hidden and reduced under prefers-reduced-motion.
 *
 * This is the shippable procedural stand-in; the painted stage art swaps in
 * behind the same `stage()` data during the M2 art pass.
 */
import type { Game } from '../core/game';
import { MAP_LOCATIONS } from '../data/world';
import { ORDERS, chapterFor, stageFor } from '../data/economy';
import { questsForDay } from '../data/daily-quests';
import { TOWN_BUILDINGS, TOWN_NATURE } from '../data/town-layout';
import { artUrl } from './art';

const STAGE_NAMES = [
  'Storm-Wrecked',
  'Rebuilding Begins',
  'A Place to Call Home',
  'A Flourishing Haven',
  'Beacon of Emberhollow',
] as const;

export class MapView {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  private visible = false;
  private reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Painted stage backdrops (sliced from the concept sheets); null until loaded. */
  private stageArt: (HTMLImageElement | null)[] = [null, null, null, null, null];
  /** Sprite cache for the composed town scene. */
  private sprites = new Map<string, HTMLImageElement>();
  /** Recently-appeared building pop-in animations (art id -> start ms). */
  private appeared = new Map<string, number>();
  private lastOrderIndex = -1;

  constructor(private game: Game) {
    for (let i = 0; i < 5; i++) {
      const url = artUrl(`stage_${i}`);
      if (!url) continue;
      const img = new Image();
      img.onload = () => {
        this.stageArt[i] = img;
        if (this.visible && this.reduce) this.draw(0);
      };
      img.src = url;
    }
    game.subscribe((ev) => {
      const refresh =
        ev.type === 'delivered' || ev.type === 'chapterComplete' || ev.type === 'merge' ||
        ev.type === 'action' || ev.type === 'questDone' || ev.type === 'chronicle';
      if (refresh && this.visible) {
        this.renderList();
        if (this.reduce) this.draw(0);
      }
    });
  }

  private progress(): number {
    return Math.min(1, this.game.snapshot.orderIndex / ORDERS.length);
  }
  /** 0..4 homestead stage, spread across the full MVP story. */
  private stage(): number {
    return stageFor(this.game.snapshot.orderIndex);
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
    const stage = this.stage();
    ctx.clearRect(0, 0, W, H);

    // Composed living town (building sprites unlock with the story).
    if (artUrl('town_townhall')) {
      this.drawTown(ctx, W, H, t, prog, stage);
      this.updateBar(prog, stage);
      return;
    }

    // Painted stage backdrop when available (procedural scene as fallback).
    const art = this.stageArt[stage];
    if (art) {
      const scale = Math.max(W / art.width, H / art.height);
      const dw = art.width * scale;
      const dh = art.height * scale;
      ctx.drawImage(art, (W - dw) / 2, (H - dh) / 2, dw, dh);
      // Living Emberhollow: the town keeps real time and answers your day.
      const counts = this.game.snapshot.actions.counts;
      const meditated = Object.keys(counts).some((k) => k.startsWith('med-') && (counts[k] ?? 0) > 0);
      const sleptWell = (this.game.snapshot.healthLedger?.sleepGranted ?? 0) > 0;
      if (!this.reduce) {
        // Hearth-glow pulse: warmer after a good night, calmer after meditation.
        const speed = meditated ? 2600 : 1600;
        const base = sleptWell ? 0.09 : 0.05;
        const pulse = base + 0.03 * Math.sin(t / speed);
        const glow = ctx.createRadialGradient(W * 0.5, H * 0.42, 10, W * 0.5, H * 0.42, W * 0.6);
        glow.addColorStop(0, `rgba(255, 200, 120, ${pulse.toFixed(3)})`);
        glow.addColorStop(1, 'rgba(255, 200, 120, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);
      }
      // Time-of-day light over the painting (real clock).
      const hour = new Date().getHours();
      if (hour >= 5 && hour < 11) ctx.fillStyle = 'rgba(255, 226, 170, 0.07)';
      else if (hour >= 17 && hour < 21) ctx.fillStyle = 'rgba(255, 140, 70, 0.10)';
      else if (hour >= 21 || hour < 5) ctx.fillStyle = 'rgba(24, 34, 84, 0.30)';
      else ctx.fillStyle = 'rgba(0, 0, 0, 0)';
      ctx.fillRect(0, 0, W, H);
      // A nature photo today plants a little colour along the shore path.
      if ((counts['nature-photo'] ?? 0) > 0) {
        const flowers = ['#e6739a', '#ffd27a', '#a06be0', '#7fbf6a', '#e6739a'];
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = flowers[i]!;
          ctx.beginPath();
          ctx.arc(W * (0.18 + i * 0.14), H * 0.9, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      this.updateBar(prog, stage);
      return;
    }

    // --- sky: dawn warms into golden hour as the homestead is restored ---
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.72);
    sky.addColorStop(0, mix('#20284a', '#3a4a72', prog));
    sky.addColorStop(0.5, mix('#5a4a68', '#c98a5a', prog));
    sky.addColorStop(1, mix('#7a5548', '#f0b070', prog));
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.72);

    // sun rises with progress
    const sunX = W * 0.72;
    const sunY = H * (0.5 - prog * 0.24);
    const glow = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, 70);
    glow.addColorStop(0, 'rgba(255,236,180,0.95)');
    glow.addColorStop(0.5, 'rgba(255,190,110,0.35)');
    glow.addColorStop(1, 'rgba(255,190,110,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,240,200,0.95)';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 20, 0, Math.PI * 2);
    ctx.fill();

    // distant headland
    ctx.fillStyle = mix('#26314e', '#4a5a5a', prog);
    ctx.beginPath();
    ctx.moveTo(0, H * 0.5);
    ctx.quadraticCurveTo(W * 0.3, H * 0.42, W * 0.6, H * 0.5);
    ctx.lineTo(W, H * 0.52);
    ctx.lineTo(W, H * 0.62);
    ctx.lineTo(0, H * 0.62);
    ctx.closePath();
    ctx.fill();

    // --- ground the homestead sits on ---
    const groundY = H * 0.62;
    const grass = stage >= 3;
    ctx.fillStyle = grass ? '#3a5a34' : '#4a4030';
    ctx.fillRect(0, groundY, W, H * 0.2);
    if (grass) {
      ctx.fillStyle = '#2f4d2a';
      ctx.fillRect(0, groundY, W, 4);
    }

    this.drawHomestead(ctx, W * 0.4, groundY, stage, t);

    // --- sea foreground with shimmer ---
    const seaTop = H * 0.82;
    const sea = ctx.createLinearGradient(0, seaTop, 0, H);
    sea.addColorStop(0, '#1c3b4a');
    sea.addColorStop(1, '#0a1a28');
    ctx.fillStyle = sea;
    ctx.fillRect(0, seaTop, W, H - seaTop);
    ctx.strokeStyle = 'rgba(255,220,150,0.18)';
    ctx.lineWidth = 1;
    for (let y = seaTop + 6; y < H; y += 10) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      const ph = this.reduce ? 0 : t / 600;
      for (let x = 0; x <= W; x += 22) ctx.lineTo(x, y + Math.sin(x / 26 + ph + y) * 1.5);
      ctx.stroke();
    }

    this.updateBar(prog, stage);
  }

  private sprite(id: string): HTMLImageElement | null {
    let img = this.sprites.get(id) ?? null;
    if (!img) {
      const url = artUrl(id);
      if (!url) return null;
      img = new Image();
      img.src = url;
      this.sprites.set(id, img);
    }
    return img.complete && img.naturalWidth > 0 ? img : null;
  }

  /**
   * Emberhollow as a composed scene: every delivered order returns another
   * building; nature and lamplight fill in as the village heals. Sky keeps
   * real time; the sea keeps its own counsel at the shore.
   */
  private drawTown(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, prog: number, stage: number): void {
    const delivered = this.game.snapshot.orderIndex;

    // pop-in bookkeeping for buildings that just appeared
    if (this.lastOrderIndex >= 0 && delivered > this.lastOrderIndex) {
      for (const b of TOWN_BUILDINGS) {
        if (b.unlockAt > this.lastOrderIndex && b.unlockAt <= delivered) this.appeared.set(b.art, performance.now());
      }
    }
    this.lastOrderIndex = delivered;

    // --- sky by real time of day ---
    const hour = new Date().getHours();
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.45);
    if (hour >= 5 && hour < 11) {
      sky.addColorStop(0, '#3a4a72');
      sky.addColorStop(1, mix('#c98a5a', '#f0c890', prog));
    } else if (hour >= 11 && hour < 17) {
      sky.addColorStop(0, '#3f5a86');
      sky.addColorStop(1, '#a8c0d8');
    } else if (hour >= 17 && hour < 21) {
      sky.addColorStop(0, '#2c3560');
      sky.addColorStop(1, mix('#a86242', '#f0a05a', prog));
    } else {
      sky.addColorStop(0, '#0c1230');
      sky.addColorStop(1, '#233058');
    }
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H * 0.45);
    // sun or moon
    const night = hour >= 21 || hour < 5;
    ctx.fillStyle = night ? 'rgba(230,235,250,0.9)' : 'rgba(255,240,200,0.95)';
    ctx.beginPath();
    ctx.arc(W * 0.78, H * 0.14, night ? 11 : 14, 0, Math.PI * 2);
    ctx.fill();
    if (!night) {
      const glow = ctx.createRadialGradient(W * 0.78, H * 0.14, 5, W * 0.78, H * 0.14, 52);
      glow.addColorStop(0, 'rgba(255,220,150,0.5)');
      glow.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H * 0.4);
    }

    // --- sea, then the island ground ---
    ctx.fillStyle = night ? '#0a1626' : '#1c3b4a';
    ctx.fillRect(0, H * 0.42, W, H * 0.58);
    const grass = mix('#5a5038', '#3f6238', Math.min(1, stage / 3)); // storm-mud heals to green
    ctx.fillStyle = grass;
    ctx.beginPath();
    ctx.moveTo(-W * 0.05, H * 0.46);
    ctx.quadraticCurveTo(W * 0.2, H * 0.36, W * 0.5, H * 0.37);
    ctx.quadraticCurveTo(W * 0.82, H * 0.36, W * 1.02, H * 0.5);
    ctx.lineTo(W * 1.05, H * 0.82);
    ctx.quadraticCurveTo(W * 0.7, H * 0.94, W * 0.4, H * 0.9);
    ctx.quadraticCurveTo(W * 0.08, H * 0.88, -W * 0.05, H * 0.78);
    ctx.closePath();
    ctx.fill();
    // shoreline highlight
    ctx.strokeStyle = 'rgba(230, 214, 170, 0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();
    // dirt paths once rebuilding begins
    if (stage >= 1) {
      ctx.strokeStyle = 'rgba(150, 120, 80, 0.5)';
      ctx.lineWidth = Math.max(4, W * 0.016);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(W * 0.27, H * 0.5);
      ctx.quadraticCurveTo(W * 0.5, H * 0.56, W * 0.64, H * 0.47);
      ctx.moveTo(W * 0.5, H * 0.52);
      ctx.quadraticCurveTo(W * 0.52, H * 0.66, W * 0.6, H * 0.72);
      ctx.stroke();
    }

    // --- pieces, painter-sorted ---
    const pieces = [
      ...TOWN_NATURE.filter((n) => stage >= n.stage),
      ...TOWN_BUILDINGS.filter((b) => delivered >= b.unlockAt),
    ].sort((a, b) => a.y - b.y);
    for (const p of pieces) {
      const img = this.sprite(p.art);
      if (!img) continue;
      const w = p.w * W;
      const h = w * (img.naturalHeight / img.naturalWidth);
      let scale = 1;
      let alpha = 1;
      const born = this.appeared.get(p.art);
      if (born !== undefined && !this.reduce) {
        const age = (performance.now() - born) / 900;
        if (age < 1) {
          scale = 0.6 + 0.4 * Math.min(1, age * 1.4);
          alpha = Math.min(1, age * 2);
        } else this.appeared.delete(p.art);
      }
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, p.x * W - (w * scale) / 2, p.y * H - h * scale, w * scale, h * scale);
      ctx.globalAlpha = 1;
      // cosy chimney smoke once the village is warm again
      if (p.smoke && stage >= 3 && !this.reduce) {
        const sx = p.x * W + p.smoke.dx * w;
        const sy = p.y * H - h + p.smoke.dy * h * 0.2;
        for (let i = 0; i < 3; i++) {
          const puffY = sy - i * 7 - ((t / 260 + i * 3) % 8);
          ctx.fillStyle = `rgba(232, 225, 210, ${0.22 - i * 0.06})`;
          ctx.beginPath();
          ctx.arc(sx + Math.sin(t / 700 + i) * 2.5, puffY, 2.5 + i * 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // --- the lighthouse keeps its watch on the point ---
    const lx = W * 0.945;
    const lTop = H * 0.28;
    const lit = delivered >= 9; // the beacon story beat
    ctx.fillStyle = '#ded6c2';
    ctx.fillRect(lx - 6, lTop, 12, H * 0.2);
    ctx.fillStyle = '#a8452f';
    ctx.fillRect(lx - 6, lTop + H * 0.06, 12, H * 0.035);
    ctx.fillStyle = lit ? '#ffe6a8' : '#39415a';
    ctx.fillRect(lx - 8, lTop - 9, 16, 9);
    if (lit) {
      const ang = this.reduce ? -0.2 : Math.sin(t / 1500) * 0.55;
      const beam = ctx.createLinearGradient(lx, lTop - 4, lx - 150 * Math.cos(ang), lTop - 4 - 80 * Math.sin(ang));
      beam.addColorStop(0, 'rgba(255,230,160,0.45)');
      beam.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(lx, lTop - 4);
      ctx.lineTo(lx - 160 * Math.cos(ang - 0.12), lTop - 4 - 100 * Math.sin(ang - 0.12));
      ctx.lineTo(lx - 160 * Math.cos(ang + 0.12), lTop - 4 - 100 * Math.sin(ang + 0.12));
      ctx.closePath();
      ctx.fill();
    }

    // --- sea shimmer at the shore ---
    if (!this.reduce) {
      ctx.strokeStyle = night ? 'rgba(180, 200, 255, 0.12)' : 'rgba(255,220,150,0.16)';
      ctx.lineWidth = 1;
      for (let y = H * 0.9; y < H; y += 8) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= W; x += 22) ctx.lineTo(x, y + Math.sin(x / 26 + t / 600 + y) * 1.4);
        ctx.stroke();
      }
    }

    // --- your day, reflected (living-world flourishes) ---
    const counts = this.game.snapshot.actions.counts;
    const sleptWell = (this.game.snapshot.healthLedger?.sleepGranted ?? 0) > 0;
    if (sleptWell && !this.reduce) {
      const pulse = 0.06 + 0.03 * Math.sin(t / 1600);
      const glow = ctx.createRadialGradient(W * 0.5, H * 0.5, 10, W * 0.5, H * 0.5, W * 0.55);
      glow.addColorStop(0, `rgba(255, 200, 120, ${pulse.toFixed(3)})`);
      glow.addColorStop(1, 'rgba(255, 200, 120, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
    }
    if ((counts['nature-photo'] ?? 0) > 0) {
      const flowers = ['#e6739a', '#ffd27a', '#a06be0', '#7fbf6a', '#e6739a'];
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = flowers[i]!;
        ctx.beginPath();
        ctx.arc(W * (0.3 + i * 0.09), H * 0.86, 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawHomestead(ctx: CanvasRenderingContext2D, cx: number, groundY: number, stage: number, t: number): void {
    const built = stage >= 2;
    const w = 96;
    const h = 60;
    const left = cx - w / 2;
    const top = groundY - h;

    // debris / rubble at the earliest stages
    if (stage <= 1) {
      ctx.fillStyle = '#5a4a38';
      for (let i = 0; i < 7; i++) {
        const rx = left + 6 + i * 13 + (i % 2) * 4;
        ctx.fillRect(rx, groundY - 6 - (i % 3) * 2, 10, 5);
      }
    }

    // stage 0: bare storm-struck frame
    if (stage === 0) {
      ctx.strokeStyle = '#6b5a42';
      ctx.lineWidth = 3;
      ctx.strokeRect(left + 10, top + 18, w - 20, h - 18);
      ctx.beginPath();
      ctx.moveTo(left + 6, top + 18);
      ctx.lineTo(cx, top - 4);
      ctx.lineTo(left + w - 6, top + 18);
      ctx.stroke();
      return;
    }

    // stage 1: partial walls + scaffolding
    if (stage === 1) {
      ctx.fillStyle = '#7a5a3a';
      ctx.fillRect(left + 10, top + 26, w - 20, h - 26);
      ctx.strokeStyle = 'rgba(210,180,140,0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(left + 6, top + 6, w - 12, h - 6);
      ctx.beginPath();
      ctx.moveTo(left + 2, top + 20);
      ctx.lineTo(cx, top - 6);
      ctx.lineTo(left + w - 2, top + 20);
      ctx.stroke();
      return;
    }

    // stage 2+: a real cottage
    if (built) {
      // walls
      ctx.fillStyle = stage >= 3 ? '#d6b483' : '#c39a68';
      ctx.fillRect(left, top, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(left, top + h - 8, w, 8);
      // roof
      ctx.fillStyle = stage >= 4 ? '#3d5a6b' : '#7a4a34';
      ctx.beginPath();
      ctx.moveTo(left - 8, top);
      ctx.lineTo(cx, top - 26);
      ctx.lineTo(left + w + 8, top);
      ctx.closePath();
      ctx.fill();
      // chimney with smoke at cosy stages
      ctx.fillStyle = '#5a4030';
      ctx.fillRect(left + w - 22, top - 20, 10, 16);
      if (stage >= 3 && !this.reduce) {
        for (let i = 0; i < 3; i++) {
          const sy = top - 22 - i * 9 - ((t / 200) % 9);
          ctx.fillStyle = `rgba(230,220,205,${0.28 - i * 0.07})`;
          ctx.beginPath();
          ctx.arc(left + w - 17 + Math.sin(t / 500 + i) * 3, sy, 4 + i, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // door
      ctx.fillStyle = '#5a3a22';
      ctx.fillRect(cx - 9, top + h - 24, 18, 24);
      // windows, lit and gently flickering
      const win = (wx: number) => {
        const flick = this.reduce ? 1 : 0.75 + 0.25 * Math.sin(t / 400 + wx);
        ctx.fillStyle = `rgba(255,214,140,${(0.55 + 0.4 * flick).toFixed(3)})`;
        ctx.fillRect(wx, top + 14, 16, 14);
        ctx.strokeStyle = '#5a3a22';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(wx, top + 14, 16, 14);
      };
      win(left + 12);
      win(left + w - 28);

      // garden + path at flourishing stages
      if (stage >= 3) {
        ctx.fillStyle = '#c9b48a';
        ctx.fillRect(cx - 7, top + h, 14, groundY - (top + h) + 2);
        for (let i = 0; i < 5; i++) {
          const fx = left - 10 + i * (w + 20) / 4;
          ctx.fillStyle = ['#e6739a', '#ffd27a', '#e6739a', '#a06be0', '#ffd27a'][i] ?? '#ffd27a';
          ctx.beginPath();
          ctx.arc(fx, groundY - 4, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#3a5a2a';
          ctx.beginPath();
          ctx.moveTo(fx, groundY - 1);
          ctx.lineTo(fx, groundY - 7);
          ctx.stroke();
        }
      }
    }

    // stage 4: the beacon
    if (stage >= 4) {
      const lx = left + w + 26;
      const ly = groundY - 70;
      ctx.fillStyle = '#e9e2d0';
      ctx.fillRect(lx - 6, ly, 12, 70);
      ctx.fillStyle = '#b04a3a';
      ctx.fillRect(lx - 6, ly + 22, 12, 8);
      // lantern glow + sweeping beam
      ctx.fillStyle = '#ffe6a8';
      ctx.fillRect(lx - 8, ly - 10, 16, 10);
      const ang = this.reduce ? -0.2 : Math.sin(t / 1400) * 0.5;
      const beam = ctx.createLinearGradient(lx, ly - 5, lx - 130 * Math.cos(ang), ly - 5 - 70 * Math.sin(ang));
      beam.addColorStop(0, 'rgba(255,230,160,0.55)');
      beam.addColorStop(1, 'rgba(255,230,160,0)');
      ctx.fillStyle = beam;
      ctx.beginPath();
      ctx.moveTo(lx, ly - 5);
      ctx.lineTo(lx - 140 * Math.cos(ang - 0.13), ly - 5 - 100 * Math.sin(ang - 0.13));
      ctx.lineTo(lx - 140 * Math.cos(ang + 0.13), ly - 5 - 100 * Math.sin(ang + 0.13));
      ctx.closePath();
      ctx.fill();
    }
  }

  private updateBar(prog: number, stage: number): void {
    const fill = document.getElementById('map-bar-fill');
    if (fill) fill.style.width = `${Math.round(prog * 100)}%`;
    const label = document.getElementById('map-progress');
    if (label) label.textContent = `${STAGE_NAMES[stage]} · ${Math.round(prog * 100)}% restored`;
  }

  private renderList(): void {
    const host = document.getElementById('map-body');
    if (!host) return;
    const delivered = this.game.snapshot.orderIndex;
    const order = ORDERS[delivered];
    const challenge = order
      ? `<div class="map-challenge"><span class="mc-ico">📜</span>` +
        `<div class="mc-body"><b>${order.who} needs a hand</b><span>${order.text}</span></div></div>`
      : `<div class="map-challenge"><span class="mc-ico">✨</span>` +
        `<div class="mc-body"><b>Chapter complete</b><span>Emberhollow shines. New challenges await in the next chapter.</span></div></div>`;
    const ch = chapterFor(Math.min(delivered, ORDERS.length - 1));
    const inChapter = Math.min(delivered, ch.end) - ch.start;
    const s = this.game.snapshot;
    const quests = questsForDay(s.stats.day)
      .map((q) => {
        const done = s.questsClaimed.includes(q.id) || q.progress(s) >= q.target;
        const p = Math.min(q.progress(s), q.target);
        return (
          `<div class="dq ${done ? 'done' : ''}"><span class="dq-check">${done ? '✓' : ''}</span>` +
          `<span class="dq-label">${q.label}</span><span class="dq-progress">${done ? `+${q.coins}` : `${p}/${q.target}`}</span></div>`
        );
      })
      .join('');
    host.innerHTML =
      challenge +
      `<p class="map-locs-label">Today in Emberhollow</p><div class="dq-list">${quests}</div>` +
      `<p class="map-locs-label">Chapter ${ch.id} · ${ch.title} · ${inChapter}/${ch.end - ch.start} orders · village ${Math.round(
        (delivered / ORDERS.length) * 100,
      )}% restored</p>` +
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

// ---- colour helpers ----
function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function mix(a: string, b: string, tt: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const t = Math.max(0, Math.min(1, tt));
  const c = ca.map((v, i) => Math.round(v + (cb[i]! - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
