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
import { BUILDING_INFO, DECOR_CATALOG, TOWN_BOATS, TOWN_BUILDINGS, TOWN_NATURE, TOWN_WALKERS } from '../data/town-layout';
import { computeMood, meditatedToday, moodCaption } from '../core/world-mood';
import type { WeatherNow, WorldMood } from '../core/world-mood';
import { currentWeather } from './weather';
import { artUrl } from './art';
import { toast } from './toast';
import { tomorrowLine } from './tease';

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
  /** Last-drawn building rectangles for tap-to-inspect. */
  private hitboxes: { x0: number; y0: number; x1: number; y1: number; art: string; unlockAt: number }[] = [];
  /** Real weather outside the window (best-effort; null renders clear). */
  private weather: WeatherNow | null = null;
  private weatherAskedAt = 0;
  /** Decorate mode: pick a piece from the tray, tap the town to place it. */
  private decorMode = false;
  private decorPick: string | null = null;
  private decorHit: { x0: number; y0: number; x1: number; y1: number; id: number }[] = [];

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
        ev.type === 'action' || ev.type === 'questDone' || ev.type === 'chronicle' ||
        ev.type === 'upgrade' || ev.type === 'decor' || ev.type === 'state';
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

  /** How the world feels right now: real weather + the player's day. */
  private mood(): WorldMood {
    const s = this.game.snapshot;
    return computeMood({
      weather: this.weather,
      meditatedToday: meditatedToday(s.actions.counts),
      lastCalmDay: s.wellbeing.lastCalmDay,
      today: s.actions.day,
      sleptWell: (s.healthLedger?.sleepGranted ?? 0) > 0,
    });
  }

  private refreshWeather(): void {
    if (Date.now() - this.weatherAskedAt < 30 * 60 * 1000) return;
    this.weatherAskedAt = Date.now();
    void currentWeather().then((w) => {
      if (!w) return;
      this.weather = w;
      if (this.visible && this.reduce) this.draw(0);
    });
  }

  setVisible(v: boolean): void {
    this.visible = v;
    if (v) {
      this.mount();
      this.refreshWeather();
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
    // Tap a returned building to hear how it came back — or, in decorate
    // mode, tap the town to place a piece / tap a piece to pick it back up.
    this.canvas?.addEventListener('click', (e) => {
      const rect = this.canvas!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (this.decorMode) {
        const W = this.canvas!.clientWidth || 360;
        for (let i = this.decorHit.length - 1; i >= 0; i--) {
          const hb = this.decorHit[i]!;
          if (x >= hb.x0 && x <= hb.x1 && y >= hb.y0 && y <= hb.y1) {
            this.game.removeDecor(hb.id);
            toast('Picked back up — coins returned.');
            if (this.reduce) this.draw(0);
            return;
          }
        }
        if (this.decorPick) {
          const placed = this.game.placeDecor(this.decorPick, x / W, y / 240);
          if (!placed) {
            const def = DECOR_CATALOG.find((d) => d.art === this.decorPick);
            const broke = def && this.game.snapshot.coins < def.cost;
            toast(broke ? 'Not enough coins yet — orders and quests pay well.' : 'That spot is out over the water — try the island.');
          } else if (this.reduce) this.draw(0);
        }
        return;
      }
      for (let i = this.hitboxes.length - 1; i >= 0; i--) {
        const hb = this.hitboxes[i]!;
        if (x >= hb.x0 && x <= hb.x1 && y >= hb.y0 && y <= hb.y1) {
          this.showBuilding(hb.art, hb.unlockAt);
          return;
        }
      }
    });
    this.mountDecorTray();
    document.getElementById('bldg-close')?.addEventListener('click', () => {
      const m = document.getElementById('bldg-modal');
      if (m) m.hidden = true;
    });
    window.addEventListener('resize', () => {
      if (this.visible) {
        this.resize();
        if (this.reduce) this.draw(0);
      }
    });
  }

  /** The decorate tray: pick a piece, tap the town. Coins buy beauty, never power. */
  private mountDecorTray(): void {
    const btn = document.getElementById('decor-btn');
    const tray = document.getElementById('decor-tray');
    if (!btn || !tray) return;
    const renderTray = () => {
      const coins = this.game.snapshot.coins;
      tray.innerHTML =
        `<p class="decor-hint">${this.decorPick ? 'Tap the town to place it — tap a placed piece to pick it up.' : 'Choose a piece. Picking one back up refunds it in full.'}</p>` +
        DECOR_CATALOG.map((d) => {
          const url = artUrl(d.art);
          const afford = coins >= d.cost;
          return (
            `<button class="decor-item ${this.decorPick === d.art ? 'picked' : ''} ${afford ? '' : 'broke'}" data-art="${d.art}">` +
            (url ? `<span class="decor-ico" style="background-image:url(${url})"></span>` : '') +
            `<span class="decor-name">${d.name}</span><span class="decor-cost">🪙 ${d.cost}</span></button>`
          );
        }).join('');
      tray.querySelectorAll<HTMLButtonElement>('.decor-item').forEach((b) => {
        b.addEventListener('click', () => {
          this.decorPick = this.decorPick === b.dataset.art ? null : (b.dataset.art ?? null);
          renderTray();
        });
      });
    };
    btn.addEventListener('click', () => {
      this.decorMode = !this.decorMode;
      this.decorPick = null;
      btn.classList.toggle('on', this.decorMode);
      btn.textContent = this.decorMode ? '✓ Done' : '🪴 Decorate';
      tray.hidden = !this.decorMode;
      if (this.decorMode) renderTray();
      if (this.reduce) this.draw(0);
    });
    this.game.subscribe((ev) => {
      if (ev.type === 'decor' && this.decorMode) renderTray();
    });
  }

  /** Building card. Negative unlockAt marks a ghost — still lost to the storm. */
  private showBuilding(art: string, unlockAt: number): void {
    const locked = unlockAt < 0;
    const at = Math.abs(unlockAt);
    const img = document.getElementById('bldg-art') as HTMLImageElement | null;
    const url = artUrl(art);
    if (img && url) {
      img.src = url;
      img.style.filter = locked ? 'grayscale(0.85) brightness(0.7)' : '';
    }
    const name = document.getElementById('bldg-name');
    if (name) name.textContent = BUILDING_INFO[art] ?? 'Emberhollow';
    const order = ORDERS[at - 1];
    const story = document.getElementById('bldg-story');
    if (story) {
      story.textContent = locked
        ? `Still lost to the storm. ${order ? `${order.who} remembers it well — keep tending the orders and it comes back.` : 'Keep tending the orders and it comes back.'}`
        : order
          ? order.resolution
          : 'It has always stood here, waiting.';
    }
    const meta = document.getElementById('bldg-meta');
    if (meta) meta.textContent = locked ? `Returns with order ${at} · ${chapterFor(at - 1).title}` : `Returned with order ${at} · ${chapterFor(at - 1).title}`;

    // Upgrade affordance — only for buildings that have actually returned.
    const tierEl = document.getElementById('bldg-tier');
    const upBtn = document.getElementById('bldg-upgrade') as HTMLButtonElement | null;
    const tierNames = ['Restored', 'Cared-for', 'Beloved'];
    if (tierEl && upBtn) {
      if (locked) {
        tierEl.hidden = true;
        upBtn.hidden = true;
      } else {
        const tier = this.game.upgradeTier(art);
        tierEl.hidden = false;
        tierEl.textContent = `${tierNames[tier] ?? 'Beloved'} · ${'★'.repeat(tier + 1)}${'☆'.repeat(Math.max(0, 2 - tier))}`;
        const cost = this.game.upgradeCost(art);
        if (cost === null) {
          upBtn.hidden = false;
          upBtn.disabled = true;
          upBtn.textContent = 'Cannot be more beloved';
        } else {
          upBtn.hidden = false;
          upBtn.disabled = !this.game.canUpgrade(art);
          upBtn.textContent = `Care for it · 🪙 ${cost}`;
          upBtn.onclick = () => {
            if (this.game.upgradeBuilding(art)) {
              toast(`${BUILDING_INFO[art] ?? 'The building'} looks lovelier than ever.`);
              this.showBuilding(art, unlockAt); // refresh the card in place
              if (this.reduce) this.draw(0);
            }
          };
        }
      }
    }
    const m = document.getElementById('bldg-modal');
    if (m) m.hidden = false;
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
      const mood = this.mood();
      this.drawTown(ctx, W, H, t, prog, stage, mood);
      this.updateBar(prog, stage, mood);
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
  private drawTown(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, prog: number, stage: number, mood: WorldMood): void {
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
      glow.addColorStop(0, `rgba(255,220,150,${(0.5 * (1 - mood.cloudCover * 0.7)).toFixed(3)})`);
      glow.addColorStop(1, 'rgba(255,220,150,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H * 0.4);
    }
    // Real clouds drift in on the real wind.
    const nClouds = Math.round(mood.cloudCover * 5);
    if (nClouds > 0) {
      ctx.fillStyle = night ? 'rgba(150,160,190,0.28)' : 'rgba(235,238,245,0.5)';
      for (let i = 0; i < nClouds; i++) {
        const drift = this.reduce ? 0.5 : (t / (60000 / (0.4 + mood.wind * 1.6))) % 1.25;
        const cxp = (((i * 0.23 + drift) % 1.25) - 0.125) * W;
        const cyp = H * (0.05 + (i % 3) * 0.045);
        const cw = W * (0.09 + (i % 2) * 0.04);
        ctx.beginPath();
        ctx.ellipse(cxp, cyp, cw, cw * 0.32, 0, 0, Math.PI * 2);
        ctx.ellipse(cxp + cw * 0.55, cyp + cw * 0.08, cw * 0.6, cw * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Heavy weather leans on the whole scene, gently.
    if (mood.weather === 'overcast' || mood.precip > 0) {
      ctx.fillStyle = `rgba(60, 70, 95, ${(mood.weather === 'storm' ? 0.22 : 0.12).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
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

    // --- boats first (they sit on the water behind the shore) ---
    for (const b of TOWN_BOATS) {
      if (stage < b.stage) continue;
      const img = this.sprite(b.art);
      if (!img) continue;
      const w = b.w * W;
      const h = w * (img.naturalHeight / img.naturalWidth);
      const bob = this.reduce ? 0 : Math.sin(t / (900 - mood.sea * 350) + b.x * 20) * (1.2 + mood.sea * 3.6);
      const tilt = this.reduce ? 0 : Math.sin(t / 1100 + b.x * 31) * mood.sea * 0.06;
      ctx.save();
      ctx.translate(b.x * W, b.y * H + bob);
      ctx.rotate(tilt);
      ctx.drawImage(img, -w / 2, -h, w, h);
      ctx.restore();
    }

    // --- ghosts of what the storm took: the next few buildings show as
    // faint ruins, so a young island already carries its promise ---
    const ghosts = TOWN_BUILDINGS.filter((b) => b.unlockAt > delivered).slice(0, 3);
    this.hitboxes = [];
    this.decorHit = [];
    for (const g of ghosts) {
      const img = this.sprite(g.art);
      if (!img) continue;
      const w = g.w * W;
      const h = w * (img.naturalHeight / img.naturalWidth);
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.filter = 'grayscale(0.85) brightness(0.55)';
      ctx.drawImage(img, g.x * W - w / 2, g.y * H - h, w, h);
      ctx.restore();
      if (BUILDING_INFO[g.art]) {
        this.hitboxes.push({ x0: g.x * W - w / 2, y0: g.y * H - h, x1: g.x * W + w / 2, y1: g.y * H, art: g.art, unlockAt: -g.unlockAt });
      }
    }
    interface ScenePiece {
      art: string;
      x: number;
      y: number;
      w: number;
      unlockAt: number;
      smoke?: { dx: number; dy: number };
      decorId?: number;
    }
    const decor: ScenePiece[] = this.game.snapshot.decor.map((d) => ({
      art: d.art,
      x: d.x,
      y: d.y,
      w: DECOR_CATALOG.find((c) => c.art === d.art)?.w ?? 0.05,
      unlockAt: 0,
      decorId: d.id,
    }));
    const pieces: ScenePiece[] = [
      ...TOWN_NATURE.filter((n) => stage >= n.stage && delivered >= n.unlockAt),
      ...TOWN_BUILDINGS.filter((b) => delivered >= b.unlockAt),
      ...decor,
    ].sort((a, b) => a.y - b.y);
    for (const p of pieces) {
      const img = this.sprite(p.art);
      if (!img) continue;
      const w = p.w * W;
      const h = w * (img.naturalHeight / img.naturalWidth);
      if (p.decorId !== undefined) {
        this.decorHit.push({ x0: p.x * W - w / 2, y0: p.y * H - h, x1: p.x * W + w / 2, y1: p.y * H, id: p.decorId });
        if (this.decorMode) {
          ctx.strokeStyle = 'rgba(240, 200, 120, 0.6)';
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(p.x * W - w / 2 - 2, p.y * H - h - 2, w + 4, h + 4);
          ctx.setLineDash([]);
        }
      }
      if (BUILDING_INFO[p.art] && 'unlockAt' in p && p.unlockAt > 0) {
        this.hitboxes.push({ x0: p.x * W - w / 2, y0: p.y * H - h, x1: p.x * W + w / 2, y1: p.y * H, art: p.art, unlockAt: p.unlockAt });
      }
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
      // upgrade tiers dress a cared-for building: bunting, then lanterns + glow
      if (p.unlockAt > 0 && BUILDING_INFO[p.art]) {
        this.drawUpgradeFlourish(ctx, this.game.upgradeTier(p.art), p.x * W, p.y * H, w * scale, h * scale, t);
      }
      // cosy chimney smoke once the village is warm again
      if (p.smoke && stage >= 3 && !this.reduce) {
        const sx = p.x * W + p.smoke.dx * w;
        const sy = p.y * H - h + p.smoke.dy * h * 0.2;
        for (let i = 0; i < 3; i++) {
          const puffY = sy - i * 7 - ((t / 260 + i * 3) % 8);
          ctx.fillStyle = `rgba(232, 225, 210, ${0.22 - i * 0.06})`;
          ctx.beginPath();
          // the real wind carries the smoke sideways
          ctx.arc(sx + Math.sin(t / 700 + i) * 2.5 - mood.wind * 9 * (i + 1) * 0.4, puffY, 2.5 + i * 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // --- villagers amble their rounds once their stories are told ---
    for (const wk of TOWN_WALKERS) {
      if (delivered < wk.unlockAt) continue;
      const img = this.sprite(wk.art);
      if (!img || wk.path.length < 2) continue;
      // ping-pong along the waypoint list, phase-offset by art id hash
      const total = wk.path.length - 1;
      const phase = this.reduce ? 0.5 : ((t / 1000 + wk.art.length * 3.7) / wk.period) % 2;
      const u = phase < 1 ? phase : 2 - phase; // 0..1..0
      const seg = Math.min(total - 1, Math.floor(u * total));
      const local = u * total - seg;
      const a = wk.path[seg]!;
      const b = wk.path[seg + 1]!;
      const x = (a.x + (b.x - a.x) * local) * W;
      const y = (a.y + (b.y - a.y) * local) * H;
      const w = 0.034 * W;
      const h = w * (img.naturalHeight / img.naturalWidth);
      const facingLeft = b.x < a.x !== phase >= 1;
      ctx.save();
      if (facingLeft) {
        ctx.translate(x, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(img, -w / 2, y - h, w, h);
      } else {
        ctx.drawImage(img, x - w / 2, y - h, w, h);
      }
      ctx.restore();
    }

    // --- small lives: the cat claims the bench, gulls work the docks ---
    if (stage >= 3) {
      const cat = this.sprite('animal_cat');
      if (cat) {
        const w = 0.032 * W;
        ctx.drawImage(cat, W * 0.545, H * 0.665 - w * (cat.naturalHeight / cat.naturalWidth), w, w * (cat.naturalHeight / cat.naturalWidth));
      }
      const gull = this.sprite('animal_gull');
      if (gull && !this.reduce) {
        const gustiness = 1 + mood.wind * 1.4;
        for (let g = 0; g < 2; g++) {
          const gx = W * (0.74 + 0.14 * Math.sin((t * gustiness) / 2600 + g * 2.4));
          const gy = H * (0.18 + 0.05 * Math.cos((t * gustiness) / 2100 + g * 1.7));
          const gw = 0.028 * W;
          ctx.globalAlpha = 0.9;
          ctx.drawImage(gull, gx, gy, gw, gw * (gull.naturalHeight / gull.naturalWidth));
          ctx.globalAlpha = 1;
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

    // --- sea shimmer at the shore: the water carries the day's mood ---
    if (!this.reduce) {
      const amp = 1.0 + mood.sea * 3.4;
      const pace = 620 - mood.sea * 320;
      ctx.strokeStyle = night ? 'rgba(180, 200, 255, 0.12)' : 'rgba(255,220,150,0.16)';
      ctx.lineWidth = 1;
      for (let y = H * 0.9; y < H; y += 8) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= W; x += 22) ctx.lineTo(x, y + Math.sin(x / 26 + t / pace + y) * amp);
        ctx.stroke();
      }
      // whitecaps once the water is truly restless
      if (mood.sea > 0.55) {
        ctx.strokeStyle = 'rgba(235, 240, 248, 0.4)';
        ctx.lineWidth = 1.4;
        for (let i = 0; i < 7; i++) {
          const wx = ((i * 137 + Math.floor(t / 1400) * 41) % 100) / 100 * W;
          const wy = H * (0.9 + ((i * 53) % 10) / 110);
          ctx.beginPath();
          ctx.moveTo(wx, wy);
          ctx.lineTo(wx + 7 + mood.sea * 6, wy);
          ctx.stroke();
        }
      }
      // a quiet mind stills the water: a soft moon-path glint on calm days
      if (mood.calm && mood.sea < 0.3) {
        const glint = ctx.createLinearGradient(0, H * 0.9, 0, H);
        glint.addColorStop(0, 'rgba(255, 236, 190, 0.10)');
        glint.addColorStop(1, 'rgba(255, 236, 190, 0)');
        ctx.fillStyle = glint;
        ctx.fillRect(W * 0.6, H * 0.88, W * 0.4, H * 0.12);
      }
    }

    // --- weather falls over everything ---
    if (mood.weather === 'fog') {
      const fog = ctx.createLinearGradient(0, H * 0.3, 0, H * 0.62);
      fog.addColorStop(0, 'rgba(205, 214, 228, 0)');
      fog.addColorStop(0.5, 'rgba(205, 214, 228, 0.30)');
      fog.addColorStop(1, 'rgba(205, 214, 228, 0)');
      ctx.fillStyle = fog;
      ctx.fillRect(0, H * 0.28, W, H * 0.36);
    }
    if (mood.precip > 0 && !this.reduce) {
      const snow = mood.weather === 'snow';
      const n = Math.round(24 + mood.precip * (snow ? 30 : 60));
      if (snow) {
        ctx.fillStyle = 'rgba(240, 244, 252, 0.8)';
        for (let i = 0; i < n; i++) {
          const px = ((i * 97 + t * 0.012 * (1 + mood.wind)) % W + W) % W;
          const py = ((i * 61 + t * (0.02 + mood.precip * 0.015)) % H + H) % H;
          ctx.beginPath();
          ctx.arc(px + Math.sin(t / 900 + i) * 4, py, 1.3 + (i % 3) * 0.4, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = 'rgba(190, 210, 235, 0.4)';
        ctx.lineWidth = 1;
        const slant = mood.wind * 4;
        for (let i = 0; i < n; i++) {
          const px = ((i * 83 + t * 0.05) % W + W) % W;
          const py = ((i * 47 + t * (0.14 + mood.precip * 0.1)) % H + H) % H;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - slant, py + 7 + mood.precip * 4);
          ctx.stroke();
        }
      }
    }

    // --- your day, reflected (living-world flourishes) ---
    const counts = this.game.snapshot.actions.counts;
    if (mood.glow > 0.3 && !this.reduce) {
      const pulse = mood.glow * 0.11 + 0.03 * Math.sin(t / (mood.calm ? 2400 : 1600));
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

  /**
   * A cared-for building wears its tier: L2 hangs bunting across the eaves,
   * L3 adds warm lanterns and a soft golden aura. Procedural — no new art.
   * (cx, baseY) is the sprite's bottom-centre; w/h its drawn size.
   */
  private drawUpgradeFlourish(
    ctx: CanvasRenderingContext2D,
    tier: number,
    cx: number,
    baseY: number,
    w: number,
    h: number,
    t: number,
  ): void {
    if (tier <= 0) return;
    const topY = baseY - h;
    const left = cx - w / 2;
    // L3: a soft golden aura of pride behind the building
    if (tier >= 2) {
      const aura = ctx.createRadialGradient(cx, topY + h * 0.5, w * 0.2, cx, topY + h * 0.5, w * 0.75);
      const pulse = this.reduce ? 0.12 : 0.1 + 0.04 * Math.sin(t / 1400 + cx);
      aura.addColorStop(0, `rgba(255, 216, 140, ${pulse.toFixed(3)})`);
      aura.addColorStop(1, 'rgba(255, 216, 140, 0)');
      ctx.fillStyle = aura;
      ctx.fillRect(left - w * 0.25, topY - h * 0.1, w * 1.5, h * 1.2);
    }
    // Bunting: a gentle swag of triangular flags across the upper facade
    const swagY = topY + h * 0.16;
    const span = w * 0.86;
    const x0 = cx - span / 2;
    const sag = h * 0.08;
    ctx.strokeStyle = 'rgba(90, 62, 34, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, swagY);
    ctx.quadraticCurveTo(cx, swagY + sag, x0 + span, swagY);
    ctx.stroke();
    const flags = 6;
    const colours = ['#e0664f', '#f0c060', '#6ba3c9', '#8fb96a', '#c98fc0', '#e0a060'];
    for (let i = 0; i < flags; i++) {
      const f = (i + 0.5) / flags;
      const fx = x0 + span * f;
      const fy = swagY + Math.sin(Math.PI * f) * sag;
      ctx.fillStyle = colours[i % colours.length]!;
      ctx.beginPath();
      ctx.moveTo(fx - w * 0.03, fy);
      ctx.lineTo(fx + w * 0.03, fy);
      ctx.lineTo(fx, fy + h * 0.09);
      ctx.closePath();
      ctx.fill();
    }
    // L3: two warm lanterns flanking the door, gently flickering
    if (tier >= 2) {
      for (const lx of [left + w * 0.2, left + w * 0.8]) {
        const flick = this.reduce ? 1 : 0.8 + 0.2 * Math.sin(t / 300 + lx);
        const ly = baseY - h * 0.32;
        const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, w * 0.12);
        glow.addColorStop(0, `rgba(255, 214, 130, ${(0.6 * flick).toFixed(3)})`);
        glow.addColorStop(1, 'rgba(255, 214, 130, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(lx, ly, w * 0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd66a';
        ctx.beginPath();
        ctx.arc(lx, ly, Math.max(1.5, w * 0.02), 0, Math.PI * 2);
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

  private updateBar(prog: number, stage: number, mood?: WorldMood): void {
    const fill = document.getElementById('map-bar-fill');
    if (fill) fill.style.width = `${Math.round(prog * 100)}%`;
    const label = document.getElementById('map-progress');
    const scene = mood ? moodCaption(mood) : '';
    if (label) label.textContent = `${STAGE_NAMES[stage]} · ${Math.round(prog * 100)}% restored${scene ? ` · ${scene}` : ''}`;
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
      `<div class="map-tease">🌅 ${tomorrowLine(s)}</div>` +
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
