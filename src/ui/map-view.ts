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
import { BUILDING_INFO, DECOR_CATALOG, TOWN_BOATS, TOWN_BUILDINGS, TOWN_NATURE, TOWN_TERRAIN, TOWN_WALKERS } from '../data/town-layout';
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
          const placed = this.game.placeDecor(this.decorPick, x / W, y / 285);
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
      img.style.filter = locked ? 'sepia(0.4) saturate(0.6) brightness(0.72)' : '';
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
    const h = 285;
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
    const H = 285;
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
    // Clouds always drift the sky — soft, warm wisps, not hard blobs. Each is
    // a cluster of radial puffs so the edges feather into the sky.
    const nClouds = Math.max(2, Math.round(mood.cloudCover * 4));
    {
      const dusk = hour >= 17 && hour < 21;
      const dawn = hour >= 5 && hour < 8;
      const tint = night ? '190,200,225' : dusk ? '255,224,196' : dawn ? '255,232,214' : '250,251,255';
      const peak = (night ? 0.16 : 0.24) + mood.cloudCover * 0.18;
      for (let i = 0; i < nClouds; i++) {
        const drift = this.reduce ? 0.5 : (t / (54000 / (0.5 + mood.wind * 1.4))) % 1.3;
        const cx = (((i * 0.31 + drift) % 1.3) - 0.15) * W;
        const cy = H * (0.06 + (i % 3) * 0.05);
        const cw = W * (0.075 + (i % 2) * 0.03);
        for (const [ox, oy, r] of [[0, 0, 1], [0.7, 0.1, 0.72], [-0.65, 0.12, 0.62], [0.2, -0.14, 0.55]] as const) {
          const px = cx + ox * cw;
          const py = cy + oy * cw;
          const rad = r * cw;
          const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
          g.addColorStop(0, `rgba(${tint},${peak.toFixed(3)})`);
          g.addColorStop(1, `rgba(${tint},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(px, py, rad, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    // Heavy weather leans on the whole scene, gently.
    if (mood.weather === 'overcast' || mood.precip > 0) {
      ctx.fillStyle = `rgba(60, 70, 95, ${(mood.weather === 'storm' ? 0.22 : 0.12).toFixed(2)})`;
      ctx.fillRect(0, 0, W, H);
    }

    // --- sea with an evening sheen, then the rocky island (Batch-2 look) ---
    const seaGrad = ctx.createLinearGradient(0, H * 0.42, 0, H);
    seaGrad.addColorStop(0, night ? '#0c1a2c' : '#1c3b4a');
    seaGrad.addColorStop(1, night ? '#081220' : '#122a3c');
    ctx.fillStyle = seaGrad;
    ctx.fillRect(0, H * 0.42, W, H * 0.58);
    if (!night) {
      // the low sun lays a soft column on the water
      const sunCol = ctx.createLinearGradient(0, H * 0.42, 0, H * 0.95);
      sunCol.addColorStop(0, 'rgba(255, 200, 120, 0.16)');
      sunCol.addColorStop(1, 'rgba(255, 200, 120, 0)');
      ctx.fillStyle = sunCol;
      ctx.fillRect(W * 0.68, H * 0.42, W * 0.2, H * 0.53);
    }
    // the horizon water is alive: rolling swell lines behind the town, their
    // pace + amplitude set by the day's mood (calm after meditation, restless
    // after none). Drawn before the island so it only shows on open water.
    if (!this.reduce) {
      const amp = 1.2 + mood.sea * 3.6;
      const pace = 640 - mood.sea * 340;
      ctx.strokeStyle = night ? 'rgba(150, 180, 235, 0.16)' : 'rgba(210, 232, 245, 0.22)';
      ctx.lineWidth = 1.2;
      for (let y = H * 0.43; y < H * 0.62; y += 7) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= W; x += 20) ctx.lineTo(x, y + Math.sin(x / 24 + t / pace + y * 0.6) * amp);
        ctx.stroke();
      }
      if (mood.sea > 0.5) {
        // whitecaps out on the swell
        ctx.strokeStyle = 'rgba(238, 244, 250, 0.5)';
        ctx.lineWidth = 1.6;
        for (let i = 0; i < 6; i++) {
          const wx = (((i * 151 + Math.floor(t / 900) * 37) % 100) / 100) * W;
          const wy = H * (0.45 + ((i * 61) % 14) / 100);
          ctx.beginPath();
          ctx.moveTo(wx, wy);
          ctx.lineTo(wx + 8 + mood.sea * 8, wy);
          ctx.stroke();
        }
      }
    }
    const island = (inset: number) => {
      ctx.beginPath();
      ctx.moveTo(-W * 0.05 - inset, H * 0.46);
      ctx.quadraticCurveTo(W * 0.2, H * 0.36 - inset, W * 0.5, H * 0.37 - inset);
      ctx.quadraticCurveTo(W * 0.82, H * 0.36 - inset, W * 1.02 + inset, H * 0.5);
      ctx.lineTo(W * 1.05 + inset, H * 0.82);
      ctx.quadraticCurveTo(W * 0.7, H * 0.94 + inset, W * 0.4, H * 0.9 + inset);
      ctx.quadraticCurveTo(W * 0.08, H * 0.88 + inset, -W * 0.05 - inset, H * 0.78);
      ctx.closePath();
    };
    // rocky under-rim first, then the green cap sitting inside it
    island(4);
    ctx.fillStyle = night ? '#38332a' : '#4c4436';
    ctx.fill();
    ctx.strokeStyle = 'rgba(230, 214, 170, 0.25)'; // wet-sand waterline
    ctx.lineWidth = 2;
    ctx.stroke();
    island(-3);
    const grass = mix('#5a5f38', '#3f6238', Math.min(1, stage / 3)); // storm-mud heals to green
    ctx.fillStyle = grass;
    ctx.fill();
    // lay real grass texture over the ground so it reads as turf, not paint;
    // fades in as the island heals from storm-mud to meadow
    const turf = this.sprite('turf_light');
    if (turf) {
      ctx.save();
      island(-3);
      ctx.clip();
      const ts = Math.max(44, W * 0.13);
      ctx.globalAlpha = 0.42 * Math.min(1, stage / 2 + 0.25);
      // Stagger alternate rows by a half-tile and overlap by 1px so the tile
      // edges never line up into visible vertical seams.
      let row = 0;
      for (let yy = H * 0.33; yy < H * 0.98; yy += ts - 1) {
        const off = (row % 2) * (ts / 2);
        for (let xx = -ts + off; xx < W + ts; xx += ts - 1) ctx.drawImage(turf, xx, yy, ts + 1, ts + 1);
        row++;
      }
      ctx.globalAlpha = 1;
      ctx.restore();
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

    // --- the whole town is visible from the first sunrise: what the storm
    // took stands as dark ruins, and each delivered order restores one
    // building to colour and life ---
    this.hitboxes = [];
    this.decorHit = [];
    interface ScenePiece {
      art: string;
      x: number;
      y: number;
      w: number;
      unlockAt: number;
      smoke?: { dx: number; dy: number };
      decorId?: number;
      ruined?: boolean;
    }
    const decor: ScenePiece[] = this.game.snapshot.decor.map((d) => ({
      art: d.art,
      x: d.x,
      y: d.y,
      w: DECOR_CATALOG.find((c) => c.art === d.art)?.w ?? 0.05,
      unlockAt: 0,
      decorId: d.id,
    }));
    // flat ground pieces (paths, meadow patches) lie under everything
    const FLAT = new Set(['terrain_path', 'terrain_grass', 'terrain_flowers1', 'terrain_flowers2']);
    for (const f of TOWN_TERRAIN) {
      if (!FLAT.has(f.art) || delivered < f.unlockAt) continue;
      const img = this.sprite(f.art);
      if (!img) continue;
      const w = f.w * W;
      const h = w * (img.naturalHeight / img.naturalWidth);
      ctx.drawImage(img, f.x * W - w / 2, f.y * H - h, w, h);
    }
    // Only the next ~3 not-yet-restored buildings appear as storm-worn ruins —
    // enough to promise what's coming without cluttering the island with a
    // dozen grey shells.
    const upcoming = TOWN_BUILDINGS.filter((b) => b.unlockAt > delivered)
      .map((b) => b.unlockAt)
      .sort((a, b) => a - b);
    const ghostCutoff = upcoming.length ? upcoming[Math.min(2, upcoming.length - 1)]! : -1;
    const pieces: ScenePiece[] = [
      ...TOWN_TERRAIN.filter((t) => !FLAT.has(t.art) && delivered >= t.unlockAt),
      ...TOWN_NATURE.filter((n) => stage >= n.stage && delivered >= n.unlockAt),
      ...TOWN_BUILDINGS.filter((b) => delivered >= b.unlockAt || b.unlockAt <= ghostCutoff).map((b) => ({
        ...b,
        ruined: delivered < b.unlockAt,
      })),
      ...decor,
    ].sort((a, b) => a.y - b.y);
    for (const p of pieces) {
      // a cared-for building shows its real upgraded sprite (L2/L3)
      let artId = p.art;
      if (!p.ruined && p.unlockAt > 0 && BUILDING_INFO[p.art]) {
        const tier = this.game.upgradeTier(p.art);
        if (tier >= 2 && this.sprite(`${p.art}_l3`)) artId = `${p.art}_l3`;
        else if (tier >= 1 && this.sprite(`${p.art}_l2`)) artId = `${p.art}_l2`;
      }
      const img = this.sprite(artId) ?? this.sprite(p.art);
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
        this.hitboxes.push({
          x0: p.x * W - w / 2, y0: p.y * H - h, x1: p.x * W + w / 2, y1: p.y * H,
          art: p.art,
          unlockAt: p.ruined ? -p.unlockAt : p.unlockAt,
        });
      }
      if (p.ruined) {
        // storm-worn, not a grey ghost: keep the building's warmth but drop it
        // into shadow so the restored ones sing. A soft dark base grounds it.
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.filter = 'sepia(0.45) saturate(0.6) brightness(0.5) contrast(0.95)';
        ctx.drawImage(img, p.x * W - w / 2, p.y * H - h, w, h);
        ctx.restore();
        continue;
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
      // a fully-upgraded (Beloved) building gets a soft golden aura of pride;
      // the L2/L3 detail now lives in the painted sprite itself
      if (!p.ruined && p.unlockAt > 0 && BUILDING_INFO[p.art] && this.game.upgradeTier(p.art) >= 2 && !this.reduce) {
        const cx = p.x * W;
        const cy = p.y * H - h * 0.5;
        const pulse = 0.1 + 0.04 * Math.sin(t / 1400 + cx);
        const aura = ctx.createRadialGradient(cx, cy, w * 0.2, cx, cy, w * 0.7);
        aura.addColorStop(0, `rgba(255, 216, 140, ${pulse.toFixed(3)})`);
        aura.addColorStop(1, 'rgba(255, 216, 140, 0)');
        ctx.fillStyle = aura;
        ctx.fillRect(cx - w * 0.75, cy - h * 0.6, w * 1.5, h * 1.2);
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

    // --- small lives: gulls always wheel over the harbour; the cat later ---
    if (stage >= 3) {
      const cat = this.sprite('animal_cat');
      if (cat) {
        const w = 0.032 * W;
        ctx.drawImage(cat, W * 0.545, H * 0.665 - w * (cat.naturalHeight / cat.naturalWidth), w, w * (cat.naturalHeight / cat.naturalWidth));
      }
    }
    {
      const gull = this.sprite('animal_gull');
      if (gull && !this.reduce) {
        const gustiness = 1 + mood.wind * 1.4;
        const flock = 2 + (stage >= 3 ? 1 : 0);
        for (let g = 0; g < flock; g++) {
          const gx = W * (0.5 + 0.34 * Math.sin((t * gustiness) / 2600 + g * 2.1));
          const gy = H * (0.14 + 0.06 * Math.cos((t * gustiness) / 2100 + g * 1.7) + g * 0.03);
          const gw = 0.028 * W;
          ctx.globalAlpha = 0.85;
          ctx.drawImage(gull, gx, gy, gw, gw * (gull.naturalHeight / gull.naturalWidth));
          ctx.globalAlpha = 1;
        }
      }
    }

    // --- the lighthouse keeps its watch on the point (painted-style tower) ---
    {
      const lx = W * 0.93;
      const baseY = H * 0.5; // sits on the north headland
      const th = H * 0.24; // tower height
      const topY = baseY - th;
      const wBot = W * 0.05;
      const wTop = W * 0.032;
      const lit = delivered >= 9; // the beacon story beat
      // rocky footing
      ctx.fillStyle = night ? '#2c3242' : '#5a5648';
      ctx.beginPath();
      ctx.ellipse(lx, baseY, wBot * 0.9, H * 0.02, 0, 0, Math.PI * 2);
      ctx.fill();
      // tapered tower body
      ctx.beginPath();
      ctx.moveTo(lx - wBot / 2, baseY);
      ctx.lineTo(lx - wTop / 2, topY);
      ctx.lineTo(lx + wTop / 2, topY);
      ctx.lineTo(lx + wBot / 2, baseY);
      ctx.closePath();
      const body = ctx.createLinearGradient(lx - wBot / 2, 0, lx + wBot / 2, 0);
      body.addColorStop(0, night ? '#b9b3a4' : '#efe9db');
      body.addColorStop(0.5, night ? '#d4cfc0' : '#fbf7ec');
      body.addColorStop(1, night ? '#a49e8f' : '#ddd6c6');
      ctx.fillStyle = body;
      ctx.fill();
      ctx.strokeStyle = 'rgba(90,74,50,0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // two red bands
      ctx.fillStyle = '#c14a35';
      for (const f of [0.34, 0.66]) {
        const y = baseY - th * f;
        const wb = wBot + (wTop - wBot) * f;
        ctx.fillRect(lx - wb / 2, y - th * 0.05, wb, th * 0.09);
      }
      // gallery deck + lantern room
      const galW = wTop * 1.7;
      const galY = topY;
      ctx.fillStyle = night ? '#3a4152' : '#4a5568';
      ctx.fillRect(lx - galW / 2, galY - 2, galW, 4);
      const lampH = th * 0.14;
      ctx.beginPath();
      ctx.fillStyle = lit ? '#ffe6a8' : night ? '#39415a' : '#7a8494';
      ctx.fillRect(lx - wTop * 0.6, galY - lampH, wTop * 1.2, lampH);
      if (lit) {
        ctx.fillStyle = 'rgba(255,230,160,0.5)';
        ctx.beginPath();
        ctx.arc(lx, galY - lampH / 2, wTop * 0.9, 0, Math.PI * 2);
        ctx.fill();
      }
      // little roof cap
      ctx.fillStyle = '#7a4a34';
      ctx.beginPath();
      ctx.moveTo(lx - wTop * 0.7, galY - lampH);
      ctx.lineTo(lx, galY - lampH - th * 0.08);
      ctx.lineTo(lx + wTop * 0.7, galY - lampH);
      ctx.closePath();
      ctx.fill();
      // sweeping beam
      if (lit && !this.reduce) {
        const oy = galY - lampH / 2;
        const ang = Math.sin(t / 1500) * 0.5 - 0.25;
        const beam = ctx.createLinearGradient(lx, oy, lx - 170 * Math.cos(ang), oy - 90 * Math.sin(ang));
        beam.addColorStop(0, 'rgba(255,232,168,0.42)');
        beam.addColorStop(1, 'rgba(255,232,168,0)');
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(lx, oy);
        ctx.lineTo(lx - 180 * Math.cos(ang - 0.11), oy - 110 * Math.sin(ang - 0.11));
        ctx.lineTo(lx - 180 * Math.cos(ang + 0.11), oy - 110 * Math.sin(ang + 0.11));
        ctx.closePath();
        ctx.fill();
      }
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

    // --- ambient environment effects (Batch 11) — the small motions that
    // make Emberhollow feel like weather and light are passing through ---
    if (!this.reduce) this.drawAmbientEffects(ctx, W, H, t, night, hour, mood, stage);

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
   * Batch 11 — Environment Effects, drawn procedurally: sun rays and cloud
   * shadows by day, fireflies over the meadow at night, and pollen/leaves
   * drifting on the wind. All gentle, all paused under reduced-motion.
   */
  private drawAmbientEffects(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
    night: boolean,
    hour: number,
    mood: WorldMood,
    stage: number,
  ): void {
    // God-rays fanning from the low sun on clear-ish days.
    if (!night && mood.cloudCover < 0.55) {
      const sx = W * 0.78;
      const sy = H * 0.14;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const a = (0.9 + i * 0.34) + Math.sin(t / 5000 + i) * 0.05;
        const len = H * 0.7;
        const spread = 0.05;
        const g = ctx.createLinearGradient(sx, sy, sx + Math.cos(a) * len, sy + Math.sin(a) * len);
        g.addColorStop(0, `rgba(255, 232, 175, ${(0.06 * (1 - mood.cloudCover)).toFixed(3)})`);
        g.addColorStop(1, 'rgba(255, 232, 175, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + Math.cos(a - spread) * len, sy + Math.sin(a - spread) * len);
        ctx.lineTo(sx + Math.cos(a + spread) * len, sy + Math.sin(a + spread) * len);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // Soft cloud shadows sliding across the island ground.
    if (!night) {
      const nsh = Math.max(1, Math.round(mood.cloudCover * 3));
      ctx.fillStyle = 'rgba(20, 30, 20, 0.05)';
      for (let i = 0; i < nsh; i++) {
        const drift = (t / (40000 / (0.5 + mood.wind * 1.4))) % 1.4;
        const sx = (((i * 0.4 + drift) % 1.4) - 0.2) * W;
        const sy = H * (0.55 + (i % 2) * 0.14);
        ctx.beginPath();
        ctx.ellipse(sx, sy, W * 0.14, H * 0.05, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (night) {
      // Fireflies wander the meadow, twinkling warm.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const n = 14;
      for (let i = 0; i < n; i++) {
        const fx = W * (0.12 + 0.76 * ((i / n + Math.sin(t / 3200 + i * 1.7) * 0.06 + 1) % 1));
        const fy = H * (0.5 + 0.34 * ((0.5 + Math.cos(t / 2600 + i * 2.3) * 0.5)));
        const tw = 0.35 + 0.65 * Math.abs(Math.sin(t / 700 + i * 2.1));
        const r = 3.2;
        const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, r);
        g.addColorStop(0, `rgba(200, 240, 150, ${(0.55 * tw).toFixed(3)})`);
        g.addColorStop(1, 'rgba(200, 240, 150, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(fx, fy, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else {
      // Pollen / dust motes and the odd leaf drift on the breeze by day.
      const drift = 0.4 + mood.wind * 2.2;
      ctx.fillStyle = 'rgba(255, 245, 210, 0.5)';
      for (let i = 0; i < 12; i++) {
        const mx = ((i * 79 + t * 0.01 * drift) % W + W) % W;
        const my = H * 0.36 + ((i * 43 + t * 0.006) % (H * 0.55)) + Math.sin(t / 900 + i) * 4;
        ctx.beginPath();
        ctx.arc(mx, my, 0.9 + (i % 3) * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      // a few tumbling leaves once there are trees to shed them
      if (stage >= 1) {
        const leafCols = ['#c98a3a', '#b5642f', '#9a8a3a'];
        for (let i = 0; i < 5; i++) {
          const lx = ((i * 137 + t * 0.02 * drift) % W + W) % W;
          const ly = H * 0.34 + ((i * 91 + t * 0.014) % (H * 0.56));
          const rot = t / 400 + i;
          ctx.save();
          ctx.translate(lx + Math.sin(t / 700 + i) * 8, ly);
          ctx.rotate(rot);
          ctx.fillStyle = leafCols[i % leafCols.length]!;
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.ellipse(0, 0, 3.2, 1.5, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        ctx.globalAlpha = 1;
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
