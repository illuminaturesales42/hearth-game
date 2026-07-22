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
import type { Game, GameEvent } from '../core/game';
import { MAP_LOCATIONS } from '../data/world';
import { MINIGAMES, minigameForBuilding } from '../data/minigames';
import { ORDERS, RESTORE_ORDERS, chapterFor, stageFor } from '../data/economy';
import { orderAt } from '../data/endless';
import { questsForDay } from '../data/daily-quests';
import {
  BUILDING_INFO,
  DECOR_CATALOG,
  TOWN_BOATS,
  TOWN_BUILDINGS,
  TOWN_NATURE,
  TOWN_TERRAIN,
  TOWN_WALKERS,
} from '../data/town-layout';
import { computeMood, earnedFlourishes, meditatedToday, moodCaption, seasonForMonth } from '../core/world-mood';
import type { WeatherNow, WorldMood } from '../core/world-mood';
import { stemLevels, type StemLevels } from '../core/stem-levels';
import { illumination, isWaxing, phaseName } from '../data/moon';
import { constellationFor, activeMeteorShower, type Constellation } from '../data/constellations';
import { clampCamera, screenToWorld, zoomAt, type Camera } from '../core/map-camera';
import { phaseForTime, type SunTimes } from '../core/time-of-day';
import { ReactionOnsets, type OnsetKind } from './world-reactions';
import {
  currentWeather,
  latestAccumulation,
  effectiveWeather,
  presetAccumulation,
  getSkyPref,
  latestCoords,
} from './weather';
import { sunPosition } from '../core/sun';

/** The sun's screen-side key for the lighting washes, or null with no location. */
type SunKey = { dx: number; dy: number; lowness: number } | null;
import { artUrl, portraitFor, tileMarkup } from './art';
import { esc } from './esc';
import { ALMANAC_PAGES, ALMANAC_SECTIONS, almanacProgress } from '../core/almanac';
import { VILLAGER_DEFS } from '../data/villagers';
import { bondFor, greetingFor, hearts, HEARTS_MAX } from '../core/relationships';
import { drawButterfly, drawFlower, drawSparkle, drawStroller } from './paint-flourishes';
import { toast } from './toast';
import { feedback } from './feedback';
import { minigameCta } from './minigame-cta';
import { tomorrowLine } from './tease';

const STAGE_NAMES = [
  'Storm-Wrecked',
  'Rebuilding Begins',
  'A Place to Call Home',
  'A Flourishing Haven',
  'Beacon of Emberhollow',
] as const;

/**
 * Emberhollow's coastline, clockwise from the west edge — hand-laid headlands
 * and coves (normalized coords) so the island reads as a real shore the sea
 * works against, never a smooth oval. The east headland carries the
 * lighthouse; the south-east bay shelters the docks and moored boats.
 */
const COASTLINE: readonly [number, number][] = [
  [-0.08, 0.52], // west, off-canvas
  [0.05, 0.44], // north-west headland
  [0.14, 0.465], // cove
  [0.26, 0.395], // rise toward the wooded north
  [0.38, 0.415], // small cove
  [0.52, 0.355], // north headland behind the town hall
  [0.64, 0.39], // dip
  [0.76, 0.385], // rise
  [0.88, 0.43], // running out to the lighthouse point
  [1.02, 0.47], // east headland, off-canvas
  [1.09, 0.6],
  [1.04, 0.74], // south-east turn
  [0.9, 0.855], // dock bay, east side
  [0.8, 0.825], // dock headland
  [0.68, 0.895], // sheltered bay for the fishing boats
  [0.55, 0.925], // south beach
  [0.42, 0.895],
  [0.3, 0.935], // south cove
  [0.16, 0.895],
  [0.04, 0.925], // south-west
  [-0.08, 0.8], // west, off-canvas
];

export class MapView {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private raf = 0;
  /** rAF timestamp of the last drawn frame (for the ~30fps ambient cap). */
  private lastDrawT = -1000;
  /** Last storm-flash cycle we rolled thunder for (one clap per flash). */
  private lastThunderCycle = -1;
  private visible = false;
  private mediaReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Reduced-motion is honoured from BOTH the OS media query AND the in-app
   *  Settings toggle (body.reduce-motion) — matching board-view and the minigame
   *  overlay, so choosing "reduce motion" in Settings actually calms the map
   *  (onset cues become toasts, ambient loops hold still). */
  private get reduce(): boolean {
    return this.mediaReduce || document.body.classList.contains('reduce-motion');
  }
  /** Painted stage backdrops (sliced from the concept sheets); null until loaded. */
  private stageArt: (HTMLImageElement | null)[] = [null, null, null, null, null];
  /** Sprite cache for the composed town scene. */
  private sprites = new Map<string, HTMLImageElement>();
  /** Recently-appeared building pop-in animations (art id -> start ms). */
  private appeared = new Map<string, number>();
  /** Pre-masked storm-worn ruin renders (art id -> offscreen canvas). */
  private ruinCache = new Map<string, HTMLCanvasElement>();
  private lastOrderIndex = -1;
  /** Last-drawn building rectangles for tap-to-inspect. */
  private hitboxes: { x0: number; y0: number; x1: number; y1: number; art: string; unlockAt: number }[] = [];
  /** unlockAt of the building currently shown in the card (for in-place refreshes). */
  private cardUnlockAt = 0;
  /** Real weather outside the window (best-effort; null renders clear). */
  private weather: WeatherNow | null = null;
  private weatherAskedAt = 0;
  /** Decorate mode: pick a piece from the tray, tap the town to place it. */
  private decorMode = false;
  private decorPick: string | null = null;
  private decorHit: { x0: number; y0: number; x1: number; y1: number; id: number }[] = [];

  /**
   * Camera for the "look around the island" pan/zoom. `zoom` 1 = fit (identical
   * to the classic view); >1 zooms into the same scene. `panX/panY` are viewport
   * offsets in CSS px, clamped so the viewport never leaves the scaled scene.
   * draw() and the click hit-test share this transform, so a tap always lands on
   * what's under the finger at any zoom.
   */
  private cam: Camera = { zoom: 1, panX: 0, panY: 0 };
  private static readonly ZOOM_STEPS = [1, 1.8, 2.6] as const;
  private dragging = false;
  private dragMoved = false;
  private dragFrom = { x: 0, y: 0, panX: 0, panY: 0 };

  /** One-shot reaction cues (the *felt* onset when a real action changes the town). */
  private onsets = new ReactionOnsets();

  constructor(private game: Game) {
    // The painted stage backdrops are a fallback for when the composed-town art
    // pack is absent (see draw() — the town always wins when `town_townhall`
    // exists). In the shipped build the pack is present, so preloading all five
    // (~480KB) on the Home screen is pure waste — only fetch them if the
    // composed town isn't available.
    if (!artUrl('town_townhall')) {
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
    }
    // The player set/changed their town or picked a sky in Settings — refetch and
    // repaint now (the redraw matters for reduced-motion, which has no rAF loop).
    document.addEventListener('hearth:location-changed', () => {
      this.forceWeatherRefresh();
      this.accumCache = null;
      if (this.visible && this.reduce) this.draw(0);
    });
    game.subscribe((ev) => {
      const refresh =
        ev.type === 'delivered' ||
        ev.type === 'chapterComplete' ||
        ev.type === 'merge' ||
        ev.type === 'action' ||
        ev.type === 'questDone' ||
        ev.type === 'chronicle' ||
        ev.type === 'upgrade' ||
        ev.type === 'decor' ||
        ev.type === 'state';
      if (refresh && this.visible) {
        this.renderList();
        if (this.reduce) this.draw(0);
      }
    });
    // The *felt* living world: when a real action lands, fire a brief onset cue
    // (light + motion + one soft tone) right where the town answers, plus a
    // one-line note. Positive-only, self-dismissing — reflect, never punish.
    game.subscribe((ev) => this.onReactionEvent(ev));
  }

  /** Map a game event to a reaction onset (cue + caption) at the town spot. */
  private onReactionEvent(ev: GameEvent): void {
    if (!this.visible) return; // seen-while-away is handled by the return recap
    this.updateStems(); // a real-world action can shift the ambience (calm/chatter)
    let cue: { x: number; y: number; kind: OnsetKind; note: string; colour?: string } | null = null;
    if (ev.type === 'action' && ev.energy > 0) cue = reactionForAction(ev.actionId);
    else if (ev.type === 'health' && ev.fromSteps > 0)
      cue = { x: 0.42, y: 0.72, kind: 'motes', note: 'The lanes fill after your walk.' };
    else if (ev.type === 'gratitude' && ev.energy > 0)
      cue = { x: 0.5, y: 0.5, kind: 'glow', note: 'A warmth spreads from the hearth.' };
    else if (ev.type === 'kindness' && ev.energy > 0)
      cue = { x: 0.5, y: 0.62, kind: 'heart', note: 'A kindness ripples out.', colour: '#e6739a' };
    else if (ev.type === 'stargaze' && ev.energy > 0)
      cue = { x: 0.5, y: 0.22, kind: 'glow', note: 'The stars lean a little closer.' };
    if (!cue) return;
    feedback.chime(cue.kind === 'ripple' ? 300 : 520);
    // Reduced-motion: no rAF loop to animate a cue, so acknowledge with a
    // self-timing toast instead of a canvas onset (still "the town noticed").
    if (this.reduce) {
      toast(cue.note);
      return;
    }
    this.onsets.add(cue.kind, cue.x, cue.y, cue.colour ? { colour: cue.colour } : {});
    if (cue.kind === 'ripple' || cue.kind === 'bloom') this.onsets.add('motes', cue.x, cue.y - 0.03);
    this.onsets.add('caption', cue.x, cue.y - 0.06, { text: cue.note });
  }

  private progress(): number {
    // Restoration completes when the town is fully rebuilt; later story
    // chapters continue past that without regressing the bar.
    return Math.min(1, this.game.snapshot.orderIndex / RESTORE_ORDERS);
  }
  /** 0..4 homestead stage, spread across the full MVP story. */
  private stage(): number {
    return stageFor(this.game.snapshot.orderIndex);
  }

  /**
   * A storm-worn shade of a not-yet-restored building: sepia-shadowed and
   * faded out radially, so the source slice's rectangular vignette backdrop
   * never reads as a box on the meadow or against the sky.
   */
  private ruinShade(img: HTMLImageElement, art: string): HTMLCanvasElement {
    const hit = this.ruinCache.get(art);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d')!;
    g.filter = 'sepia(0.45) saturate(0.6) brightness(0.5) contrast(0.95)';
    g.drawImage(img, 0, 0);
    g.filter = 'none';
    g.globalCompositeOperation = 'destination-in';
    const m = g.createRadialGradient(
      c.width / 2,
      c.height * 0.55,
      Math.min(c.width, c.height) * 0.2,
      c.width / 2,
      c.height * 0.55,
      Math.max(c.width, c.height) * 0.62,
    );
    m.addColorStop(0, 'rgba(0,0,0,1)');
    m.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = m;
    g.fillRect(0, 0, c.width, c.height);
    this.ruinCache.set(art, c);
    return c;
  }

  /**
   * The night sky over the bay on the painted plate: a soft starfield (dimmed by
   * real cloud cover) and the REAL current moon, drawn with its true phase — a
   * full moon over Emberhollow tonight because there's a full moon tonight.
   * Reduced-motion holds the stars steady; the moon is always drawn.
   */
  private drawCelestial(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, mood: WorldMood): void {
    const clear = 1 - mood.cloudCover * 0.75; // stars/moon fade behind cloud
    if (clear <= 0.05) return;
    ctx.save();
    ctx.fillStyle = 'rgba(240, 244, 255, 1)';
    for (let i = 0; i < 70; i++) {
      const sx = (((Math.sin(i * 12.9898) * 43758.5) % 1) + 1) % 1;
      const sy = (((Math.sin(i * 78.233) * 12543.7) % 1) + 1) % 1;
      const x = sx * W;
      const y = sy * H * 0.24 + H * 0.01;
      const big = i % 9 === 0;
      const tw = this.reduce ? 0.6 : 0.28 + 0.55 * Math.abs(Math.sin(t / 900 + i * 1.3));
      ctx.globalAlpha = tw * 0.8 * clear;
      ctx.fillRect(x, y, big ? 1.7 : 1, big ? 1.7 : 1);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    // Upper-left sky — clear of the corner time badge (a DOM element top-right).
    const now = Date.now();
    this.drawMoonPhase(ctx, W * 0.22, H * 0.1, 11, illumination(now), isWaxing(now), clear);
    // The season's constellation (hemisphere-aware), upper-centre sky.
    this.drawConstellation(
      ctx,
      W,
      H,
      constellationFor(new Date(now).getMonth(), this.weather?.southern ?? false),
      clear,
    );
    // Shooting stars on the nights a real meteor shower peaks.
    if (!this.reduce) {
      const shower = activeMeteorShower(now);
      if (shower) this.drawMeteors(ctx, W, H, t, shower.intensity, clear);
    }
  }

  /** The season's constellation as faint joined stars in a small upper-sky box. */
  private drawConstellation(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    c: Constellation,
    clear: number,
  ): void {
    const bx = W * 0.44;
    const by = H * 0.02;
    const bw = W * 0.26;
    const bh = H * 0.13;
    const px = (s: { x: number; y: number }) => bx + s.x * bw;
    const py = (s: { x: number; y: number }) => by + s.y * bh;
    ctx.save();
    ctx.strokeStyle = `rgba(196, 212, 255, ${(0.24 * clear).toFixed(3)})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    for (const [a, b] of c.lines) {
      const sa = c.stars[a]!;
      const sb = c.stars[b]!;
      ctx.moveTo(px(sa), py(sa));
      ctx.lineTo(px(sb), py(sb));
    }
    ctx.stroke();
    ctx.fillStyle = `rgba(236, 242, 255, ${(0.9 * clear).toFixed(3)})`;
    for (const s of c.stars) {
      ctx.beginPath();
      ctx.arc(px(s), py(s), 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Gentle shooting stars during an active shower — soft, occasional, cozy. */
  private drawMeteors(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
    intensity: number,
    clear: number,
  ): void {
    const period = 2600 - intensity * 1100; // more frequent nearer the peak
    const idx = Math.floor(t / period);
    ctx.save();
    for (let k = 0; k < 2; k++) {
      const i = idx - k;
      const age = t - i * period;
      if (age < 0 || age > 750) continue; // streak lifetime
      const u = age / 750; // 0..1 across its fall
      const rx = (((Math.sin(i * 91.7) * 9999) % 1) + 1) % 1;
      const ry = (((Math.sin(i * 13.13) * 9999) % 1) + 1) % 1;
      const startX = 0.08 * W + rx * 0.8 * W;
      const startY = 0.02 * H + ry * 0.12 * H;
      const travel = 42 + rx * 26;
      const hx = startX + Math.cos(0.7) * travel * u;
      const hy = startY + Math.sin(0.7) * travel * u;
      const tailX = hx - Math.cos(0.7) * 16;
      const tailY = hy - Math.sin(0.7) * 16;
      const a = Math.sin(u * Math.PI) * 0.85 * clear; // fade in and out
      const grad = ctx.createLinearGradient(hx, hy, tailX, tailY);
      grad.addColorStop(0, `rgba(255, 252, 235, ${a.toFixed(3)})`);
      grad.addColorStop(1, 'rgba(255, 252, 235, 0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * A phase-accurate moon: earthshine dark disc + a lit region bounded by the
   * sunlit limb (a semicircle) and the terminator (a half-ellipse whose width
   * tracks the illuminated fraction). Crescent when <half lit, gibbous when >half.
   */
  private drawMoonPhase(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    f: number,
    waxing: boolean,
    clear: number,
  ): void {
    ctx.save();
    const halo = ctx.createRadialGradient(cx, cy, r * 0.6, cx, cy, r * 3.4);
    halo.addColorStop(0, `rgba(222, 230, 255, ${(clear * (0.1 + 0.16 * f)).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(222, 230, 255, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = clear;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(74, 82, 116, 0.5)'; // earthshine so a new moon isn't a hole
    ctx.fill();
    // Lit region drawn in a canonical orientation (lit on the LEFT), then
    // mirrored for a waxing moon so it's lit on the right (northern convention).
    ctx.save();
    ctx.translate(cx, cy);
    if (waxing) ctx.scale(-1, 1);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false); // sunlit limb (a semicircle)
    const tw = r * (2 * f - 1); // >0 gibbous (bulges out), <0 crescent (curves in)
    ctx.ellipse(0, 0, Math.abs(tw), r, 0, Math.PI / 2, -Math.PI / 2, tw >= 0); // terminator
    ctx.closePath();
    ctx.fillStyle = 'rgba(236, 240, 252, 0.97)';
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  /** How the world feels right now: real weather + the player's day. */
  /**
   * Signed horizontal wind (−1 = blowing left/west … +1 = right/east) from the
   * real wind direction, so rain slants and snow drifts the way the wind is
   * actually blowing where the player is. Meteorological windDir is where the
   * wind comes FROM, so it blows toward windDir+180°. Gentle rightward default
   * until a direction is known.
   */
  private windX(): number {
    const d = this.weather?.windDir;
    return d == null ? 0.6 : Math.sin(((d + 180) * Math.PI) / 180);
  }

  /** The player's real sun times from the latest reading, or null (→ clock fallback). */
  private sunTimesFromWeather(): SunTimes | null {
    const w = this.weather;
    if (w && typeof w.sunriseMs === 'number' && typeof w.sunsetMs === 'number') {
      return { sunriseMs: w.sunriseMs, sunsetMs: w.sunsetMs };
    }
    return null;
  }

  private mood(): WorldMood {
    const s = this.game.snapshot;
    // "Pick your sky": a chosen mood overrides the real weather (opt-out for
    // grey-climate players) while the solar clock still tracks the real sunrise.
    const pref = getSkyPref();
    const weather = effectiveWeather(this.weather, pref);
    const accumulation = pref === 'real' ? this.accumulation() : presetAccumulation(pref);
    return computeMood({
      weather,
      meditatedToday: meditatedToday(s.actions.counts),
      lastCalmDay: s.wellbeing.lastCalmDay,
      today: s.actions.day,
      sleptWell: (s.healthLedger?.sleepGranted ?? 0) > 0,
      counts: s.actions.counts,
      walkedToday: (s.healthLedger?.stepsGranted ?? 0) > 0,
      streak: s.actions.streak,
      accumulation,
    });
  }

  private accumCache: { at: number; value: ReturnType<typeof latestAccumulation> } | null = null;
  /**
   * Weather's memory changes on an hourly / slow-decay clock, so it's wasteful to
   * re-read the log and re-fold it every frame — recompute at most once a minute.
   */
  private accumulation(): ReturnType<typeof latestAccumulation> {
    const now = Date.now();
    if (!this.accumCache || now - this.accumCache.at > 60_000) {
      this.accumCache = { at: now, value: latestAccumulation(now) };
    }
    return this.accumCache.value;
  }

  private refreshWeather(): void {
    if (Date.now() - this.weatherAskedAt < 30 * 60 * 1000) return;
    this.weatherAskedAt = Date.now();
    void currentWeather().then((w) => {
      if (!w) return;
      this.weather = w;
      this.accumCache = null; // a fresh reading just extended the log
      if (this.visible && this.reduce) this.draw(0);
    });
  }

  /** Refetch weather right now (the player changed location in Settings). */
  private forceWeatherRefresh(): void {
    this.weatherAskedAt = 0;
    this.refreshWeather();
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
      this.maybeShowRecap();
      this.updateStems();
    } else {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      feedback.stopStems(); // the map's ambience belongs to the map
    }
  }

  /** last stem levels sent, so ramps only fire when something actually changed */
  private lastStems: StemLevels | null = null;
  private stemsCheckedAt = 0;

  /**
   * Key the quiet ambient stems to the world's mood (the ear catches what the
   * eye misses): meditation stills the day into a soft pad, rain brings a cosy
   * bed of it, a good walk raises a faint distant bustle. Additive only.
   */
  private updateStems(): void {
    if (!this.visible) return;
    this.stemsCheckedAt = Date.now();
    const { weights } = phaseForTime(Date.now(), this.sunTimesFromWeather());
    const levels = stemLevels(this.mood(), weights);
    const last = this.lastStems;
    const same =
      last &&
      last.calmPad === levels.calmPad &&
      last.rain === levels.rain &&
      last.chatter === levels.chatter &&
      last.wind === levels.wind &&
      last.surf === levels.surf &&
      last.birds === levels.birds &&
      last.crickets === levels.crickets;
    if (same) return;
    this.lastStems = levels;
    feedback.setStem('calmPad', levels.calmPad);
    feedback.setStem('rain', levels.rain);
    feedback.setStem('chatter', levels.chatter);
    feedback.setStem('wind', levels.wind);
    feedback.setStem('surf', levels.surf);
    feedback.setStem('birds', levels.birds);
    feedback.setStem('crickets', levels.crickets);
  }

  /**
   * "Emberhollow today" — a gentle once-a-day recap on returning to the map,
   * celebrating the flourishes the player's real-world day has brought the town
   * (research: the return-and-notice payoff). Shown at most once per day, and only
   * when there's something to celebrate. Never lists anything skipped.
   */
  private maybeShowRecap(): void {
    const body = document.getElementById('map-body');
    const home = document.getElementById('screen-home');
    if (!body || !home) return;
    const day = this.game.snapshot.actions.day;
    const key = `hearth:recap:${day}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      /* private mode: show it, just won't remember */
    }
    const flourishes = earnedFlourishes(this.mood());
    if (flourishes.length === 0) return; // nothing earned yet — don't nag, try again later
    try {
      localStorage.setItem(key, '1');
    } catch {
      /* ignore */
    }
    const lines = flourishes
      .slice(0, 4)
      .map((f) => `<li>${f}</li>`)
      .join('');
    const card = document.createElement('div');
    card.className = 'map-recap';
    card.innerHTML =
      `<button class="map-recap-close" aria-label="Close">✕</button>` +
      `<h3>Emberhollow today</h3>` +
      `<p class="map-recap-sub">Your day has left its mark on the town:</p>` +
      `<ul class="map-recap-list">${lines}</ul>`;
    // Insert as a sibling before the list (renderList rebuilds map-body, so a
    // child there would be wiped on the next refresh — a sibling survives).
    home.insertBefore(card, body);
    const close = () => card.remove();
    card.querySelector<HTMLButtonElement>('.map-recap-close')?.addEventListener('click', close);
    // auto-dismiss so it never lingers (calm-tech: recede)
    window.setTimeout(close, 9000);
  }

  private mount(): void {
    if (this.canvas) return;
    this.canvas = document.getElementById('map-canvas') as HTMLCanvasElement | null;
    this.ctx = this.canvas?.getContext('2d') ?? null;
    // Tap a returned building to hear how it came back — or, in decorate
    // mode, tap the town to place a piece / tap a piece to pick it back up.
    // Coordinates are converted through the camera (screenToWorld) so taps land
    // true at any zoom; a drag (when zoomed in) pans instead of tapping.
    this.canvas?.addEventListener('click', (e) => {
      if (this.dragMoved) {
        this.dragMoved = false;
        return; // that gesture was a pan, not a tap
      }
      const rect = this.canvas!.getBoundingClientRect();
      const p = this.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      const x = p.x;
      const y = p.y;
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
            toast(
              broke
                ? 'Not enough coins yet — orders and quests pay well.'
                : 'That spot is out over the water — try the island.',
            );
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
    this.mountCamControls();
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
    // Stop animating a town nobody's looking at — a backgrounded tab shouldn't
    // burn battery on the canvas loop. Resume when we're foregrounded again.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(this.raf);
        this.raf = 0;
      } else if (this.visible && !this.reduce && !this.raf) {
        this.loop();
      }
    });
  }

  /**
   * "Look around the island": drag to pan when zoomed in, wheel/pinch to zoom,
   * and a zoom button as the primary touch-friendly control. Pan is disabled in
   * decorate mode (there, drags place pieces) and at fit-zoom (nothing to pan).
   */
  private mountCamControls(): void {
    const cv = this.canvas;
    if (!cv) return;

    // Zoom button (added to the map actions bar).
    const zoomBtn = document.getElementById('map-zoom-btn');
    if (zoomBtn) zoomBtn.addEventListener('click', () => this.cycleZoom());
    this.updateZoomBtn();

    // Desktop wheel-zoom, centred on the cursor.
    cv.addEventListener(
      'wheel',
      (e) => {
        if (this.decorMode) return;
        e.preventDefault();
        const rect = cv.getBoundingClientRect();
        const steps = MapView.ZOOM_STEPS;
        const i = steps.indexOf(this.cam.zoom as (typeof steps)[number]);
        const dir = e.deltaY < 0 ? 1 : -1;
        const next = steps[Math.min(steps.length - 1, Math.max(0, i + dir))] ?? 1;
        if (next !== this.cam.zoom) this.zoomTo(next, { x: e.clientX - rect.left, y: e.clientY - rect.top });
      },
      { passive: false },
    );

    // Pointer drag to pan (touch + mouse). A small move threshold distinguishes
    // a pan from a tap so buildings still open on a clean tap.
    cv.addEventListener('pointerdown', (e) => {
      if (this.decorMode || this.cam.zoom <= 1) return;
      this.dragging = true;
      this.dragMoved = false;
      this.dragFrom = { x: e.clientX, y: e.clientY, panX: this.cam.panX, panY: this.cam.panY };
      cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.dragFrom.x;
      const dy = e.clientY - this.dragFrom.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) this.dragMoved = true;
      this.cam.panX = this.dragFrom.panX + dx;
      this.cam.panY = this.dragFrom.panY + dy;
      this.clampCam();
      if (this.reduce) this.draw(0);
    });
    const endDrag = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      try {
        cv.releasePointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
    };
    cv.addEventListener('pointerup', endDrag);
    cv.addEventListener('pointercancel', endDrag);
    cv.style.touchAction = 'none'; // let us own drag-pan without the page scrolling
  }

  /** The decorate tray: pick a piece, tap the town. Coins buy beauty, never power. */
  private mountDecorTray(): void {
    const btn = document.getElementById('decor-btn');
    const tray = document.getElementById('decor-tray');
    if (!btn || !tray) return;
    const renderTray = () => {
      const coins = this.game.snapshot.coins;
      tray.innerHTML =
        `<p class="decor-hint">${this.decorPick ? 'Tap the town to place it — tap a placed piece to pick it up.' : 'Choose a piece. Picking one back up reclaims half its materials.'}</p>` +
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
    this.cardUnlockAt = unlockAt;
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
    if (meta)
      meta.textContent = locked
        ? `Returns with order ${at} · ${chapterFor(at - 1).title}`
        : `Returned with order ${at} · ${chapterFor(at - 1).title}`;

    // Upgrade affordance — only for buildings that have actually returned AND
    // can be upgraded (props/the lighthouse can't).
    const tierEl = document.getElementById('bldg-tier');
    const upBtn = document.getElementById('bldg-upgrade') as HTMLButtonElement | null;
    const tierNames = ['Restored', 'Cared-for', 'Beloved'];
    if (tierEl && upBtn) {
      if (locked || !this.game.isUpgradeable(art)) {
        tierEl.hidden = true;
        upBtn.hidden = true;
      } else {
        const tier = this.game.upgradeTier(art);
        // What caring brings is purely cosmetic — deeper colours, a golden aura
        // of pride. Coins buy beauty, never power (a hard pillar).
        const tierNote = [
          'Tend it and its colours deepen — a home lovingly kept.',
          'One more kindness and it glows with a quiet golden pride.',
          'As cherished as Emberhollow can make it.',
        ];
        tierEl.hidden = false;
        tierEl.innerHTML =
          `<span class="bldg-tier-name">${tierNames[tier] ?? 'Beloved'} · ${'★'.repeat(tier + 1)}${'☆'.repeat(Math.max(0, 2 - tier))}</span>` +
          `<span class="bldg-tier-note">${tierNote[tier] ?? tierNote[2]}</span>`;
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
    // Village Life: buildings open their doors as each one returns.
    this.renderMinigameCta(art, locked);
    // Whose home this is, and how your bond stands (Codex Book III).
    this.renderBond(art, locked);

    const m = document.getElementById('bldg-modal');
    if (m) m.hidden = false;
  }

  /** Show the villager who lives here + your bond + a greeting, on the card. */
  private renderBond(art: string, locked: boolean): void {
    const host = document.getElementById('bldg-bond');
    if (!host) return;
    const villager = VILLAGER_DEFS.find((v) => v.home === art);
    if (!villager || locked) {
      host.hidden = true;
      return;
    }
    const bond = bondFor(this.game.snapshot.relationships, villager.id);
    const filled = hearts(bond.points);
    const heartRow = '♥'.repeat(filled) + '♡'.repeat(Math.max(0, HEARTS_MAX - filled));
    const greet = greetingFor(this.game.snapshot.relationships, villager.id);
    const bust = portraitFor(villager.name);
    host.hidden = false;
    host.innerHTML =
      (bust ? `<span class="bldg-bond-bust" style="background-image:url(${bust})"></span>` : '') +
      `<div class="bldg-bond-body">` +
      `<b>${esc(villager.name)}<span class="bldg-bond-hearts" role="img" aria-label="${filled} of ${HEARTS_MAX} hearts">${heartRow}</span></b>` +
      `<span class="bldg-bond-trait">${esc(villager.trait)}</span>` +
      `<p class="bldg-bond-greet">“${esc(greet)}”</p></div>`;
  }

  /** Hide the building card and launch its game. */
  private launchMinigame(id: string): void {
    const m = document.getElementById('bldg-modal');
    if (m) m.hidden = true;
    document.dispatchEvent(new CustomEvent('hearth:play-minigame', { detail: { id } }));
  }

  /**
   * The "play the building's mini-game" affordance on the building card. The
   * building image itself is the primary control (tap it to play when a game is
   * ready), with a badge inviting the tap; the button below is the secondary.
   */
  private renderMinigameCta(art: string, locked: boolean): void {
    const btn = document.getElementById('bldg-play') as HTMLButtonElement | null;
    const note = document.getElementById('bldg-play-note');
    const artBtn = document.getElementById('bldg-art-btn') as HTMLButtonElement | null;
    const badge = document.getElementById('bldg-art-badge');
    if (!btn || !note) return;
    const st = locked ? null : this.game.minigameStatus(art);

    // Reset the tappable-image affordance each render.
    const setArt = (on: boolean, label: string, onTap?: () => void) => {
      if (badge) {
        badge.hidden = !on;
        badge.textContent = label;
      }
      if (artBtn) {
        artBtn.classList.toggle('is-playable', on);
        artBtn.onclick = on && onTap ? onTap : null;
        artBtn.style.cursor = on ? 'pointer' : 'default';
        // Keyboard + screen-reader: the building image is only a live control
        // when it can be played/opened. Otherwise it's decorative and the
        // #bldg-play button is the accessible affordance — skip it in the tab
        // order so there's no focusable no-op.
        if (on) {
          artBtn.removeAttribute('aria-hidden');
          artBtn.tabIndex = 0;
          artBtn.setAttribute('aria-label', label);
        } else {
          artBtn.setAttribute('aria-hidden', 'true');
          artBtn.tabIndex = -1;
          artBtn.removeAttribute('aria-label');
        }
      }
    };
    setArt(false, '');

    if (!st) {
      btn.hidden = true;
      note.hidden = true;
      return;
    }
    const cta = minigameCta(st, this.game.isTesterUnlimited);
    note.hidden = false;
    note.textContent = cta.sub;

    // The card hides the button entirely when there's nothing to open (locked
    // states just explain themselves in the note); otherwise it shows the
    // shared label. Copy comes from the helper so it can't drift from the index.
    if (cta.kind === 'locked-story' || cta.kind === 'locked-l2') {
      btn.hidden = true;
      return;
    }
    btn.hidden = false;
    if (cta.kind === 'open') {
      const open = () => {
        if (this.game.openMinigameDoors(art) === 'opened') {
          feedback.chime(520);
          this.showBuilding(art, this.cardUnlockAt); // refresh into the "play" state
        }
      };
      btn.disabled = false;
      btn.textContent = cta.label;
      btn.onclick = open;
      setArt(true, cta.badge, open); // the image invites the tap
      return;
    }
    // Unlocked: play, if there's a token + the energy.
    btn.disabled = !cta.actionable;
    btn.textContent = cta.label;
    btn.onclick = () => {
      if (!cta.actionable) return;
      this.launchMinigame(st.def.id);
    };
    if (cta.actionable) setArt(true, cta.badge, () => this.launchMinigame(st.def.id));
  }

  private resize(): void {
    if (!this.canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || 360;
    const h = 285;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.clampCam();
  }

  // ---------- camera (pan / zoom the same island) ----------
  // The transform math lives in core/map-camera.ts (pure + unit tested) so the
  // draw-space ↔ hit-space inverse can never silently drift.

  private get logicalW(): number {
    return this.canvas?.clientWidth || 360;
  }
  private static readonly LOGICAL_H = 285;

  /** Keep the viewport inside the scaled scene; fit-zoom is always centred. */
  private clampCam(): void {
    this.cam = clampCamera(this.cam, this.logicalW, MapView.LOGICAL_H);
  }

  /** Viewport CSS px → logical scene coords (undoes the camera transform). */
  private screenToWorld(x: number, y: number): { x: number; y: number } {
    return screenToWorld(this.cam, x, y);
  }

  /** Zoom to `z`, keeping the world point under `centre` (viewport px) fixed. */
  private zoomTo(z: number, centre?: { x: number; y: number }): void {
    const c = centre ?? { x: this.logicalW / 2, y: MapView.LOGICAL_H / 2 };
    this.cam = zoomAt(this.cam, z, c.x, c.y, this.logicalW, MapView.LOGICAL_H);
    this.updateZoomBtn();
    if (this.reduce) this.draw(0);
  }

  /** Cycle fit → close → closer → fit (the primary, touch-friendly zoom control). */
  private cycleZoom(): void {
    const steps = MapView.ZOOM_STEPS;
    const i = steps.indexOf(this.cam.zoom as (typeof steps)[number]);
    this.zoomTo(steps[(i + 1) % steps.length] ?? 1);
  }

  private updateZoomBtn(): void {
    const btn = document.getElementById('map-zoom-btn');
    if (!btn) return;
    const zoomed = this.cam.zoom > 1;
    btn.textContent = zoomed ? '🔍 Zoom out' : '🔍 Zoom in';
    btn.setAttribute('aria-pressed', zoomed ? 'true' : 'false');
  }

  private loop(): void {
    // Re-entry guard: setVisible(true) fires on EVERY nav-to-home (app-shell
    // calls it unconditionally), and without this a second perpetual rAF chain
    // would start each time — the old handle gets overwritten and can never be
    // cancelled, compounding a full-canvas redraw per orphaned loop per frame.
    if (this.raf) return;
    // Cap the ambient redraw at ~30fps. Every animation is a smooth function of
    // `t` (drifting clouds, water, flames, particles, the storm flash), so
    // halving the redraw rate on a 60Hz display is imperceptible while cutting
    // the per-frame cost — the full-scene composite + all the atmosphere washes
    // — roughly in half. (Battery + thermal on the screen players idle on.)
    const MIN_FRAME_MS = 32;
    const step = (t: number) => {
      if (t - this.lastDrawT >= MIN_FRAME_MS) {
        this.lastDrawT = t;
        this.draw(t);
        // weather drifts on its own clock — re-key the ambience every few seconds
        if (Date.now() - this.stemsCheckedAt > 5000) this.updateStems();
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** Draw one frame of a 7-frame flame sprite strip, its base at (cx, groundY).
   *  Reduced motion holds a single mid-flame frame. */
  private drawFlame(
    ctx: CanvasRenderingContext2D,
    id: string,
    cx: number,
    groundY: number,
    w: number,
    t: number,
  ): void {
    const strip = this.sprite(id);
    if (!strip || !strip.naturalWidth) return;
    const frames = 7;
    const cw = Math.round(strip.naturalWidth / frames);
    const ch = strip.naturalHeight;
    const fi = this.reduce ? 3 : Math.floor(t / 90) % frames; // ~11fps flicker
    const h = w * (ch / cw);
    ctx.drawImage(strip, fi * cw, 0, cw, ch, cx - w / 2, groundY - h, w, h);
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

    // Camera: pan/zoom the same island. At fit-zoom (1) this is the identity, so
    // the classic view is unchanged; when zoomed in, the whole scene (sky, sea,
    // town) scales together and the viewport shows a sub-region. draw() and the
    // click hit-test share this transform (see screenToWorld), so taps stay true.
    ctx.save();
    ctx.translate(this.cam.panX, this.cam.panY);
    ctx.scale(this.cam.zoom, this.cam.zoom);

    // Composed living town (building sprites unlock with the story).
    if (artUrl('town_townhall')) {
      const mood = this.mood();
      this.drawTown(ctx, W, H, t, prog, stage, mood);
      ctx.restore();
      // Whole-world colour grade (outside the camera so it covers the viewport):
      // a warm wash after sleep + meditation, cooler when the mind is restless —
      // the cheapest way to make the *entire* town feel like it answered your day.
      this.applyColourGrade(ctx, W, H, mood);
      this.applyTimeLight(ctx, W, H, t);
      const rainbow = this.rainbowStrength(mood);
      if (rainbow > 0) this.drawRainbow(ctx, W, H, rainbow);
      if (!this.reduce) this.applyStormFx(ctx, W, H, t, mood);
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
      ctx.restore();
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

    ctx.restore();
    this.updateBar(prog, stage);
  }

  private sprite(id: string): HTMLImageElement | null {
    let img = this.sprites.get(id) ?? null;
    if (!img) {
      const url = artUrl(id);
      if (!url) return null;
      img = new Image();
      // Once the sprite decodes, redraw so it appears AND its hitbox is created.
      // Under reduced-motion there is no rAF loop, so without this a building
      // (the small well especially) could stay untappable until an unrelated
      // redraw. Harmless under the animated loop (it redraws every frame anyway).
      img.onload = () => {
        if (this.visible && this.reduce) this.draw(0);
      };
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
  private drawTown(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
    prog: number,
    stage: number,
    mood: WorldMood,
  ): void {
    const delivered = this.game.snapshot.orderIndex;

    // pop-in bookkeeping for buildings that just appeared
    if (this.lastOrderIndex >= 0 && delivered > this.lastOrderIndex) {
      for (const b of TOWN_BUILDINGS) {
        if (b.unlockAt > this.lastOrderIndex && b.unlockAt <= delivered) this.appeared.set(b.art, performance.now());
      }
    }
    this.lastOrderIndex = delivered;

    // Batch 15: a painted island plate (map_island_plate.png), when present, is
    // the scene's base. The opaque procedural sky/sea/land fills are then
    // skipped — the game only composites its LIVE layers (sun/moon, clouds,
    // stars, weather, foam, boats, buildings, people, effects) on top, so the
    // plate reads as a single painting yet still breathes with the time of day.
    const plate = this.sprite('map_island_plate');
    if (plate) ctx.drawImage(plate, 0, 0, W, H);

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
    if (!plate) {
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H * 0.45);
    }
    // sun or moon — real solar night: dark when it's actually dark where the
    // player is (Open-Meteo is_day, else our solar-time model, else the clock).
    const tod = phaseForTime(Date.now(), this.sunTimesFromWeather());
    const night = this.weather?.isDay === false ? true : this.weather?.isDay === true ? false : tod.weights.night > 0.5;
    // The painted plate is a top-down island with NO sky, and the corner
    // time-of-day badge now shows the sun/moon — so the star field and the
    // celestial disc only run for the procedural fallback (no plate). Otherwise
    // a stray white disc floated over the sea and a rectangular sky-glow washed
    // the top of the map.
    if (night && plate) this.drawCelestial(ctx, W, H, t, mood);
    if (night && !plate) {
      const twinkle = 1 - mood.cloudCover * 0.7;
      for (let i = 0; i < 42; i++) {
        const sx = (((i * 73) % 100) / 100) * W;
        const sy = (((i * 37) % 42) / 100) * H * 0.42 + H * 0.01;
        const big = i % 8 === 0;
        const tw = this.reduce ? 0.6 : 0.3 + 0.55 * Math.abs(Math.sin(t / 900 + i * 1.3));
        ctx.globalAlpha = tw * 0.85 * twinkle;
        ctx.fillStyle = 'rgba(240, 244, 255, 1)';
        ctx.fillRect(sx, sy, big ? 1.7 : 1, big ? 1.7 : 1);
      }
      ctx.globalAlpha = 1;
    }
    if (!plate) {
      const sunX = W * 0.78;
      const sunY = H * 0.14;
      if (night) {
        // a pale moon
        ctx.fillStyle = 'rgba(230,235,250,0.9)';
        ctx.beginPath();
        ctx.arc(sunX, sunY, 11, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // warm bloom
        const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 66);
        glow.addColorStop(0, `rgba(255,224,160,${(0.6 * (1 - mood.cloudCover * 0.7)).toFixed(3)})`);
        glow.addColorStop(1, 'rgba(255,220,150,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H * 0.42);
        // a dimensional sun: bright core → golden rim (not a flat moon-disc)
        const disc = ctx.createRadialGradient(sunX - 5, sunY - 5, 1, sunX, sunY, 16);
        disc.addColorStop(0, 'rgba(255,252,238,1)');
        disc.addColorStop(0.6, 'rgba(255,232,168,1)');
        disc.addColorStop(1, 'rgba(255,204,118,0.95)');
        ctx.fillStyle = disc;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 16, 0, Math.PI * 2);
        ctx.fill();
      }
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
        for (const [ox, oy, r] of [
          [0, 0, 1],
          [0.7, 0.1, 0.72],
          [-0.65, 0.12, 0.62],
          [0.2, -0.14, 0.55],
        ] as const) {
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

    // The whole procedural ground (sea, island landmass, dirt lanes) is the
    // part a painted plate replaces — skip it when one is loaded. (Body left
    // un-reindented to keep the diff minimal; all `island()` uses are inside.)
    if (!plate) {
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
      // A real coastline, not an oval: hand-laid headlands and coves smoothed
      // through midpoints. `inset` scales the ring outward (+) / inward (−)
      // from the island's heart, so rim/sand/meadow layers nest cleanly.
      const island = (inset: number) => {
        const cx = W * 0.5;
        const cy = H * 0.65;
        ctx.beginPath();
        const pts = COASTLINE.map(([px, py]) => {
          const x = px * W;
          const y = py * H;
          const d = Math.hypot(x - cx, y - cy) || 1;
          const k = 1 + inset / d;
          return [cx + (x - cx) * k, cy + (y - cy) * k] as const;
        });
        const n = pts.length;
        ctx.moveTo((pts[0]![0] + pts[n - 1]![0]) / 2, (pts[0]![1] + pts[n - 1]![1]) / 2);
        for (let i = 0; i < n; i++) {
          const p = pts[i]!;
          const q = pts[(i + 1) % n]!;
          ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2);
        }
        ctx.closePath();
      };
      // --- the island as a real landmass rising out of the sea ---
      // shallow turquoise water hugs the shore before the land begins
      island(16);
      ctx.fillStyle = night ? 'rgba(40, 80, 95, 0.35)' : 'rgba(88, 158, 165, 0.35)';
      ctx.fill();
      island(8);
      ctx.fillStyle = night ? 'rgba(52, 96, 110, 0.4)' : 'rgba(116, 182, 182, 0.4)';
      ctx.fill();
      // waves lap the whole outskirt: slow foam rings drift out and fade
      if (!this.reduce) {
        ctx.save();
        for (const ph of [0, 0.45]) {
          const u = (t / 3200 + ph) % 1;
          island(3 + u * 15);
          ctx.strokeStyle = night
            ? `rgba(190, 215, 235, ${(0.28 * (1 - u)).toFixed(3)})`
            : `rgba(240, 250, 252, ${(0.34 * (1 - u)).toFixed(3)})`;
          ctx.lineWidth = 1.8 - u;
          ctx.setLineDash([16, 11]);
          ctx.lineDashOffset = t / 70 + ph * 40;
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
      }
      // rocky, wet under-rim in shadow
      island(5);
      ctx.fillStyle = night ? '#2c281f' : '#3f382c';
      ctx.fill();
      // a warm sand beach hugs the waterline, with a soft foam edge
      island(1);
      ctx.fillStyle = night ? '#4d4636' : '#cdb489';
      ctx.fill();
      ctx.strokeStyle = night ? 'rgba(150, 170, 205, 0.18)' : 'rgba(245, 234, 205, 0.38)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // the green cap: storm-mud heals to a warm meadow green
      island(-3);
      const grass = mix('#5c5636', '#4f6d34', Math.min(1, stage / 3));
      ctx.fillStyle = grass;
      ctx.fill();
      // give the land volume: clip to the meadow, then top-light + edge-shade,
      // dapple the tone so it never reads as one flat fill, and lay real turf.
      ctx.save();
      island(-3);
      ctx.clip();
      // light falls from the sky above; the low edges sit in shadow
      const litG = ctx.createLinearGradient(0, H * 0.32, 0, H);
      if (night) {
        litG.addColorStop(0, 'rgba(130, 150, 185, 0.10)');
        litG.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
        litG.addColorStop(1, 'rgba(8, 12, 20, 0.34)');
      } else {
        litG.addColorStop(0, 'rgba(255, 240, 190, 0.17)');
        litG.addColorStop(0.55, 'rgba(0, 0, 0, 0)');
        litG.addColorStop(1, 'rgba(38, 48, 24, 0.24)');
      }
      ctx.fillStyle = litG;
      ctx.fillRect(0, H * 0.3, W, H * 0.7);
      // dappled meadow — soft lighter/darker blotches for organic variation
      const dapple: [number, number, number][] = [
        [0.3, 0.55, 0.11],
        [0.55, 0.62, 0.13],
        [0.7, 0.5, 0.1],
        [0.2, 0.7, 0.12],
        [0.8, 0.72, 0.1],
        [0.46, 0.76, 0.12],
        [0.62, 0.44, 0.09],
      ];
      for (let i = 0; i < dapple.length; i++) {
        const d = dapple[i]!;
        const g = ctx.createRadialGradient(d[0] * W, d[1] * H, 0, d[0] * W, d[1] * H, d[2] * W);
        g.addColorStop(0, i % 2 === 0 ? 'rgba(158, 182, 96, 0.15)' : 'rgba(38, 58, 26, 0.15)');
        g.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect((d[0] - d[2]) * W, (d[1] - d[2]) * H, d[2] * 2 * W, d[2] * 2 * H);
      }
      // real turf texture — staggered rows, and every other tile mirrored so the
      // sprite's own edges never repeat into visible vertical banding.
      const turf = this.sprite('turf_light');
      if (turf) {
        const ts = Math.max(44, W * 0.13);
        ctx.globalAlpha = 0.28 * Math.min(1, stage / 2 + 0.25);
        let row = 0;
        for (let yy = H * 0.33; yy < H * 0.98; yy += ts - 1) {
          const off = (row % 2) * (ts / 2);
          let col = 0;
          for (let xx = -ts + off; xx < W + ts; xx += ts - 1) {
            const flip = (col + row) % 2 === 0 ? 1 : -1;
            ctx.save();
            ctx.translate(xx + ts / 2, yy + ts / 2);
            ctx.scale(flip, 1);
            ctx.drawImage(turf, -ts / 2, -ts / 2, ts + 1, ts + 1);
            ctx.restore();
            col++;
          }
          row++;
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();

      // --- worn dirt paths grow WITH the town: each lane appears only when the
      // building it leads to has been restored (a path to nowhere reads wrong) ---
      {
        const routes: { at: number; pts: [number, number][] }[] = [
          {
            at: 2,
            pts: [
              [0.47, 0.64],
              [0.36, 0.59],
              [0.27, 0.545],
            ],
          }, // heart → cottage
          {
            at: 8,
            pts: [
              [0.475, 0.655],
              [0.46, 0.55],
              [0.44, 0.465],
            ],
          }, // well → market
          {
            at: 12,
            pts: [
              [0.44, 0.465],
              [0.505, 0.4],
            ],
          }, // market → town hall
          {
            at: 15,
            pts: [
              [0.27, 0.545],
              [0.17, 0.455],
            ],
          }, // cottage → workshop
          {
            at: 16,
            pts: [
              [0.13, 0.655],
              [0.24, 0.625],
              [0.36, 0.615],
              [0.47, 0.64],
            ],
          }, // farm → heart
          {
            at: 18,
            pts: [
              [0.49, 0.65],
              [0.62, 0.53],
              [0.72, 0.63],
              [0.84, 0.6],
            ],
          }, // heart → bakery → garden → hut
          {
            at: 21,
            pts: [
              [0.36, 0.615],
              [0.3, 0.7],
              [0.335, 0.735],
            ],
          }, // → sawmill / forge
          {
            at: 22,
            pts: [
              [0.52, 0.685],
              [0.66, 0.77],
              [0.78, 0.85],
            ],
          }, // heart → the docks
          {
            at: 23,
            pts: [
              [0.52, 0.685],
              [0.575, 0.75],
            ],
          }, // → library
        ];
        ctx.save();
        island(-3);
        ctx.clip();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const layers: [number, string][] = [
          [W * 0.024, night ? 'rgba(26, 22, 15, 0.30)' : 'rgba(122, 98, 62, 0.30)'], // soft shadowed edge
          [W * 0.014, night ? 'rgba(150, 132, 98, 0.4)' : 'rgba(205, 178, 128, 0.7)'], // warm trodden dirt
        ];
        for (const [lw, col] of layers) {
          ctx.strokeStyle = col;
          ctx.lineWidth = lw;
          for (const r of routes) {
            if (delivered < r.at) continue;
            const pts = r.pts;
            ctx.beginPath();
            ctx.moveTo(pts[0]![0] * W, pts[0]![1] * H);
            // gentle midpoint curves so lanes wander like trodden dirt, not rulers
            for (let i = 1; i < pts.length - 1; i++) {
              const p = pts[i]!;
              const q = pts[i + 1]!;
              ctx.quadraticCurveTo(p[0] * W, p[1] * H, ((p[0] + q[0]) / 2) * W, ((p[1] + q[1]) / 2) * H);
            }
            const last = pts[pts.length - 1]!;
            ctx.lineTo(last[0] * W, last[1] * H);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    } // end if (!plate) — the painted plate stands in for the procedural ground

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
      ruinVariant?: number;
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
    // Every building stands on the island from the very first day as a storm-worn
    // ruin, so the player can see the whole town they're rebuilding. Each turns to
    // scaffold when it's next in line, then to its finished (and later upgraded)
    // sprite once restored. Props (well, notice board) have no ruin art, so they
    // wait until they're unlocked rather than showing an odd shaded ghost.
    const upcoming = TOWN_BUILDINGS.filter((b) => b.unlockAt > delivered)
      .map((b) => b.unlockAt)
      .sort((a, b) => a - b);
    const nextUnlock = upcoming.length ? upcoming[0]! : -1; // the one being rebuilt now → scaffold
    const pieces: ScenePiece[] = [
      ...TOWN_TERRAIN.filter((t) => !FLAT.has(t.art) && delivered >= t.unlockAt),
      ...TOWN_NATURE.filter(
        (n) => stage >= n.stage && delivered >= n.unlockAt && (n.untilStage === undefined || stage <= n.untilStage),
      ),
      ...TOWN_BUILDINGS.filter((b) => delivered >= b.unlockAt || b.ruinVariant !== undefined).map((b) => ({
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
      // buildings read bigger against the detailed painted plate so the town
      // stands out from the landscape; props/nature keep their scale.
      const w = p.w * W * (plate && BUILDING_INFO[p.art] ? 1.04 : 1);
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
        // Small props (the well) draw at a fraction of a building's footprint —
        // pad their tap target so they're not needle-thin to hit on a touch screen.
        const pad = Math.max(0, 22 - w / 2);
        this.hitboxes.push({
          x0: p.x * W - w / 2 - pad,
          y0: p.y * H - h - pad,
          x1: p.x * W + w / 2 + pad,
          y1: p.y * H + pad,
          art: p.art,
          unlockAt: p.ruined ? -p.unlockAt : p.unlockAt,
        });
      }
      if (p.ruined) {
        // Purpose-built storm-damage / scaffold art (Buildings2). The next
        // building to be restored shows as under-construction (scaffold); the
        // ones further out show as storm-damaged ruins. Props with no variant
        // fall back to the procedural shade.
        const isNext = p.unlockAt === nextUnlock;
        let ruinArt: string | undefined;
        // Prefer this building's OWN storm-damaged / scaffold art (matched
        // ruin→build→upgrade set), so the ruin actually looks like the building.
        const ownWip = `${p.art}_wip`;
        const ownRuin = `${p.art}_ruin`;
        if (isNext && this.sprite(ownWip)) ruinArt = ownWip;
        else if (this.sprite(ownRuin)) ruinArt = ownRuin;
        // fall back to the generic ruin/scaffold pool by variant index
        if (!ruinArt && p.ruinVariant !== undefined) {
          const wip = `town_wip_${p.ruinVariant}`;
          const ruin = `town_ruin_${p.ruinVariant}`;
          if (isNext && this.sprite(wip)) ruinArt = wip;
          else if (this.sprite(ruin)) ruinArt = ruin;
        }
        const rimg = ruinArt ? this.sprite(ruinArt) : undefined;
        if (rimg) {
          const rw = p.w * W * (plate && BUILDING_INFO[p.art] ? 1.04 : 1);
          const rh = rw * (rimg.naturalHeight / rimg.naturalWidth);
          ctx.save();
          ctx.globalAlpha = p.unlockAt === nextUnlock ? 0.97 : 0.85; // distant ruins recede a touch
          ctx.drawImage(rimg, p.x * W - rw / 2, p.y * H - rh, rw, rh);
          ctx.restore();
          continue;
        }
        // fallback: procedural shade for props / any missing variant art
        ctx.save();
        ctx.globalAlpha = 0.55;
        ctx.drawImage(this.ruinShade(img, artId), p.x * W - w / 2, p.y * H - h, w, h);
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
      // Ground the building into the meadow: a soft warm earth "pad" blends its
      // footprint into the painted terrain (so it doesn't look pasted on), then a
      // darker contact shadow sits it down. The pad is static (drawn even under
      // reduced-motion, where it does the visual grounding); the shadow layers on.
      if (BUILDING_INFO[p.art]) {
        const bx = p.x * W;
        const by = p.y * H - h * 0.02;
        // warm groomed-earth pad — wide + whisper-subtle so it only softens the
        // seam between building and painted ground, never reads as a dirt blob
        const pad = ctx.createRadialGradient(bx, by, 2, bx, by, w * 0.66);
        pad.addColorStop(0, 'rgba(150, 128, 78, 0.14)');
        pad.addColorStop(0.6, 'rgba(150, 128, 78, 0.07)');
        pad.addColorStop(1, 'rgba(150, 128, 78, 0)');
        ctx.save();
        ctx.translate(bx, by);
        ctx.scale(1, 0.32);
        ctx.fillStyle = pad;
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.68, 0, Math.PI * 2);
        ctx.fill();
        // darker contact shadow, tighter under the base
        const sh = ctx.createRadialGradient(0, 0, 2, 0, 0, w * 0.5);
        sh.addColorStop(0, 'rgba(18, 24, 14, 0.32)');
        sh.addColorStop(1, 'rgba(18, 24, 14, 0)');
        ctx.fillStyle = sh;
        ctx.beginPath();
        ctx.arc(0, 0, w * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, p.x * W - (w * scale) / 2, p.y * H - h * scale, w * scale, h * scale);
      ctx.globalAlpha = 1;
      // a brief flame flourish as a building first rises — Emberhollow rekindled
      if (born !== undefined && !this.reduce) {
        const age = (performance.now() - born) / 900;
        if (age < 1) {
          ctx.save();
          ctx.globalAlpha = (1 - age) * 0.85;
          this.drawFlame(ctx, 'fx_flame_medium', p.x * W, p.y * H, w * (0.45 + age * 0.35), t);
          ctx.restore();
        }
      }
      const dusk = tod.weights.dusk > 0.25;
      const dawn = tod.weights.dawn > 0.25;
      const dim = night || dusk || dawn;
      // cosy warmth spills from the windows of restored homes once the light
      // fails — the single biggest "someone lives here" cue. Homes now light up
      // ONE BY ONE across the real dusk→night window (a per-home offset), not all
      // at once, and a little morning warmth lingers at dawn.
      if (BUILDING_INFO[p.art] && !this.reduce) {
        const evening = Math.min(1, tod.weights.dusk * 0.7 + tod.weights.night); // 0 day → 1 deep night
        const off = (((Math.sin(p.x * 127.1 + p.y * 311.7) * 43758.5453) % 1) + 1) % 1; // stable 0..1 per home
        const lit = evening > off * 0.55 ? (evening - off * 0.55) / (1 - off * 0.55) : 0; // ramps once past its hour
        const glow = Math.max(lit, tod.weights.dawn * 0.45); // homes still cosy at first light
        if (glow > 0.02) {
          const cx = p.x * W;
          const cy = p.y * H - h * 0.4;
          const k = glow * 0.5 * (0.93 + 0.07 * Math.sin(t / 820 + p.x * 40)); // gentle candle-flicker
          const warm = ctx.createRadialGradient(cx, cy, 1, cx, cy, w * 0.6);
          warm.addColorStop(0, `rgba(255, 198, 120, ${k.toFixed(3)})`);
          warm.addColorStop(1, 'rgba(255, 190, 110, 0)');
          ctx.fillStyle = warm;
          ctx.fillRect(cx - w * 0.7, cy - h * 0.55, w * 1.4, h * 1.05);
        }
      }
      // street lamps cast a warm pool on the ground + a glowing head at dusk/night
      if (dim && p.art === 'prop_lamp' && !this.reduce) {
        const lx = p.x * W;
        const ly = p.y * H;
        const lampFlick = 0.82 + 0.18 * Math.abs(Math.sin(t / 118 + p.x * 25));
        const pool = ctx.createRadialGradient(lx, ly, 1, lx, ly, w * 2.6);
        pool.addColorStop(0, `rgba(255, 210, 130, ${0.32 * (0.9 + (0.1 * (lampFlick - 0.82)) / 0.18)})`);
        pool.addColorStop(1, 'rgba(255, 200, 120, 0)');
        ctx.fillStyle = pool;
        ctx.save();
        ctx.translate(lx, ly);
        ctx.scale(1, 0.42);
        ctx.beginPath();
        ctx.arc(0, 0, w * 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        const head = ctx.createRadialGradient(lx, ly - h * 0.82, 0, lx, ly - h * 0.82, w * 0.9);
        head.addColorStop(0, `rgba(255, 226, 150, ${0.6 * lampFlick})`);
        head.addColorStop(1, 'rgba(255, 226, 150, 0)');
        ctx.fillStyle = head;
        ctx.fillRect(lx - w, ly - h * 0.82 - w, w * 2, w * 2);
      }
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
          ctx.arc(
            sx + Math.sin(t / 700 + i) * 2.5 - mood.wind * 9 * (i + 1) * 0.4,
            puffY,
            2.5 + i * 1.2,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
    }

    // --- villagers amble their rounds once their stories are told ---
    // The village reads the sky: most folk head home after dark and shelter from
    // a storm (the streets empty), while a lively real-world walk (villagersOut =
    // your steps) brings more of them out. A deterministic subset, so it's steady.
    const wkNight = night ? 0.4 : 1;
    const wkWeather = mood.weather === 'storm' ? 0.12 : mood.weather === 'rain' ? 0.55 : 1;
    const wkPresence = Math.min(1, (0.55 + mood.villagersOut * 0.55) * wkNight * wkWeather);
    let wkIdx = -1;
    for (const wk of TOWN_WALKERS) {
      wkIdx++;
      if (delivered < wk.unlockAt) continue;
      if ((wkIdx + 0.5) / TOWN_WALKERS.length > wkPresence) continue; // gone home / sheltering
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
      // map-scale people: ~a quarter of a cottage's height, like the reference
      const w = 0.027 * W;
      const h = w * (img.naturalHeight / img.naturalWidth);
      const facingLeft = b.x < a.x !== phase >= 1;
      // a soft shadow so villagers stand on the ground, not float above it
      if (!this.reduce) {
        ctx.fillStyle = 'rgba(20, 26, 16, 0.22)';
        ctx.beginPath();
        ctx.ellipse(x, y - 1, w * 0.4, w * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
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

    // --- the village dog trots its rounds near the heart of town ---
    {
      const dog = this.sprite('animal_dog');
      if (dog && delivered >= 6) {
        const path = [
          [0.34, 0.63],
          [0.46, 0.665],
          [0.4, 0.705],
          [0.3, 0.67],
        ] as const;
        const total = path.length - 1;
        const phase = this.reduce ? 0.3 : (t / 1000 / 12) % 2;
        const u = phase < 1 ? phase : 2 - phase;
        const seg = Math.min(total - 1, Math.floor(u * total));
        const local = u * total - seg;
        const a = path[seg]!;
        const b = path[seg + 1]!;
        const dx = (a[0] + (b[0] - a[0]) * local) * W;
        const dy = (a[1] + (b[1] - a[1]) * local) * H;
        const dw = 0.03 * W;
        const dh = dw * (dog.naturalHeight / dog.naturalWidth);
        const left = b[0] < a[0] !== phase >= 1;
        if (!this.reduce) {
          ctx.fillStyle = 'rgba(20, 26, 16, 0.22)';
          ctx.beginPath();
          ctx.ellipse(dx, dy - 1, dw * 0.42, dw * 0.14, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.save();
        if (left) {
          ctx.translate(dx, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(dog, -dw / 2, dy - dh, dw, dh);
        } else {
          ctx.drawImage(dog, dx - dw / 2, dy - dh, dw, dh);
        }
        ctx.restore();
      }
    }

    // --- laundry sways between the homes once the village warms (Codex: "the
    // world quietly lives... laundry sways") — cloth catching the sea breeze ---
    if (stage >= 2 && !this.reduce) {
      const lines: [number, number, number, number][] = [
        [0.2, 0.5, 0.3, 0.5], // by the cottage
        [0.06, 0.61, 0.15, 0.6], // by the farm
      ];
      const cloths = ['#f0e6d2', '#a8c8e0', '#e6a8b8', '#bcd0a0'];
      for (const [x1n, y1n, x2n, y2n] of lines) {
        const x1 = x1n * W;
        const y1 = y1n * H;
        const x2 = x2n * W;
        const y2 = y2n * H;
        const sag = (x2 - x1) * 0.12;
        ctx.strokeStyle = 'rgba(60, 48, 32, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + sag, x2, y2);
        ctx.stroke();
        const n = 3;
        for (let i = 0; i < n; i++) {
          const f = (i + 1) / (n + 1);
          const hx = x1 + (x2 - x1) * f;
          const hy = y1 + (y2 - y1) * f + sag * (1 - (2 * f - 1) * (2 * f - 1));
          const cw = (x2 - x1) * 0.16;
          const ch = cw * 1.5;
          const sway = Math.sin(t / 700 + i * 1.3 + x1) * (0.12 + mood.wind * 0.25);
          ctx.save();
          ctx.translate(hx, hy);
          ctx.rotate(sway);
          ctx.fillStyle = cloths[i % cloths.length]!;
          ctx.fillRect(-cw / 2, 0, cw, ch);
          ctx.fillStyle = 'rgba(60, 48, 32, 0.7)';
          ctx.fillRect(-1, -1, 2, 3);
          ctx.restore();
        }
      }
    }

    // --- small lives: gulls always wheel over the harbour; the cat later ---
    if (stage >= 3) {
      const cat = this.sprite('animal_cat');
      if (cat) {
        const w = 0.032 * W;
        ctx.drawImage(
          cat,
          W * 0.545,
          H * 0.665 - w * (cat.naturalHeight / cat.naturalWidth),
          w,
          w * (cat.naturalHeight / cat.naturalWidth),
        );
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

    // --- a gathering hearth-fire warms the town square once the plaza returns ---
    if (delivered >= 6) {
      const fx = W * 0.46;
      const fy = H * 0.715;
      // the gathering fire grows as Emberhollow heals: a spark, then a hearth, then a bonfire
      const fireArt = delivered >= 16 ? 'fx_flame_large' : delivered >= 10 ? 'fx_flame_medium' : 'fx_flame_small';
      const fw = W * (delivered >= 16 ? 0.084 : delivered >= 10 ? 0.07 : 0.056);
      // warm, flattened ground glow pooling under the fire
      const flicker = this.reduce ? 1 : 0.85 + 0.15 * Math.sin(t / 110);
      const glow = ctx.createRadialGradient(fx, fy, 2, fx, fy, fw * 1.6);
      glow.addColorStop(0, `rgba(255, 178, 92, ${0.5 * flicker})`);
      glow.addColorStop(1, 'rgba(255, 168, 80, 0)');
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(1, 0.4);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, fw * 1.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      this.drawFlame(ctx, fireArt, fx, fy, fw, t);
    }

    // --- the forge burns once the blacksmith is raised (a working fire, day + night) ---
    if (delivered >= 21) {
      const gx = W * 0.45; // tracks the blacksmith's map position (town-layout)
      const gy = H * 0.86;
      const fl = this.reduce ? 1 : 0.78 + 0.22 * Math.abs(Math.sin(t / 95));
      const r = W * 0.052;
      const fg = ctx.createRadialGradient(gx, gy, 1, gx, gy, r);
      fg.addColorStop(0, `rgba(255, 150, 60, ${0.55 * fl})`);
      fg.addColorStop(1, 'rgba(255, 128, 48, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(gx, gy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // --- the painted lighthouse keeps its watch from the eastern rock point ---
    {
      // Four painted states track the beacon's story: storm-wrecked ruin →
      // under-construction scaffold (the beat being rebuilt) → lit (order 9) →
      // a flourishing keeper's lighthouse once the town is well restored.
      const lit = delivered >= 9; // the beacon story beat
      const artId =
        delivered >= 20
          ? 'prop_lighthouse_l2'
          : delivered >= 9
            ? 'prop_lighthouse'
            : delivered === 8
              ? 'prop_lighthouse_wip'
              : 'prop_lighthouse_ruin';
      const img = this.sprite(artId) ?? this.sprite('prop_lighthouse');
      // Off the east point, standing in the sea clear of the fisher hut — its
      // own rock base sits over open water, not up on the green land plate.
      // Sprites are mirrored on disk so the keeper's door faces the land.
      const lx = W * 0.94;
      const baseY = H * 0.59;
      if (img) {
        // the new painted lighthouse is a tall portrait sprite with its own rock
        // base, so it's narrower than the old near-square art (0.23 dwarfed the map).
        const lw = W * 0.15;
        const lh = lw * (img.naturalHeight / img.naturalWidth);
        ctx.drawImage(img, lx - lw / 2, baseY - lh, lw, lh);
        // Tappable once the beacon is lit — opens The Lighthouse card (Beacon Drop).
        this.hitboxes.push({
          x0: lx - lw / 2,
          y0: baseY - lh,
          x1: lx + lw / 2,
          y1: baseY,
          art: 'prop_lighthouse',
          unlockAt: lit ? 9 : -9,
        });
        // the lantern room's height differs per state (measured from the art)
        const lanternFrac = artId === 'prop_lighthouse_l2' ? 0.81 : 0.88;
        const oy = baseY - lh * lanternFrac;
        if (lit) {
          // the beacon fire itself, burning in the lantern room
          this.drawFlame(ctx, 'fx_flame_beacon', lx, oy + lh * 0.09, lw * 0.5, t);
          // warm lantern-room bloom
          const g = ctx.createRadialGradient(lx, oy, 2, lx, oy, lw * 0.55);
          // the beacon burns, not just glows — a gentle fire flicker on the bloom
          const bFlick = this.reduce ? 1 : 0.78 + 0.22 * Math.abs(Math.sin(t / 130));
          g.addColorStop(0, `rgba(255, 232, 168, ${0.8 * bFlick})`);
          g.addColorStop(1, 'rgba(255, 232, 168, 0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(lx, oy, lw * 0.55, 0, Math.PI * 2);
          ctx.fill();
          // sweeping beam
          if (!this.reduce) {
            const ang = Math.sin(t / 1500) * 0.5 - 0.25;
            const beam = ctx.createLinearGradient(lx, oy, lx - 170 * Math.cos(ang), oy - 90 * Math.sin(ang));
            beam.addColorStop(0, 'rgba(255, 232, 168, 0.42)');
            beam.addColorStop(1, 'rgba(255, 232, 168, 0)');
            ctx.fillStyle = beam;
            ctx.beginPath();
            ctx.moveTo(lx, oy);
            ctx.lineTo(lx - 180 * Math.cos(ang - 0.11), oy - 110 * Math.sin(ang - 0.11));
            ctx.lineTo(lx - 180 * Math.cos(ang + 0.11), oy - 110 * Math.sin(ang + 0.11));
            ctx.closePath();
            ctx.fill();
          }
        }
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
          const wx = (((i * 137 + Math.floor(t / 1400) * 41) % 100) / 100) * W;
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
      // A mid-height veil, plus low coastal banks that drift with the real wind
      // and hug the shore — sea fog rolling in, not a flat grey stripe.
      const fog = ctx.createLinearGradient(0, H * 0.3, 0, H * 0.62);
      fog.addColorStop(0, 'rgba(205, 214, 228, 0)');
      fog.addColorStop(0.5, 'rgba(205, 214, 228, 0.3)');
      fog.addColorStop(1, 'rgba(205, 214, 228, 0)');
      ctx.fillStyle = fog;
      ctx.fillRect(0, H * 0.28, W, H * 0.36);
      if (!this.reduce) {
        const windX = this.windX();
        const drift = ((t * 0.006 * windX) % (W * 0.5)) + W * 0.5;
        ctx.fillStyle = 'rgba(214, 222, 234, 0.16)';
        for (let i = 0; i < 4; i++) {
          const bx = (((i * W) / 3 + drift) % (W * 1.4)) - W * 0.2;
          const by = H * (0.62 + (i % 2) * 0.06);
          ctx.beginPath();
          ctx.ellipse(bx, by, W * 0.34, H * 0.05, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    if (mood.precip > 0 && !this.reduce) {
      const snow = mood.weather === 'snow';
      const n = Math.round(24 + mood.precip * (snow ? 30 : 60));
      const windX = this.windX(); // real wind direction drives the slant/drift
      if (snow) {
        ctx.fillStyle = 'rgba(240, 244, 252, 0.8)';
        const driftX = windX * (0.006 + mood.wind * 0.02); // flakes carried by the wind
        for (let i = 0; i < n; i++) {
          const px = (((i * 97 + t * driftX * 60) % W) + W) % W;
          const py = (((i * 61 + t * (0.02 + mood.precip * 0.015)) % H) + H) % H;
          ctx.beginPath();
          ctx.arc(
            px + Math.sin(t / 900 + i) * 4 + windX * (2 + mood.wind * 6),
            py,
            1.3 + (i % 3) * 0.4,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = 'rgba(190, 210, 235, 0.4)';
        ctx.lineWidth = 1;
        // Heavier rain slants harder and falls faster (continuous intensity).
        const slant = (2 + mood.wind * 6) * windX;
        for (let i = 0; i < n; i++) {
          const px = (((i * 83 + t * 0.05) % W) + W) % W;
          const py = (((i * 47 + t * (0.14 + mood.precip * 0.1)) % H) + H) % H;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + slant, py + 7 + mood.precip * 4);
          ctx.stroke();
        }
      }
    }

    // --- ambient environment effects (Batch 11) — the small motions that
    // make Emberhollow feel like weather and light are passing through ---
    if (!this.reduce) this.drawAmbientEffects(ctx, W, H, t, night, hour, mood, stage);

    // --- your day, reflected: real-world actions bloom in the town ---
    // (see src/core/world-mood.ts — every reaction only ever brightens the scene)
    this.drawReactions(ctx, W, H, t, night, mood, delivered);
    // One-shot onset cues (the *felt* moment a real action lands), on top.
    this.onsets.draw(ctx, W, H, this.reduce);
  }

  /**
   * The living-world flourishes that answer the player's real-world day:
   * a sleep-warmed glow, water sparkling the well and blooming the gardens,
   * a busier road after a walk, and festival banners for a long streak.
   * Kept apart from drawTown's scenery so the mapping stays legible.
   */
  /**
   * A whole-viewport warm colour grade that deepens with the hearth glow (sleep +
   * meditation). Purely additive warmth — it only ever makes the town feel cosier,
   * never cooler or darker (pillar: reflect, never punish). Static, so reduced-
   * motion is unaffected. Drawn outside the camera transform to cover the viewport.
   */
  /**
   * Time-of-day island lighting over the painted plate, matching the Style-Lock
   * lighting reference (Morning / Golden Hour / Night + Lantern Light). Driven by
   * the SAME phaseForHour() the corner time badge reads, so the whole island's
   * ambience and the medallion always agree. The painted plate is a bright,
   * top-down daytime island; these washes recolour it for each phase (a warm key
   * with a cool opposite shadow gives a sense of low-sun direction), and the
   * existing per-lamp pools (prop_lamp) add local lantern light on top at night.
   */
  private applyTimeLight(ctx: CanvasRenderingContext2D, W: number, H: number, t: number): void {
    // Blend the four lighting washes by the player's REAL solar position, so the
    // island glows gold at their true sunset and darkens to night when it is
    // actually dark where they are — with smooth crossfades, never hard bands.
    // (Falls back to fixed clock bands when the sun times aren't known yet.)
    const { weights } = phaseForTime(Date.now(), this.sunTimesFromWeather());
    // Where the sun really is: its screen-side (warm key from there, cool shadow
    // opposite) and how low it sits (low sun → longer, more directional light).
    const sun = this.sunKey();
    ctx.save();
    // Order matters for the composited crossfade: darken first, then warm/cool.
    if (weights.night > 0.001) this.washNight(ctx, W, H, t, weights.night);
    if (weights.dawn > 0.001) this.washDawn(ctx, W, H, weights.dawn, sun);
    if (weights.day > 0.001) this.washDay(ctx, W, H, weights.day);
    if (weights.dusk > 0.001) this.washDusk(ctx, W, H, weights.dusk, sun);
    // A warm rim of light hugging the sun-facing edge when the sun is low — the
    // "backlight" beat that makes golden hour feel like it comes from somewhere.
    if ((weights.dawn > 0.001 || weights.dusk > 0.001) && sun) {
      this.washRimLight(ctx, W, H, sun, Math.max(weights.dawn, weights.dusk));
    }
    ctx.restore();
  }

  /**
   * The sun's real bearing translated to the painted scene: a unit vector toward
   * where the light comes FROM (east = right, west = left, south = toward the
   * viewer) and `lowness` 0..1 that peaks when the sun is on the horizon. Null
   * when we have no location — callers then fall back to the authored directions.
   */
  private sunKey(): { dx: number; dy: number; lowness: number } | null {
    const coords = latestCoords();
    if (!coords) return null;
    const { azimuth, altitude } = sunPosition(Date.now(), coords);
    // SunCalc azimuth: 0 = south, +π/2 = west, −π/2 = east. Screen: west is left.
    const dx = -Math.sin(azimuth);
    const dy = Math.cos(azimuth); // south → +y (down, toward the viewer)
    const lowness = Math.max(0, Math.min(1, 1 - Math.sin(Math.max(0, altitude)) / 0.5));
    return { dx, dy, lowness };
  }

  /** A corner point on the viewport in the direction (dx,dy) from centre. */
  private static edgePoint(W: number, H: number, dx: number, dy: number, sign: number): [number, number] {
    return [W * (0.5 + sign * dx * 0.5), H * (0.5 + sign * dy * 0.5)];
  }

  /** Morning: cool, soft, hazy — warm key from the real sun, cool shadow opposite. */
  private washDawn(ctx: CanvasRenderingContext2D, W: number, H: number, k: number, sun: SunKey): void {
    const [kx, ky, sx, sy] = sun
      ? [...MapView.edgePoint(W, H, sun.dx, sun.dy, 1), ...MapView.edgePoint(W, H, sun.dx, sun.dy, -1)]
      : [0, 0, W, H]; // fallback: authored top-left key
    const contrast = sun ? 0.14 + 0.1 * sun.lowness : 0.14;
    const g = ctx.createLinearGradient(kx, ky, sx, sy);
    g.addColorStop(0, `rgba(255, 222, 172, ${(contrast * k).toFixed(3)})`); // warm key
    g.addColorStop(1, `rgba(140, 170, 220, ${(0.22 * k).toFixed(3)})`); // cool dawn shadow
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(198, 210, 236, ${(0.12 * k).toFixed(3)})`; // faint cool haze
    ctx.fillRect(0, 0, W, H);
  }

  /** Brightest, near-neutral daylight with a clean warm lift. */
  private washDay(ctx: CanvasRenderingContext2D, W: number, H: number, k: number): void {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = `rgba(255, 250, 232, ${(0.12 * k).toFixed(3)})`;
    ctx.fillRect(0, 0, W, H);
  }

  /** Golden hour: amber wash, warm key from the real sun's side (its true azimuth). */
  private washDusk(ctx: CanvasRenderingContext2D, W: number, H: number, k: number, sun: SunKey): void {
    const [kx, ky, sx, sy] = sun
      ? [...MapView.edgePoint(W, H, sun.dx, sun.dy, 1), ...MapView.edgePoint(W, H, sun.dx, sun.dy, -1)]
      : [0, H, W, 0]; // fallback: authored lower-left (west) key
    const amber = sun ? 0.3 + 0.12 * sun.lowness : 0.34;
    const g = ctx.createLinearGradient(kx, ky, sx, sy);
    g.addColorStop(0, `rgba(255, 146, 66, ${(amber * k).toFixed(3)})`); // amber, sun side
    g.addColorStop(1, `rgba(214, 107, 107, ${(0.12 * k).toFixed(3)})`); // dusky rose, shadow
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /** A warm backlight rim on the sun-facing edge, strongest with a low sun. */
  private washRimLight(ctx: CanvasRenderingContext2D, W: number, H: number, sun: NonNullable<SunKey>, k: number): void {
    const [kx, ky] = MapView.edgePoint(W, H, sun.dx, sun.dy, 1);
    const r = ctx.createRadialGradient(kx, ky, 0, kx, ky, Math.max(W, H) * 0.7);
    const a = 0.16 * k * sun.lowness;
    if (a < 0.004) return;
    r.addColorStop(0, `rgba(255, 214, 150, ${a.toFixed(3)})`);
    r.addColorStop(1, 'rgba(255, 214, 150, 0)');
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = r;
    ctx.fillRect(0, 0, W, H);
  }

  /** Night: deep-blue darken, then a warm hearth lift at the town centre. */
  private washNight(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, k: number): void {
    // Real moonlight: a full moon lifts the night a touch (less dark, faint
    // silver), a new moon leaves it darkest — the sky is brighter when the moon
    // really is full tonight.
    const moon = illumination(Date.now()); // 0 new .. 1 full
    const darkenScale = 1 - 0.18 * moon; // full moon → up to 18% less darkening
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(26, 34, 74, ${(0.6 * k * darkenScale).toFixed(3)})`); // night blue (palette)
    g.addColorStop(1, `rgba(12, 18, 44, ${(0.72 * k * darkenScale).toFixed(3)})`);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'screen';
    if (moon > 0.5) {
      // a cool silver wash on bright-moon nights
      ctx.fillStyle = `rgba(150, 165, 205, ${(0.06 * (moon - 0.5) * 2 * k).toFixed(3)})`;
      ctx.fillRect(0, 0, W, H);
    }
    const warm = (0.1 + (this.reduce ? 0 : 0.02 * Math.sin(t / 1400))) * k;
    const hearth = ctx.createRadialGradient(W * 0.5, H * 0.44, 10, W * 0.5, H * 0.44, W * 0.55);
    hearth.addColorStop(0, `rgba(255, 184, 96, ${warm.toFixed(3)})`);
    hearth.addColorStop(1, 'rgba(255, 184, 96, 0)');
    ctx.fillStyle = hearth;
    ctx.fillRect(0, 0, W, H);
  }

  /**
   * Storm atmosphere over the whole viewport (outside the camera): a gentle,
   * DISTANT lightning glow — a soft blue-white bloom that swells and fades, with
   * a small after-flicker — never a harsh strike (cozy-but-legible). Plus a
   * faint wet sheen while rain falls. Deterministic from `t` so it doesn't
   * flicker frame-to-frame; caller gates on reduced-motion.
   */
  private applyStormFx(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, mood: WorldMood): void {
    ctx.save();
    if (mood.weather === 'storm') {
      const period = 10_000; // ~10s between flashes
      const local = t % period;
      const dur = 340;
      // One thunder roll per flash, phase-locked: fire as the period rolls over
      // (feedback.thunder delays the sound so it trails the light, like distance).
      const cycle = Math.floor(t / period);
      if (cycle !== this.lastThunderCycle) {
        this.lastThunderCycle = cycle;
        feedback.thunder();
      }
      if (local < dur) {
        const x = local / dur; // 0..1 through the flash
        const k = Math.max(0, Math.sin(x * Math.PI)) * (x < 0.4 ? 1 : 0.55); // main + after-flicker
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, `rgba(214, 226, 255, ${(0.26 * k).toFixed(3)})`); // brightest at the sky
        g.addColorStop(0.55, `rgba(200, 214, 246, ${(0.12 * k).toFixed(3)})`);
        g.addColorStop(1, 'rgba(200, 214, 246, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      }
    }
    // Wet sheen: a faint cool specular lift on the lower island/sea while rain
    // falls, so the ground reads as glistening-wet, not just dotted with lines.
    if ((mood.weather === 'rain' || mood.weather === 'storm') && mood.precip > 0.05) {
      ctx.globalCompositeOperation = 'soft-light';
      const sheen = ctx.createLinearGradient(0, H * 0.5, 0, H);
      const a = Math.min(0.1, 0.04 + mood.precip * 0.08);
      sheen.addColorStop(0, 'rgba(190, 208, 236, 0)');
      sheen.addColorStop(1, `rgba(190, 208, 236, ${a.toFixed(3)})`);
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  private applyColourGrade(ctx: CanvasRenderingContext2D, W: number, H: number, mood: WorldMood): void {
    const warmth = Math.max(0, mood.glow - 0.25); // 0 until a restful day earns it
    if (warmth <= 0.001) return;
    const a = Math.min(0.13, warmth * 0.18);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(255, 214, 150, ${a.toFixed(3)})`);
    g.addColorStop(1, `rgba(255, 190, 120, ${(a * 0.5).toFixed(3)})`);
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  private drawReactions(
    ctx: CanvasRenderingContext2D,
    W: number,
    H: number,
    t: number,
    night: boolean,
    mood: WorldMood,
    delivered: number,
  ): void {
    const FLOWER_COLOURS = ['#e6739a', '#ffd27a', '#a06be0', '#f2996b', '#7fbf6a'];

    // Sleep + meditation → the hearth's warmth spreads across the whole town.
    if (mood.glow > 0.3 && !this.reduce) {
      const pulse = mood.glow * 0.11 + 0.03 * Math.sin(t / (mood.calm ? 2400 : 1600));
      const glow = ctx.createRadialGradient(W * 0.5, H * 0.5, 10, W * 0.5, H * 0.5, W * 0.55);
      glow.addColorStop(0, `rgba(255, 200, 120, ${pulse.toFixed(3)})`);
      glow.addColorStop(1, 'rgba(255, 200, 120, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
    }

    // Long streak → festival banners gather over the rooftops, more each day.
    if (mood.festive > 0) {
      const flags = 4 + Math.round(mood.festive * 8);
      const y0 = H * 0.3;
      const x0 = W * 0.14;
      const x1 = W * 0.72;
      const sag = 10 + mood.festive * 6;
      ctx.save();
      ctx.strokeStyle = 'rgba(60, 46, 30, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2, y0 + sag * 2, x1, y0 - H * 0.02);
      ctx.stroke();
      for (let i = 0; i <= flags; i++) {
        const f = i / flags;
        const fx = x0 + (x1 - x0) * f;
        // follow the catenary of the string
        const fy = y0 + sag * 2 * (1 - (2 * f - 1) * (2 * f - 1)) - H * 0.02 * f;
        const col = FLOWER_COLOURS[i % FLOWER_COLOURS.length]!;
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(fx - 4, fy);
        ctx.lineTo(fx + 4, fy);
        ctx.lineTo(fx, fy + 8);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Water + stretch → the gardens green up: a soft vitality over the meadow
    // and a few flowers by the garden plot once it's been restored.
    if (mood.gardenLush > 0) {
      const gx = W * 0.63; // the garden's live map position (town-layout)
      const gy = H * 0.57;
      const gr = W * 0.16;
      const g = ctx.createRadialGradient(gx, gy - gr * 0.25, gr * 0.15, gx, gy - gr * 0.25, gr);
      g.addColorStop(0, `rgba(126, 196, 106, ${(0.08 + mood.gardenLush * 0.14).toFixed(3)})`);
      g.addColorStop(1, 'rgba(126, 196, 106, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(gx - gr, gy - gr, gr * 2, gr * 1.5);
    }

    // Nature photo + water → flowers bloom, a richer band the more you tend.
    if (mood.bloom > 0) {
      const n = 3 + Math.round(mood.bloom * 7);
      for (let i = 0; i < n; i++) {
        const f = i / Math.max(1, n - 1);
        // scatter organically along the shore, not in a tidy fence line
        const jitterX = Math.sin(i * 12.9898) * 0.025;
        const jitterY = (Math.sin(i * 78.233) * 0.5 + 0.5) * 0.05;
        const x = W * (0.24 + f * 0.52 + jitterX);
        const y = H * (0.83 + jitterY);
        const size = 2.4 + mood.bloom * 1.4 + (i % 3) * 0.5;
        drawFlower(ctx, x, y, size, FLOWER_COLOURS[i % FLOWER_COLOURS.length]!);
      }
      // a small cluster nestles by the garden plot when it exists
      if (delivered >= 10) {
        for (let i = 0; i < 3; i++) {
          drawFlower(
            ctx,
            W * (0.6 + i * 0.03),
            H * (0.55 + (i % 2) * 0.015),
            2.6,
            FLOWER_COLOURS[(i + 2) % FLOWER_COLOURS.length]!,
          );
        }
      }
    }

    // Drink water → the well sparkles and its plaza feels fresh.
    if (mood.wellSparkle && delivered >= 6) {
      const wx = W * 0.5; // the well's live map position (town-layout)
      const wy = H * 0.6 - H * 0.05;
      const count = this.reduce ? 3 : 6;
      for (let i = 0; i < count; i++) {
        const seed = i * 1.7;
        const rise = this.reduce ? (i % 3) * 8 : (t / 42 + i * 24) % 30;
        const sx = wx + Math.cos(t / 520 + seed) * (5 + (i % 3) * 3);
        const sy = wy - rise;
        const k = this.reduce ? 0.8 : 0.45 + 0.5 * Math.sin(t / 200 + seed);
        drawSparkle(ctx, sx, sy, 2.0 + (i % 2) * 0.8, k);
      }
    }

    // A walk → the roads are busier: a couple of painted townsfolk take a turn
    // along the shore path (silhouettes, so no unmet villager is spoiled).
    if (mood.villagersOut > 0) {
      const extra = mood.villagersOut >= 0.9 ? 2 : 1;
      const cloaks = ['#8a5a3c', '#5a6e88', '#7a4a5e'];
      for (let i = 0; i < extra; i++) {
        const span = 0.18 + i * 0.02;
        const base = 0.24 + i * 0.34;
        const sweep = this.reduce ? 0.5 : (Math.sin(t / (4200 + i * 900)) + 1) / 2;
        const x = W * (base + span * sweep);
        const y = H * (0.72 + i * 0.055);
        drawStroller(ctx, x, y, H * 0.05, cloaks[i % cloaks.length]!);
      }
    }

    // A flourishing, watered garden draws butterflies by day.
    if (mood.butterflies && !night && !this.reduce) {
      const cols = ['#f2c14e', '#e6739a', '#a06be0'];
      for (let i = 0; i < 3; i++) {
        const seed = i * 2.3;
        const x = W * (0.3 + 0.42 * ((Math.sin(t / (3200 + i * 500) + seed) + 1) / 2));
        const y = H * (0.8 + 0.05 * Math.sin(t / 900 + seed));
        const flap = Math.sin(t / 120 + seed);
        drawButterfly(ctx, x, y, 3.2, flap, cols[i % cols.length]!);
      }
    }

    // Cold plunge → a cool mist drifts low over the water (drifts on the wind).
    if (mood.seaMist > 0) {
      const drift = this.reduce ? 0 : Math.sin(t / 3600) * W * 0.05;
      const my = H * 0.9;
      const g = ctx.createLinearGradient(0, my - H * 0.06, 0, my + H * 0.04);
      g.addColorStop(0, 'rgba(214, 238, 246, 0)');
      g.addColorStop(0.5, `rgba(214, 238, 246, ${(0.1 + mood.seaMist * 0.16).toFixed(3)})`);
      g.addColorStop(1, 'rgba(214, 238, 246, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(-W * 0.1 + drift, my - H * 0.06, W * 1.2, H * 0.1);
    }

    // Stargaze after dark → a small constellation lights over the bay.
    if (mood.stargazed && night) {
      const cx = W * 0.8;
      const cy = H * 0.16;
      const stars = [
        [0, 0],
        [0.05, -0.03],
        [0.1, 0.01],
        [0.14, -0.04],
        [0.08, 0.05],
      ] as const;
      ctx.save();
      ctx.strokeStyle = 'rgba(210, 226, 255, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      stars.forEach(([sx, sy], i) => {
        const px = cx + sx * W;
        const py = cy + sy * H;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      for (const [sx, sy] of stars) {
        const px = cx + sx * W;
        const py = cy + sy * H;
        const tw = this.reduce ? 0.8 : 0.6 + 0.4 * Math.abs(Math.sin(t / 700 + sx * 40));
        drawSparkle(ctx, px, py, 2.2, tw);
      }
      ctx.restore();
    }

    // Real rain outside → the town stays cosy, never gloomy: a villager or two
    // takes a turn under an umbrella, and puddles catch the light on the paths.
    if (mood.precip > 0) {
      const brollies = mood.precip >= 0.4 ? 2 : 1;
      const cloaks = ['#5a6e88', '#7a4a5e'];
      for (let i = 0; i < brollies; i++) {
        const sweep = this.reduce ? 0.4 : (Math.sin(t / (5200 + i * 1100)) + 1) / 2;
        const x = W * (0.3 + i * 0.3 + 0.12 * sweep);
        const y = H * (0.74 + i * 0.05);
        drawStroller(ctx, x, y, H * 0.05, cloaks[i % cloaks.length]!);
        // a simple umbrella dome over them
        ctx.save();
        ctx.fillStyle = i === 0 ? '#c0563f' : '#3f6f6a';
        ctx.beginPath();
        ctx.ellipse(x, y - H * 0.058, H * 0.03, H * 0.017, 0, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = 'rgba(40,30,24,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y - H * 0.058);
        ctx.lineTo(x, y - H * 0.02);
        ctx.stroke();
        ctx.restore();
      }
    }
    // Weather's *memory*: puddles that linger after the rain, snow that settled
    // over a cold day, a frost sheen at a freezing dawn. All from the reading log
    // (core/weather-history) — the "it rained here earlier" that makes it real.
    this.drawAccumulation(ctx, W, H, t, mood);
  }

  /**
   * Ground traces the weather leaves behind — driven by the derived depths on the
   * mood (wetness / snowDepth / frost), not the instantaneous reading, so they
   * persist and fade on their own clock: puddles keep glinting after the shower
   * passes, snow deepens through a cold day then thaws, frost silvers a hard dawn.
   */
  private drawAccumulation(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, mood: WorldMood): void {
    // --- lying snow: a blanket over the rooftops and ground, deeper as it snows on ---
    if (mood.snowDepth > 0.02) {
      const d = mood.snowDepth;
      ctx.save();
      // A pale settle spanning the town — faint over the rooftops, banking thick
      // toward the ground. Reads as "snow lying across the whole island".
      const bandTop = H * 0.36;
      const g = ctx.createLinearGradient(0, bandTop, 0, H * 0.86);
      g.addColorStop(0, 'rgba(236, 244, 252, 0)');
      g.addColorStop(0.55, `rgba(240, 247, 253, ${(0.28 * d).toFixed(3)})`);
      g.addColorStop(1, `rgba(244, 249, 254, ${(0.62 * d).toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, bandTop, W, H * 0.5);
      // Rounded drifts catching along the paths.
      ctx.fillStyle = `rgba(246, 250, 255, ${(0.4 + 0.4 * d).toFixed(3)})`;
      const drifts = this.reduce ? 4 : 7;
      for (let i = 0; i < drifts; i++) {
        const dx = W * (0.08 + (i / drifts) * 0.86);
        const dy = H * (0.74 + 0.05 * (i % 2));
        ctx.beginPath();
        ctx.ellipse(dx, dy, W * (0.055 + 0.035 * d), H * (0.014 + 0.022 * d), 0, Math.PI, Math.PI * 2);
        ctx.fill();
      }
      // The whole scene lifts brighter and cooler under snow cover.
      ctx.globalAlpha = 0.16 * d;
      ctx.fillStyle = 'rgba(228, 239, 250, 1)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // --- wet ground: a sheen + puddles that outlast the rain that made them ---
    if (mood.wetness > 0.06 && mood.snowDepth < 0.35) {
      const wet = mood.wetness;
      ctx.save();
      // A reflective sheen washed across the paths.
      ctx.globalAlpha = 0.16 * wet;
      const sheen = ctx.createLinearGradient(0, H * 0.6, 0, H * 0.85);
      sheen.addColorStop(0, 'rgba(150, 185, 210, 0)');
      sheen.addColorStop(1, 'rgba(175, 205, 228, 0.9)');
      ctx.fillStyle = sheen;
      ctx.fillRect(0, H * 0.6, W, H * 0.26);
      // Puddles: more of them, and glossier, the wetter it is.
      const puddles = Math.round((this.reduce ? 3 : 4) + wet * 4);
      for (let i = 0; i < puddles; i++) {
        const px = W * (0.18 + ((i * 0.13) % 0.68));
        const py = H * (0.68 + (i % 3) * 0.05);
        const shimmer = this.reduce ? 0.6 : 0.4 + 0.35 * Math.abs(Math.sin(t / 620 + i * 1.3));
        const r = W * (0.02 + 0.016 * wet);
        ctx.globalAlpha = 0.5 * wet * shimmer;
        // A cool sky-lit pool with a brighter reflection strip across it.
        ctx.fillStyle = 'rgba(185, 214, 233, 0.7)';
        ctx.beginPath();
        ctx.ellipse(px, py, r, H * 0.009, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.55 * wet * shimmer;
        ctx.fillStyle = 'rgba(238, 247, 253, 0.85)';
        ctx.beginPath();
        ctx.ellipse(px, py, r * 0.55, H * 0.003, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // --- frost: a silver sheen on a freezing dawn (fades as the sun climbs) ---
    if (mood.frost > 0.15 && mood.snowDepth < 0.5) {
      const { weights } = phaseForTime(Date.now(), this.sunTimesFromWeather());
      const dawnLit = Math.max(weights.dawn, weights.night * 0.4); // strongest at first light
      const f = mood.frost * dawnLit;
      if (f > 0.05) {
        ctx.save();
        ctx.globalAlpha = 0.22 * f;
        ctx.fillStyle = 'rgba(216, 234, 247, 1)';
        ctx.fillRect(0, H * 0.5, W, H * 0.4);
        // A scatter of cold glints on the rimed ground.
        if (!this.reduce) {
          const glints = 18;
          for (let i = 0; i < glints; i++) {
            const gx = W * (0.08 + ((i * 0.113) % 0.84));
            const gy = H * (0.62 + ((i * 0.041) % 0.26));
            const tw = 0.4 + 0.6 * Math.abs(Math.sin(t / 500 + i * 2.1));
            drawSparkle(ctx, gx, gy, 1.9, f * tw);
          }
        }
        ctx.restore();
      }
    }
  }

  /**
   * A rainbow when the rain eases and the sun returns (wet ground, no downpour,
   * daylight): the little gift the sky gives after a shower. Drawn in viewport
   * space (it's sky, not ground) — 0 when the conditions aren't met.
   */
  private rainbowStrength(mood: WorldMood): number {
    const easing = mood.weather !== 'storm' && mood.weather !== 'snow' && mood.weather !== 'fog';
    if (mood.wetness <= 0.4 || mood.precip >= 0.18 || !easing) return 0;
    const { weights } = phaseForTime(Date.now(), this.sunTimesFromWeather());
    const daylight = weights.day + 0.6 * (weights.dawn + weights.dusk);
    const s = Math.min(1, (mood.wetness - 0.4) / 0.35) * Math.min(1, daylight);
    return s > 0.08 ? s : 0;
  }

  /** A soft seven-band arc bowing over the bay. Static (reduced-motion safe). */
  private drawRainbow(ctx: CanvasRenderingContext2D, W: number, H: number, strength: number): void {
    // Rainbows sit opposite the sun; nudge the arc's centre toward the sun's side
    // so it bows away from the real light. Anchored low so the crown reaches the
    // sky over the bay in the upper third of the scene.
    const sun = this.sunKey();
    const cx = W * (0.5 + (sun ? sun.dx * 0.16 : 0));
    const cy = H * 0.94;
    const baseR = H * 0.66; // crown sits around the upper quarter
    const bands = ['#e0736b', '#e8a765', '#e9d06a', '#8fc47f', '#79a8d8', '#8f88d6', '#b07fc9'];
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = Math.max(2, H * 0.009);
    bands.forEach((col, i) => {
      ctx.globalAlpha = 0.3 * strength;
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(cx, cy, baseR + i * ctx.lineWidth, Math.PI * 1.14, Math.PI * 1.86);
      ctx.stroke();
    });
    ctx.restore();
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
    this.drawSeason(ctx, W, H, t, night);
    // God-rays fanning from the low sun on clear-ish days.
    if (!night && mood.cloudCover < 0.55) {
      const sx = W * 0.78;
      const sy = H * 0.14;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) {
        const a = 0.9 + i * 0.34 + Math.sin(t / 5000 + i) * 0.05;
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

    // Soft parallax cloud shadows drifting across the island in the REAL wind
    // direction — a whole layer of dappled light moving the way the wind blows.
    if (!night && mood.cloudCover > 0.05) {
      const windX = this.windX();
      const nsh = Math.max(1, Math.round(mood.cloudCover * 4));
      const speed = 0.5 + mood.wind * 1.8;
      const a = 0.045 + mood.cloudCover * 0.07;
      for (let i = 0; i < nsh; i++) {
        const drift = (t / (52000 / speed)) * windX + i * 0.37;
        const sx = ((((drift % 1.7) + 1.7) % 1.7) - 0.35) * W;
        const sy = H * (0.48 + (i % 3) * 0.13);
        const rw = W * (0.17 + (i % 2) * 0.06);
        const rh = H * 0.06;
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(1, rh / rw);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rw);
        g.addColorStop(0, `rgba(18, 28, 20, ${a.toFixed(3)})`);
        g.addColorStop(1, 'rgba(18, 28, 20, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, rw, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (night) {
      // Fireflies wander the meadow, twinkling warm.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const n = 14;
      for (let i = 0; i < n; i++) {
        const fx = W * (0.12 + 0.76 * ((i / n + Math.sin(t / 3200 + i * 1.7) * 0.06 + 1) % 1));
        const fy = H * (0.5 + 0.34 * (0.5 + Math.cos(t / 2600 + i * 2.3) * 0.5));
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
        const mx = (((i * 79 + t * 0.01 * drift) % W) + W) % W;
        const my = H * 0.36 + ((i * 43 + t * 0.006) % (H * 0.55)) + Math.sin(t / 900 + i) * 4;
        ctx.beginPath();
        ctx.arc(mx, my, 0.9 + (i % 3) * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      // a few tumbling leaves once there are trees to shed them
      if (stage >= 1) {
        const leafCols = ['#c98a3a', '#b5642f', '#9a8a3a'];
        for (let i = 0; i < 5; i++) {
          const lx = (((i * 137 + t * 0.02 * drift) % W) + W) % W;
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

  /**
   * A gentle flourish keyed to the player's real-world season — blossom petals
   * in spring, drifting motes in summer, tumbling leaves in autumn, slow snow in
   * winter. Emberhollow breathes with the season the player is actually living
   * in. Caller already guards reduced motion.
   */
  private drawSeason(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, night: boolean): void {
    const season = seasonForMonth(new Date().getMonth(), this.weather?.southern ?? false);
    // Summer's twinkle is the night fireflies already drawn — keep day light.
    const n = season === 'winter' ? 30 : season === 'summer' ? 12 : 18;
    const fallMs = season === 'winter' ? 11000 : season === 'autumn' ? 7500 : 13000;
    ctx.save();
    if (season === 'summer') ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const seed = Math.sin(i * 12.9898) * 43758.5453;
      const col = (seed - Math.floor(seed) + i / n) % 1; // stable per-particle column
      const fall = (t / fallMs + i / n) % 1; // 0 (top) → 1 (bottom)
      const swayAmp = season === 'summer' ? 0.015 : season === 'winter' ? 0.03 : 0.06;
      const sway = Math.sin(t / 1500 + i * 1.7) * W * swayAmp;
      const x = col * W + sway;
      const y = fall * H;
      const fade = Math.sin(fall * Math.PI); // fade in/out at the edges
      if (fade <= 0.02) continue;
      ctx.globalAlpha = fade * (season === 'summer' ? 0.5 : 0.62);
      if (season === 'spring') {
        ctx.fillStyle = i % 3 === 0 ? '#ffd7e6' : '#ffc0d4';
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t / 900 + i);
        ctx.beginPath();
        ctx.ellipse(0, 0, 3.4, 1.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (season === 'autumn') {
        ctx.fillStyle = ['#d98a3a', '#c46a2a', '#b5623a', '#caa24a'][i % 4]!;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(t / 700 + i) * 0.9 + i);
        ctx.beginPath();
        ctx.ellipse(0, 0, 4, 2.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (season === 'winter') {
        ctx.fillStyle = 'rgba(240, 246, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(x, y, 1.8 + (i % 3) * 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else if (!night) {
        // summer: soft warm pollen motes drifting by day
        ctx.fillStyle = 'rgba(255, 236, 180, 0.7)';
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
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
          const fx = left - 10 + (i * (w + 20)) / 4;
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
    // A legible "your sky" readout so the player *feels* the link to their real
    // world: local temperature + their own sunset time, from live data.
    const sky = this.localSkyReadout();
    if (label)
      label.textContent =
        `${STAGE_NAMES[stage]} · ${Math.round(prog * 100)}% restored` +
        `${scene ? ` · ${scene}` : ''}${sky ? ` · ${sky}` : ''}`;
  }

  /** "12° · sunset 8:41pm" from the live reading, or '' when we have no data. */
  private localSkyReadout(): string {
    const w = this.weather;
    if (!w) return '';
    const parts: string[] = [];
    if (typeof w.tempC === 'number') parts.push(`${Math.round(w.tempC)}°`);
    if (typeof w.sunsetMs === 'number' && typeof w.sunriseMs === 'number') {
      // Show the next solar event the player is heading toward.
      const now = Date.now();
      const upcomingSunset = now < w.sunsetMs;
      const at = upcomingSunset ? w.sunsetMs : w.sunriseMs;
      const label = upcomingSunset ? 'sunset' : 'sunrise';
      const time = new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      parts.push(`${label} ${time}`);
    }
    // On a real night, name the moon phase — a full moon over the bay is a beat.
    if (w.isDay === false) parts.push(phaseName(Date.now()).toLowerCase());
    return parts.join(' · ');
  }

  private renderList(): void {
    const host = document.getElementById('map-body');
    if (!host) return;
    const delivered = this.game.snapshot.orderIndex;
    const order = orderAt(delivered);
    // Painted map pins (Batch 15) replace the emoji markers, with graceful fallback.
    const mcIco = (art: string | null, emoji: string): string =>
      art
        ? `<span class="mc-ico mc-ico-art" style="background-image:url(${art})" aria-hidden="true"></span>`
        : `<span class="mc-ico">${emoji}</span>`;
    const challenge = order
      ? `<div class="map-challenge">${mcIco(artUrl('pin_quest'), '📜')}` +
        `<div class="mc-body"><b>${order.who} needs a hand</b><span>${order.text}</span></div></div>`
      : `<div class="map-challenge">${mcIco(artUrl('stake_star'), '✨')}` +
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
    // Painted chapter card (Batch 5) for the current story beat.
    const chArt = artUrl(`chapter_${ch.id}`);
    const chapterCard = chArt
      ? `<div class="chapter-card" style="background-image:url(${chArt})" role="img" aria-label="Chapter ${ch.id}: ${ch.title}">` +
        `<span class="chapter-card-cap">Chapter ${ch.id} · ${ch.title}</span></div>`
      : '';
    // Painted location vignettes (Batch 7) keyed to each restorable place.
    const locArt: Record<string, string> = {
      lighthouse: 'loc_lighthouse',
      'bakers-row': 'loc_bakery',
      market: 'loc_market',
      pier: 'loc_pier',
      'north-docks': 'loc_docks',
      quarry: 'loc_cove',
    };
    // Two of these vignettes are the same buildings tappable on the town map
    // above (with a Village Life game behind them) — wire them to the same
    // building card so this list is a second way in, not a dead end.
    const locBuilding: Record<string, { art: string; unlockAt: number }> = {
      lighthouse: { art: 'prop_lighthouse', unlockAt: 9 },
      pier: { art: 'town_fisherhut', unlockAt: 18 },
    };
    host.innerHTML =
      challenge +
      `<div class="map-tease">🌅 ${tomorrowLine(s)}</div>` +
      `<p class="map-locs-label">Today in Emberhollow</p><div class="dq-list">${quests}</div>` +
      chapterCard +
      this.villageLifeSection() +
      `<p class="map-locs-label">Chapter ${ch.id} · ${ch.title} · ${inChapter}/${ch.end - ch.start} orders · village ${Math.min(
        100,
        Math.round((delivered / RESTORE_ORDERS) * 100),
      )}% restored</p>` +
      `<div class="loc-list">` +
      MAP_LOCATIONS.map((l) => {
        const locked = delivered < l.unlockAt;
        const thumb = artUrl(locArt[l.id] ?? '');
        const bld = locBuilding[l.id];
        const playable = bld !== undefined && !locked;
        return (
          `<div class="loc ${locked ? 'locked' : ''} ${playable ? 'loc-playable' : ''}" ${playable ? `data-art="${bld.art}" data-unlock-at="${bld.unlockAt}" role="button" tabindex="0"` : ''}>` +
          (thumb ? `<div class="loc-thumb" style="background-image:url(${thumb})" aria-hidden="true"></div>` : '') +
          `<div class="loc-body">` +
          `<div class="loc-main"><b>${l.name}</b>` +
          (locked
            ? `<span class="loc-lock">Locked · ${l.unlockAt} orders</span>`
            : `<span class="loc-lvl">Level ${l.level}</span>`) +
          `</div><p>${locked ? 'Keep restoring the harbour to reach it.' : l.blurb}</p></div></div>`
        );
      }).join('') +
      `</div>`;

    this.wireVillageLife();
  }

  /**
   * Village Life index: a single list of the building games with big Play
   * buttons, so every mini-game is reachable in one tap without hunting for the
   * building on the map. Appears as soon as the first game's building returns
   * (the well, order 6); not-yet-returned games show as gentle teasers so the
   * list telegraphs what's coming.
   */
  private villageLifeSection(): string {
    const statuses = MINIGAMES.map((m) => ({ m, st: this.game.minigameStatus(m.buildingArt) }));
    // Nothing to show until at least one game's building has returned.
    if (!statuses.some(({ st }) => st && st.reason !== 'locked-story')) return '';
    const pending = new Set(this.game.pendingNudges());
    const rows = statuses
      .map(({ m, st }) => {
        if (!st) return '';
        // a soft glow on a returned-but-never-played game (retires on first play)
        const glow = pending.has(`game:${m.id}`) ? '<span class="glow-dot" aria-hidden="true"></span>' : '';
        const cta = minigameCta(st, this.game.isTesterUnlimited);
        const thumb = artUrl(m.buildingArt);
        // Same copy as the building card (via minigameCta); the index differs only
        // in that locked games show a disabled affordance rather than hiding it.
        let action: string;
        if (cta.kind === 'open') {
          action = `<button class="vl-play" data-open="${m.buildingArt}">${cta.label}</button>`;
        } else if (cta.kind === 'ready') {
          action = `<button class="vl-play" data-play="${m.id}">${cta.label}</button>`;
        } else if (cta.kind === 'locked-l2') {
          action = `<button class="vl-play" data-open="${m.buildingArt}" disabled>${cta.label}</button>`;
        } else if (cta.kind === 'locked-story') {
          action = `<button class="vl-play" disabled>Returning</button>`;
        } else {
          action = `<button class="vl-play" data-play="${m.id}" disabled>${cta.label}</button>`;
        }
        return (
          `<div class="vl-row${cta.kind === 'locked-story' ? ' vl-row-teaser' : ''}">${glow}` +
          (thumb ? `<div class="vl-thumb" style="background-image:url(${thumb})" aria-hidden="true"></div>` : '') +
          `<div class="vl-body"><b>${m.title}</b><span>${cta.sub}</span></div>${action}</div>`
        );
      })
      .join('');
    // (The old ui_villagelife_header banner was removed — it painted an EMPTY
    // island with no town on it, which read as a stray "blank terrain tile"
    // wedged under the chapter card. The list speaks for itself.)
    return (
      `<p class="map-locs-label">Village Life · tap to play</p><div class="vl-list">${rows}</div>` +
      this.almanacSection()
    );
  }

  /**
   * The Keeper's Almanac — the collection the mini-games quietly fill. Folded
   * away by default so it's a curiosity, never a chore; undiscovered pages are
   * soft silhouettes (nothing here can be missed, so nothing scolds).
   */
  private almanacSection(): string {
    const book = this.game.almanac;
    const { found, total } = almanacProgress(book);
    const sections = ALMANAC_SECTIONS.map((sec) => {
      const cells = ALMANAC_PAGES.filter((p) => p.section === sec)
        .map((p) => {
          const got = (book[p.id] ?? 0) > 0;
          const label = got ? `${p.name} — ${p.note}` : 'Not yet found';
          return (
            `<div class="alm-cell${got ? ' found' : ''}" title="${label}" aria-label="${label}">` +
            `<div class="alm-art">${tileMarkup(p.chain, p.level)}</div>` +
            `<span class="alm-name">${got ? p.name : '· · ·'}</span></div>`
          );
        })
        .join('');
      return `<div class="alm-section"><p class="alm-section-title">${sec}</p><div class="alm-grid">${cells}</div></div>`;
    }).join('');
    const glow = this.game.pendingNudges().includes('almanac')
      ? '<span class="glow-dot" aria-hidden="true"></span>'
      : '';
    return (
      `<details class="alm-book"><summary class="alm-summary">${glow}` +
      `The Keeper’s Almanac <span class="alm-count">${found} of ${total} pages</span></summary>` +
      `<p class="alm-intro">What the village games turn up, remembered.</p>${sections}</details>`
    );
  }

  /** Wire the Village Life index Play/Open buttons to the same paths the map uses. */
  private wireVillageLife(): void {
    const host = document.getElementById('map-body');
    if (!host) return;
    host.querySelectorAll<HTMLButtonElement>('.vl-play[data-play]').forEach((btn) => {
      btn.onclick = () => {
        const id = btn.dataset.play!;
        document.dispatchEvent(new CustomEvent('hearth:play-minigame', { detail: { id } }));
      };
    });
    host.querySelectorAll<HTMLButtonElement>('.vl-play[data-open]').forEach((btn) => {
      btn.onclick = () => {
        const art = btn.dataset.open!;
        if (this.game.openMinigameDoors(art) === 'opened') {
          feedback.chime(520);
          this.renderList();
        } else {
          // 'ineligible' — the building needs caring for first (no daily throttle exists).
          toast('Care for the building first — its doors open once it’s loved.');
        }
      };
    });
    // Building location cards go straight to their mini-game in one tap (their
    // own game launches; if it's not yet opened, open its doors first).
    host.querySelectorAll<HTMLElement>('.loc-playable[data-art]').forEach((card) => {
      const launch = (): void => {
        const art = card.dataset.art!;
        const def = minigameForBuilding(art);
        if (!def) return;
        if (this.game.canPlayMinigame(def.id)) {
          document.dispatchEvent(new CustomEvent('hearth:play-minigame', { detail: { id: def.id } }));
        } else if (this.game.openMinigameDoors(art) === 'opened') {
          feedback.chime(520);
          document.dispatchEvent(new CustomEvent('hearth:play-minigame', { detail: { id: def.id } }));
        } else {
          this.showBuilding(art, Number(card.dataset.unlockAt) || 0); // fall back to the card
        }
      };
      card.onclick = launch;
      card.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          launch();
        }
      };
    });
    // Opening the Almanac counts as discovering it — retire its glow.
    const book = host.querySelector<HTMLDetailsElement>('.alm-book');
    book?.addEventListener('toggle', () => {
      if (book.open) this.game.discover('almanac');
    });
  }
}

/**
 * Which real-world action lights which part of the town, and the one-line note.
 * Positions are normalized to the live building layout. Positive-only — every
 * gesture *adds* a flourish; nothing here can ever darken the scene.
 */
function reactionForAction(
  actionId: string,
): { x: number; y: number; kind: OnsetKind; note: string; colour?: string } | null {
  if (actionId === 'water')
    return { x: 0.5, y: 0.6, kind: 'ripple', note: 'The wells drank with you.', colour: '#bfe6ff' };
  if (actionId === 'steps' || actionId === 'stairs')
    return { x: 0.42, y: 0.72, kind: 'motes', note: 'The lanes fill after your walk.' };
  if (actionId === 'stretch' || actionId === 'squats')
    return { x: 0.63, y: 0.55, kind: 'bloom', note: 'The gardens stir awake.' };
  if (actionId.endsWith('-photo') || actionId === 'photo-outside')
    return { x: 0.5, y: 0.84, kind: 'bloom', note: 'Colour returns to the shore.' };
  if (actionId.startsWith('med-') || actionId === 'log-meditation')
    return { x: 0.5, y: 0.9, kind: 'ripple', note: 'The seas settle as you breathe.', colour: '#bfe6ff' };
  if (actionId === 'log-cold-plunge')
    return { x: 0.5, y: 0.9, kind: 'mist', note: 'A cool mist drifts in off the water.', colour: '#d6eef6' };
  if (actionId === 'log-sauna') return { x: 0.35, y: 0.52, kind: 'glow', note: 'Warmth curls from the chimneys.' };
  return null;
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
