/**
 * Village Life UI — the little building games. One overlay hosts them all;
 * which one runs is chosen by the building you tapped on the map. Each is a
 * short, no-fail delight built from sprites we already ship. The maths lives in
 * ../core/minigames (pure + seeded); this file is only presentation + timing.
 *
 * Feel grammar (shared by every game): floor guaranteed, ceiling earned;
 * onboard → ramp → climax → tally-flourish; combos soft-decay (a miss steps
 * down one, never shatters); every confirm lands on sight + sound + touch.
 */
import type { Game } from '../core/game';
import {
  BEACON_EMBER_R,
  BEACON_ROWS,
  BEACON_SLOTS,
  CATCH_REEL_MS,
  CATCH_REEL_ZONE,
  FORAGE_COLS,
  FORAGE_SIZE,
  FORAGE_STEPS,
  FORGE_DURATION_MS,
  FORGE_SWEET_FRAC,
  SAWMILL_DURATION_MS,
  SAWMILL_FALL_MS,
  SAWMILL_HOLD_MS,
  SAWMILL_LANES,
  SAWMILL_WINDOW_MS,
  WELL_COINS,
  WELL_MULT,
  WELL_PEBBLES,
  WELL_SLOTS,
  beaconDrop,
  beaconPegField,
  beaconReward,
  beaconScore,
  catchReward,
  comboStep,
  fishBite,
  forageField,
  forageReward,
  forageTile,
  forgeReward,
  forgeSchedule,
  forgeScore,
  sawmillReward,
  sawmillSchedule,
  sawmillScore,
  stacksDeck,
  stacksPairsFor,
  stacksReward,
  wellScore,
  wishingWellReward,
  type ForageKind,
  type MgReward,
} from '../core/minigames';
import type { AlmanacPage } from '../core/almanac';
import type { ChainId } from '../core/types';
import { MINIGAME_BY_ID, WISHES } from '../data/minigames';
import { artUrl, tileMarkup } from './art';
import { feedback } from './feedback';
import { playStrip } from './sprite-strip';
import { toast } from './toast';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

/** Game id → painted backdrop art id (sliced into public/art when available). */
const MINIGAME_BACKDROP: Record<string, string> = {
  'wishing-well': 'mg_bg_well',
  'beacon-drop': 'mg_bg_beacon',
  'forge-strike': 'mg_bg_forge',
  'joss-catch': 'mg_bg_catch',
  foraging: 'mg_bg_forage',
  'sorting-stacks': 'mg_bg_stacks',
  sawmill: 'mg_bg_sawmill',
};

const vibrate = (n: number | number[]): void => {
  (navigator as Navigator & { vibrate?: (p: number | number[]) => void }).vibrate?.(n);
};

export class MinigameUI {
  private id: string | null = null;
  /** True once the current run's rewards have been banked, so a double-fired
   *  end-timer/button can't bank the same run twice. Reset on each new play. */
  private banked = false;
  private timers: number[] = [];
  private rafs: number[] = [];
  private strips: (() => void)[] = [];

  constructor(private game: Game) {
    const close = el('mg-close');
    if (close) close.onclick = () => this.close();
    const done = el('mg-done');
    if (done) done.onclick = () => this.close();
    const again = el<HTMLButtonElement>('mg-again');
    if (again) again.onclick = () => this.id && this.play(this.id);
    document.addEventListener('hearth:play-minigame', (e) => {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (id) this.open(id);
    });
  }

  private reduce(): boolean {
    // The in-app Reduce Motion setting only (manual opt-in, like the animated
    // icons). The OS-level media query is NOT consulted here: desktop Windows
    // commonly reports it, which silently swapped every game for its static
    // accessibility path — "the games don't play" — while phones ran them fully.
    return document.body.classList.contains('reduce-motion');
  }

  private clearTimers(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
    this.rafs.forEach((r) => cancelAnimationFrame(r));
    this.rafs = [];
    this.strips.forEach((stop) => stop());
    this.strips = [];
  }

  /** Play a sliced sprite-strip on an element (shared stepper), tracked so it's
   *  stopped when the overlay closes. Returns a stop() for early cancel. */
  private playStrip(
    host: HTMLElement,
    artId: string,
    opts: { frames?: number; fps?: number; loop?: boolean; onEnd?: () => void } = {},
  ): () => void {
    const url = artUrl(artId);
    if (!url) {
      opts.onEnd?.();
      return () => {};
    }
    const stop = playStrip(host, url, opts);
    this.strips.push(stop);
    return stop;
  }

  /**
   * A one-shot spark burst at (leftPct, topPct) of `host` — the painted ember
   * atlas (fx_spark) when present, a small CSS ember scatter as fallback so a
   * hammer strike always feels like it landed. Cleans itself up.
   */
  private spark(host: HTMLElement, leftPct: number, topPct: number): void {
    if (this.reduce()) return;
    const url = artUrl('fx_spark');
    if (url) {
      const s = document.createElement('div');
      s.className = 'mg-spark';
      s.style.left = `${leftPct}%`;
      s.style.top = `${topPct}%`;
      host.appendChild(s);
      this.playStrip(s, 'fx_spark', {
        fps: 22,
        onEnd: () => s.remove(),
      });
      this.timers.push(window.setTimeout(() => s.remove(), 700)); // safety net
      return;
    }
    // Fallback: fling a few warm ember dots outward, then fade.
    for (let i = 0; i < 6; i++) {
      const p = document.createElement('div');
      p.className = 'mg-spark-dot';
      const ang = (Math.PI * 2 * i) / 6 + Math.random();
      const dist = 14 + Math.random() * 16;
      p.style.left = `${leftPct}%`;
      p.style.top = `${topPct}%`;
      p.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
      p.style.setProperty('--dy', `${Math.sin(ang) * dist - 8}px`);
      host.appendChild(p);
      this.timers.push(window.setTimeout(() => p.remove(), 520));
    }
  }

  /** A proper splash where something meets the water: a fanned crown of
   *  droplets + a double ripple that spreads and fades. */
  private waterSplash(host: HTMLElement, xPx: number, yPx: number, big = false): void {
    if (this.reduce()) return;
    const n = big ? 10 : 6;
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'mg-splash-dot';
      const ang = -Math.PI / 2 + (i - (n - 1) / 2) * (Math.PI / (n + 1)); // crown fan
      const dist = (big ? 16 : 10) + Math.random() * (big ? 20 : 12);
      d.style.left = `${xPx}px`;
      d.style.top = `${yPx}px`;
      d.style.setProperty('--dx', `${Math.cos(ang) * dist}px`);
      d.style.setProperty('--dy', `${Math.sin(ang) * dist}px`);
      host.appendChild(d);
      this.timers.push(window.setTimeout(() => d.remove(), 560));
    }
    for (let r = 0; r < (big ? 2 : 1); r++) {
      const ring = document.createElement('div');
      ring.className = 'mg-splash-ring';
      ring.style.left = `${xPx}px`;
      ring.style.top = `${yPx}px`;
      ring.style.animationDelay = `${r * 140}ms`;
      host.appendChild(ring);
      this.timers.push(window.setTimeout(() => ring.remove(), 700 + r * 140));
    }
  }

  /** Squash-and-stretch on hit — the primary cosy juice verb (shake stays rare). */
  private squash(elm: HTMLElement, scale = 1.18): void {
    if (this.reduce()) return;
    elm.style.setProperty('--squash', String(scale));
    elm.classList.remove('mg-squash');
    void elm.offsetWidth;
    elm.classList.add('mg-squash');
    this.timers.push(window.setTimeout(() => elm.classList.remove('mg-squash'), 260));
  }

  /** Open the overlay for a building's game and begin the first run. */
  open(id: string): void {
    const def = MINIGAME_BY_ID[id];
    if (!def) return;
    // Don't flash the overlay open if there's nothing to play — say why instead,
    // so a tap never looks like it "did nothing" or opened-then-closed.
    if (!this.game.canPlayMinigame(id)) {
      const st = this.game.minigameStatus(def.buildingArt);
      toast(
        st?.reason === 'no-energy'
          ? 'Not enough energy for another go — a real-world action refills it.'
          : 'No goes left today — living well earns more.',
      );
      return;
    }
    const overlay = el('minigame-overlay');
    if (overlay) overlay.hidden = false;
    const title = el('mg-title');
    if (title) title.textContent = def.title;
    const sub = el('mg-sub');
    if (sub) sub.textContent = def.blurb;
    this.applyBackdrop(id);
    this.play(id);
  }

  /**
   * Paint the game's illustrated backdrop behind the card if its art has been
   * sliced (mg_bg_<game>); otherwise leave the flat panel. Fallback-guarded so
   * the scene lights up the moment the asset lands, with no code change.
   */
  private applyBackdrop(id: string): void {
    const card = document.querySelector<HTMLElement>('#minigame-overlay .mg-card');
    if (!card) return;
    const key = MINIGAME_BACKDROP[id];
    const url = key ? artUrl(key) : null;
    card.classList.toggle('mg-has-bg', !!url);
    card.style.backgroundImage = url ? `url(${url})` : '';
  }

  private close(): void {
    this.clearTimers();
    const overlay = el('minigame-overlay');
    if (overlay) overlay.hidden = true;
    const card = document.querySelector<HTMLElement>('#minigame-overlay .mg-card');
    if (card) {
      card.classList.remove('mg-has-bg');
      card.style.backgroundImage = '';
    }
    this.id = null;
  }

  /** Spend a go (token + energy) and run the game. */
  private play(id: string): void {
    const run = this.game.startMinigame(id);
    if (!run) {
      const st = this.game.minigameStatus(MINIGAME_BY_ID[id]?.buildingArt ?? '');
      toast(
        st?.reason === 'no-energy'
          ? 'Not enough energy for another go.'
          : 'No goes left today — living well earns more.',
      );
      const result = el('mg-result');
      if (result?.hidden !== false) this.close(); // nothing on screen: leave
      return;
    }
    this.clearTimers();
    this.id = id;
    this.banked = false; // a fresh run may bank exactly once
    const result = el('mg-result');
    if (result) result.hidden = true;
    const stage = el('mg-stage');
    if (stage) stage.innerHTML = '';
    const actions = el('mg-actions');
    if (actions) actions.innerHTML = '';
    if (id === 'wishing-well') this.playWell(run.seed);
    else if (id === 'beacon-drop') this.playBeacon(run.seed);
    else if (id === 'forge-strike') this.playForge(run.seed);
    else if (id === 'joss-catch') this.playCatch(run.seed);
    else if (id === 'foraging') this.playForage(run.seed);
    else if (id === 'sorting-stacks') this.playStacks(run.seed);
    else if (id === 'sawmill') this.playSawmill(run.seed);
  }

  /** A one-time, self-dismissing coaching line for a game's first play. */
  private coachOnce(id: string, text: string): void {
    const key = `hearth:coach:${id}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      /* private mode: just show it */
    }
    const stage = el('mg-stage');
    if (!stage) return;
    const tip = document.createElement('div');
    tip.className = 'mg-coach';
    tip.textContent = text;
    stage.appendChild(tip);
    // Tap anywhere (or the tip itself) skips it; otherwise it fades on its own.
    const to = window.setTimeout(() => dismiss(), 6000);
    const dismiss = (): void => {
      window.clearTimeout(to);
      document.removeEventListener('pointerdown', dismiss, true);
      tip.remove();
    };
    tip.addEventListener('click', dismiss);
    // attach next tick so the tap that opened the game doesn't instantly clear it
    this.timers.push(window.setTimeout(() => document.addEventListener('pointerdown', dismiss, true), 0));
    this.timers.push(to);
  }

  private finish(reward: MgReward, wish?: { who: string; text: string }, score?: number): void {
    if (!this.id || this.banked) return; // ignore a double-fired finish
    this.banked = true;
    const res = this.game.finishMinigame(this.id, reward, wish, score);
    feedback.chime(res.isBest ? 720 : 560);
    this.showResult(reward, wish, res.isBest, res.discovered, res.emberGranted);
  }

  /**
   * The tally flourish: the result card counts the coins UP with a rising tick,
   * then the items pop in one by one, then (maybe) the personal-best banner —
   * the run ends on a rising note, every time. Reduced motion: instant totals.
   */
  private showResult(
    reward: MgReward,
    wish?: { who: string; text: string },
    isBest?: boolean,
    discovered: readonly AlmanacPage[] = [],
    emberGranted: number = 0,
  ): void {
    const result = el('mg-result');
    const title = el('mg-result-title');
    const body = el('mg-result-body');
    if (!result || !title || !body) return;
    title.textContent = reward.heart || 'A good little while.';
    const items = reward.items
      .map((it, i) => `<span class="mg-reward-item" data-pop="${i}">${tileMarkup(it.chain, it.level)}</span>`)
      .join('');
    // A new page in the Almanac — the quiet reason to keep playing.
    const newPages = discovered
      .map((p) => `<span class="mg-almanac-new">✦ New page: <b>${p.name}</b> — ${p.note}</span>`)
      .join('');
    body.innerHTML =
      `<div class="mg-reward-row">${items}</div>` +
      // Show what was ACTUALLY banked: ember is capped per day, and promising
      // "+2 energy" while granting 0 read as energy silently not being added.
      `<p class="mg-reward-line">🪙 <b id="mg-tally-coins">0</b>${
        emberGranted > 0
          ? ` · 🔥 +${emberGranted} energy`
          : reward.ember > 0
            ? ` · 🔥 today's ember pool is full`
            : ''
      }</p>` +
      `<p class="mg-best" id="mg-best-line" hidden>✦ A new personal best!</p>` +
      (newPages ? `<p class="mg-almanac-line" id="mg-almanac-line" hidden>${newPages}</p>` : '') +
      (wish ? `<p class="mg-wish">“${wish.who} ${wish.text}”</p>` : '') +
      `<p class="mg-reward-hint">Kept in your Repository, ready for the village’s needs.</p>`;
    result.hidden = false;
    const almanacLine = el('mg-almanac-line');
    const coinsEl = el('mg-tally-coins');
    const bestLine = el('mg-best-line');
    const itemEls = Array.from(body.querySelectorAll<HTMLElement>('.mg-reward-item'));
    if (this.reduce()) {
      if (coinsEl) coinsEl.textContent = String(reward.coins);
      itemEls.forEach((it) => it.classList.add('in'));
      if (bestLine) bestLine.hidden = !isBest;
      if (almanacLine) almanacLine.hidden = false;
    } else {
      // items pop in first, then the coins tick up with rising pitch, then the banner
      itemEls.forEach((it, i) =>
        this.timers.push(
          window.setTimeout(
            () => {
              it.classList.add('in');
              feedback.tick(380 + i * 60);
            },
            120 + i * 160,
          ),
        ),
      );
      const startAt = 200 + itemEls.length * 160;
      const steps = Math.min(14, Math.max(5, reward.coins));
      for (let s = 1; s <= steps; s++) {
        this.timers.push(
          window.setTimeout(
            () => {
              if (coinsEl) coinsEl.textContent = String(Math.round((reward.coins * s) / steps));
              feedback.tick(300 + (s / steps) * 420);
              if (s === steps && coinsEl?.parentElement) this.squash(coinsEl.parentElement, 1.12);
            },
            startAt + s * 55,
          ),
        );
      }
      const afterTally = startAt + steps * 55 + 220;
      if (isBest && bestLine) {
        this.timers.push(
          window.setTimeout(() => {
            bestLine.hidden = false;
            feedback.deliver();
            vibrate([12, 60, 18]);
          }, afterTally),
        );
      }
      // the Almanac page turns last — the run's final little gift
      if (almanacLine) {
        this.timers.push(
          window.setTimeout(
            () => {
              almanacLine.hidden = false;
              feedback.comboChime(6);
              vibrate(14);
            },
            afterTally + (isBest ? 520 : 0),
          ),
        );
      }
    }
    // Reflect whether another go is possible, rather than toasting on tap.
    const again = el<HTMLButtonElement>('mg-again');
    if (again && this.id) {
      const can = this.game.canPlayMinigame(this.id);
      again.disabled = !can;
      again.textContent = can ? 'Play again' : 'No goes left today';
    }
  }

  /** Put a single "start" button in the actions bar — the player's move to begin. */
  private startButton(label: string, onStart: () => void): void {
    const actions = el('mg-actions');
    if (!actions) return;
    actions.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'btn-primary mg-go';
    btn.textContent = label;
    btn.onclick = () => {
      btn.disabled = true;
      onStart();
    };
    actions.appendChild(btn);
  }

  // ---------- 1) Wishing Well (pull back & release — three pebbles) ----------

  private playWell(seed: number): void {
    const stage = el('mg-stage');
    if (!stage) return;
    const wellUrl = artUrl('prop_well');
    const wellArt = wellUrl
      ? `<img class="mg-well-art" src="${wellUrl}" alt="" />`
      : `<div class="mg-well-fallback" aria-hidden="true">🕳️</div>`;
    const rings = Array.from({ length: WELL_SLOTS }, (_, s) => {
      const dist = Math.abs(s - 2);
      const cls = dist === 0 ? 'heart' : dist === 1 ? 'good' : '';
      return (
        `<button class="mg-ring ${cls}" data-slot="${s}" aria-label="ring ${s + 1} of ${WELL_SLOTS}">` +
        `<span class="mg-ring-val">${s === 2 ? '✦' : WELL_COINS[s]}</span></button>`
      );
    }).join('');
    const multChips = WELL_MULT.map(
      (m, i) => `<span class="mg-mult-chip${i === 0 ? ' on' : ''}" data-m="${i}">×${m}</span>`,
    ).join('');
    stage.innerHTML =
      `<div class="mg-well">${wellArt}` +
      `<div class="mg-well-rings">${rings}</div>` +
      `<div class="mg-well-arc" hidden></div>` +
      `<div class="mg-pebble-hand"><div class="mg-pebble"></div></div>` +
      `<div class="mg-ripple"></div>` +
      `<div class="mg-well-hud"><span class="mg-well-count">Pebble <b id="mg-well-n">1</b> of ${WELL_PEBBLES}</span>` +
      `<span class="mg-well-mult">${multChips}</span></div></div>`;

    const well = stage.querySelector<HTMLElement>('.mg-well');
    const hand = stage.querySelector<HTMLElement>('.mg-pebble-hand');
    const pebble = stage.querySelector<HTMLElement>('.mg-pebble');
    const arc = stage.querySelector<HTMLElement>('.mg-well-arc');
    const nEl = el('mg-well-n');
    if (!well) return;

    const slots: number[] = [];
    let centres = 0;
    let throwing = false;

    const updateMult = (): void => {
      stage
        .querySelectorAll<HTMLElement>('.mg-mult-chip')
        .forEach((c) => c.classList.toggle('on', Number(c.dataset.m) <= centres));
    };

    const endRun = (): void => {
      const res = wishingWellReward(slots, seed, this.game.wishCount());
      const wsrc = res.wishIndex >= 0 ? WISHES[res.wishIndex] : undefined;
      const wish = wsrc ? { who: wsrc.who, text: wsrc.text } : undefined;
      this.finish(res, wish, wellScore(slots));
    };

    // After a pebble lands: bank the slot, light the ring, splash, next pebble
    // or the run's end. After pebble 2 the player may bank early (the only
    // "risk" is that the multiplier could have been higher).
    const landed = (slot: number): void => {
      slots.push(slot);
      if (slot === 2) {
        centres += 1;
        updateMult();
        feedback.comboChime(2 + centres);
        vibrate(16);
      } else {
        feedback.chime(300);
        vibrate(8);
      }
      const ring = stage.querySelector<HTMLElement>(`.mg-ring[data-slot="${slot}"]`);
      ring?.classList.add('lit');
      if (ring) this.squash(ring, 1.22);
      if (slots.length >= WELL_PEBBLES) {
        this.timers.push(window.setTimeout(endRun, 620));
        return;
      }
      if (nEl) nEl.textContent = String(slots.length + 1);
      throwing = false;
      // the next pebble returns to the hand
      if (pebble) {
        pebble.style.removeProperty('left');
        pebble.style.removeProperty('top');
        pebble.style.removeProperty('position');
        if (hand && pebble.parentElement !== hand) hand.appendChild(pebble);
        pebble.style.opacity = '1';
      }
      // the bank choice appears once there's something worth keeping
      const actions = el('mg-actions');
      if (actions && slots.length >= 2) {
        actions.innerHTML = '';
        const bank = document.createElement('button');
        bank.className = 'btn-ghost mg-go';
        bank.textContent = 'Keep this wish';
        bank.onclick = endRun;
        actions.appendChild(bank);
      }
    };

    // The lob itself: a gravity arc from the hand to the chosen ring, then the
    // splash — droplet crown + double ripple (the well answers every wish).
    const lob = (slot: number): void => {
      const W = well.clientWidth || 260;
      const H = well.clientHeight || 240;
      const targetX = ((slot + 0.5) / WELL_SLOTS) * W;
      const surfaceY = H * 0.6;
      const startX = W / 2;
      const startY = H * 0.9;
      const done = (): void => {
        if (arc) arc.hidden = true;
        const ripple = stage.querySelector<HTMLElement>('.mg-ripple');
        if (ripple) {
          ripple.style.left = `${targetX - 6}px`;
          ripple.style.top = `${surfaceY}px`;
          ripple.classList.remove('go');
          void ripple.offsetWidth;
          ripple.classList.add('go');
        }
        this.waterSplash(well, targetX, surfaceY, slot === 2);
        landed(slot);
      };
      if (this.reduce() || !pebble) return done();
      // the pebble leaves the hand: re-parent onto the well so left/top drive
      // the arc (inside the hand it sits in flex flow and never moves)
      if (pebble.parentElement !== well) {
        well.appendChild(pebble);
        pebble.style.position = 'absolute';
      }
      feedback.chime(340);
      // a lobbed arc: up first, then gravity brings it down to the ring
      const peak = Math.min(startY, surfaceY) - H * 0.34;
      let t = 0;
      const T = 34; // frames
      const sim = (): void => {
        t += 1;
        const p = Math.min(1, t / T);
        const x = startX + (targetX - startX) * p;
        // quadratic arc through the peak
        const y = (1 - p) * (1 - p) * startY + 2 * (1 - p) * p * peak + p * p * surfaceY;
        pebble.style.left = `${x}px`;
        pebble.style.top = `${y}px`;
        if (p >= 1) {
          pebble.style.opacity = '0';
          feedback.chime(slot === 2 ? 560 : 240);
          this.timers.push(window.setTimeout(done, 80));
          return;
        }
        this.rafs.push(requestAnimationFrame(sim));
      };
      pebble.style.opacity = '1';
      pebble.style.left = `${startX}px`;
      pebble.style.top = `${startY}px`;
      this.rafs.push(requestAnimationFrame(sim));
    };

    // Reduced motion: tap the ring you want, three times. Fully accessible.
    if (this.reduce()) {
      this.coachOnce('wishing-well', 'Choose a ring for each pebble — the centre deepens every wish.');
      stage.querySelectorAll<HTMLButtonElement>('.mg-ring').forEach((b) => {
        b.onclick = () => {
          if (throwing || slots.length >= WELL_PEBBLES) return;
          lob(Number(b.dataset.slot));
        };
      });
      return;
    }

    // Full motion: PULL BACK & RELEASE. Press the pebble, drag DOWN to draw
    // power (the arc preview climbs ring by ring), release to lob. Slingshot
    // in the hand; power picks the ring.
    this.coachOnce('wishing-well', 'Press the pebble and pull DOWN to aim — release to let the wish fly.');
    const powerToSlot = (pull: number): number => {
      // pull 0..1 → rings walk outward-in: gentle lob = ring 0, full draw = ring 4
      return Math.max(0, Math.min(WELL_SLOTS - 1, Math.floor(pull * WELL_SLOTS)));
    };
    if (hand && pebble) {
      hand.style.touchAction = 'none';
      hand.onpointerdown = (e) => {
        if (throwing || slots.length >= WELL_PEBBLES) return;
        throwing = true;
        hand.setPointerCapture(e.pointerId);
        const y0 = e.clientY;
        let pull = 0;
        if (arc) arc.hidden = false;
        const move = (ev: PointerEvent): void => {
          pull = Math.max(0, Math.min(1, (ev.clientY - y0) / 110));
          const slot = powerToSlot(pull);
          pebble.style.transform = `translateY(${pull * 16}px) scale(${1 + pull * 0.25})`;
          // the preview glows the ring the current draw would reach
          stage.querySelectorAll<HTMLElement>('.mg-ring').forEach((r, i) => r.classList.toggle('aim', i === slot));
          if (arc) arc.style.setProperty('--pull', String(pull));
        };
        const up = (): void => {
          hand.onpointermove = null;
          hand.onpointerup = null;
          pebble.style.transform = '';
          stage.querySelectorAll<HTMLElement>('.mg-ring.aim').forEach((r) => r.classList.remove('aim'));
          if (arc) arc.hidden = true;
          lob(powerToSlot(pull));
        };
        move(e);
        hand.onpointermove = move;
        hand.onpointerup = up;
      };
    }
  }

  // ---------- 2) Beacon Drop (carnival beam + dynamic pegfield) ----------

  private playBeacon(seed: number): void {
    const stage = el('mg-stage');
    if (!stage) return;
    const field = beaconPegField(seed);
    const pegHtml = field
      .map(
        (p, i) =>
          `<span class="mg-peg mg-peg-${p.kind}" data-i="${i}" style="left:${(p.x * 100).toFixed(1)}%;top:${(p.y * 100).toFixed(1)}%;--pr:${(p.r * 200).toFixed(1)}%"></span>`,
      )
      .join('');
    let slotCells = '';
    for (let s = 0; s < BEACON_SLOTS; s++) {
      const dist = Math.abs(s - BEACON_ROWS / 2);
      const val = dist === 0 ? '✦' : `${beaconReward(s).coins}`;
      slotCells += `<button class="mg-slot ${dist === 0 ? 'heart' : dist <= 2 ? 'good' : ''}" data-slot="${s}" aria-label="slot ${s + 1}"><span class="mg-slot-val">${val}</span></button>`;
    }
    stage.innerHTML =
      `<div class="mg-beacon">` +
      `<div class="mg-beacon-lamp"><div class="mg-beacon-flame" aria-hidden="true"></div></div>` +
      `<div class="mg-beam" aria-hidden="true"></div>` +
      `<div class="mg-pegfield">${pegHtml}</div>` +
      `<div class="mg-slots">${slotCells}</div>` +
      `<div class="mg-ember"></div></div>`;
    const ember = stage.querySelector<HTMLElement>('.mg-ember');
    // The lantern flame is a pure-CSS ember glow (flickers via keyframe) — the old
    // fx_flame_beacon strip squashed into its box and read as a garbled wave.

    const beacon = stage.querySelector<HTMLElement>('.mg-beacon');
    const beam = stage.querySelector<HTMLElement>('.mg-beam');
    const pegfield = stage.querySelector<HTMLElement>('.mg-pegfield');
    const pegEls = Array.from(stage.querySelectorAll<HTMLElement>('.mg-peg'));
    const moverIdx = field.findIndex((p) => p.kind === 'mover');

    let goldenHit = false;

    const land = (slot: number): void => {
      const slotEl = stage.querySelector<HTMLElement>(`.mg-slot[data-slot="${slot}"]`);
      slotEl?.classList.add('lit');
      if (slotEl) this.squash(slotEl, 1.25);
      stage.querySelectorAll<HTMLElement>('.mg-slot.near').forEach((n) => n.classList.remove('near'));
      if (beacon && slotEl && !this.reduce()) {
        const br2 = beacon.getBoundingClientRect();
        const sr = slotEl.getBoundingClientRect();
        const lx = ((sr.left + sr.width / 2 - br2.left) / (br2.width || 1)) * 100;
        const ly = ((sr.top - br2.top) / (br2.height || 1)) * 100;
        this.spark(beacon, lx, ly);
      }
      feedback.chime(slot === BEACON_ROWS / 2 ? 620 : 300);
      if (slot === BEACON_ROWS / 2) feedback.deliver(); // centre catch: the 3-note motif + haptic
      this.timers.push(
        window.setTimeout(
          () => this.finish(beaconReward(slot, goldenHit), undefined, beaconScore(slot, goldenHit)),
          500,
        ),
      );
    };

    // The drop: a real ember with gravity through THIS run's pegfield — pegs
    // flash, bumpers boing, the golden peg blesses the run, the mover is read
    // live, and a centre-bound finish plays out in slow motion.
    const release = (xFrac: number): void => {
      if (this.reduce() || !ember || !beacon || !pegfield) {
        const targetSlot = Math.max(0, Math.min(BEACON_ROWS, Math.round(xFrac * BEACON_ROWS)));
        return land(beaconDrop(targetSlot, seed));
      }
      ember.style.transition = 'none';
      const br = beacon.getBoundingClientRect();
      const fr = pegfield.getBoundingClientRect();
      const bW = br.width || 260;
      const bH = br.height || 300;
      const fieldTop = fr.top - br.top;
      const fieldH = fr.height || 1;
      // pegs in board space (mover re-read live each frame)
      const pegs = field.map((p, i) => ({
        x: p.x * bW,
        y: fieldTop + p.y * fieldH,
        r: p.r * bW,
        kind: p.kind,
        el: pegEls[i]!,
      }));
      const slotEls = Array.from(stage.querySelectorAll<HTMLElement>('.mg-slot'));
      let trailTick = 0;
      const trail = (tx: number, ty: number): void => {
        trailTick += 1;
        if (trailTick % 3 !== 0) return;
        const d = document.createElement('div');
        d.className = 'mg-trail-dot';
        d.style.left = `${(tx / bW) * 100}%`;
        d.style.top = `${(ty / bH) * 100}%`;
        beacon.appendChild(d);
        this.timers.push(window.setTimeout(() => d.remove(), 500));
      };
      const slotsTop = bH - 44;
      const R = BEACON_EMBER_R * bW;
      let s = seed >>> 0 || 1;
      const rand = (): number => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 4294967296;
      };
      let x = Math.max(R, Math.min(bW - R, xFrac * bW + (rand() - 0.5) * 14)); // "roughly where the beam was"
      let y = 30;
      let vx = (rand() - 0.5) * 0.6;
      let vy = 0;
      let frames = 0;
      let sinceChime = 9;
      let nudged = false;
      let slow = false;
      // one mid-fall nudge: tap a side of the board to puff the ember that way
      beacon.style.touchAction = 'none';
      beacon.onpointerdown = (ev) => {
        if (nudged) return;
        nudged = true;
        const half = ev.clientX - br.left < bW / 2 ? -1 : 1;
        vx += half * 1.1;
        feedback.chime(500);
        beam?.classList.add('puff');
        this.timers.push(window.setTimeout(() => beam?.classList.remove('puff'), 220));
      };
      feedback.chime(480);
      const step = (): void => {
        frames += 1;
        sinceChime += 1;
        const dt = slow ? 0.45 : 1; // the climax leans into slow motion
        vy += 0.42 * dt;
        vx *= 0.995;
        x += vx * dt;
        y += vy * dt;
        if (x < R) {
          x = R;
          vx = Math.abs(vx) * 0.6;
        } else if (x > bW - R) {
          x = bW - R;
          vx = -Math.abs(vx) * 0.6;
        }
        // live mover position
        if (moverIdx >= 0) {
          const mv = pegs[moverIdx]!;
          const mr = mv.el.getBoundingClientRect();
          mv.x = mr.left + mr.width / 2 - br.left;
          mv.y = mr.top + mr.height / 2 - br.top;
        }
        for (const pg of pegs) {
          const dx = x - pg.x;
          const dy = y - pg.y;
          const d = Math.hypot(dx, dy);
          const min = R + pg.r;
          if (d < min && d > 0.001) {
            const nx = dx / d;
            const ny = dy / d;
            x = pg.x + nx * min;
            y = pg.y + ny * min;
            const dot = vx * nx + vy * ny;
            if (pg.kind === 'bumper') {
              // A PINBALL BUMPER: not a soft deflection but an active KICK —
              // the ember is flung straight out along the normal at a strong
              // fixed speed (plus a little of its own), so it pops and ricochets
              // like a real machine. It may even leap back up the board.
              const KICK = 7.5;
              vx = nx * KICK + (rand() - 0.5) * 1.6;
              vy = ny * KICK + (rand() - 0.5) * 1.2;
              if (Math.abs(vy) < 1.2) vy = ny < 0 ? -1.6 : 1.6; // never skate flat along it
              this.squash(pg.el, 1.5);
              pg.el.classList.add('boing');
              this.timers.push(window.setTimeout(() => pg.el.classList.remove('boing'), 220));
              beacon.classList.add('jolt'); // a tiny machine-shake on a bumper hit
              this.timers.push(window.setTimeout(() => beacon.classList.remove('jolt'), 130));
              if (sinceChime > 1) {
                feedback.chime(180 + rand() * 80); // a low, punchy "thunk-boing"
                feedback.comboChime(3);
                sinceChime = 0;
              }
              vibrate(22);
            } else if (pg.kind === 'golden' && !goldenHit) {
              const bounce = 0.6;
              vx = (vx - 2 * dot * nx) * bounce + (rand() - 0.5) * 0.9;
              vy = Math.max(0.6, (vy - 2 * dot * ny) * bounce);
              goldenHit = true;
              pg.el.classList.add('struck-gold');
              this.spark(beacon, (pg.x / bW) * 100, (pg.y / bH) * 100);
              feedback.comboChime(5);
              vibrate([14, 40, 14]);
            } else {
              // an ordinary peg: a livelier reflection than before (more play in
              // the board), plus a little jitter so no two paths feel identical
              const bounce = 0.72;
              vx = (vx - 2 * dot * nx) * bounce + (rand() - 0.5) * 1.1;
              vy = Math.max(0.6, (vy - 2 * dot * ny) * bounce);
              pg.el.classList.add('hit');
              this.timers.push(window.setTimeout(() => pg.el.classList.remove('hit'), 300));
              if (sinceChime > 3) {
                feedback.chime(430 + rand() * 150);
                sinceChime = 0;
              }
            }
          }
        }
        ember.style.left = `${(x / bW) * 100}%`;
        ember.style.top = `${(y / bH) * 100}%`;
        trail(x, y);
        if (y > slotsTop - 44) {
          const proj = Math.max(0, Math.min(BEACON_SLOTS - 1, Math.floor((x / bW) * BEACON_SLOTS)));
          slotEls.forEach((s2, i) => s2.classList.toggle('near', i === proj));
          // heading for the heart: the last moments stretch out
          if (!slow && proj === BEACON_ROWS / 2) {
            slow = true;
            beacon.classList.add('slowmo');
          }
        }
        if (y >= slotsTop || frames > 620) {
          beacon.classList.remove('slowmo');
          beacon.onpointerdown = null;
          const slot = Math.max(0, Math.min(BEACON_SLOTS - 1, Math.floor((x / bW) * BEACON_SLOTS)));
          return land(slot);
        }
        this.rafs.push(requestAnimationFrame(step));
      };
      this.rafs.push(requestAnimationFrame(step));
    };

    // Reduced motion: tap the slot you aim for (no sweep, no sim).
    if (this.reduce()) {
      this.coachOnce('beacon-drop', 'Aim for the centre slot — the light draws the finest catch there.');
      stage.querySelectorAll<HTMLButtonElement>('.mg-slot').forEach((b) => {
        b.onclick = () => {
          stage.querySelectorAll<HTMLButtonElement>('.mg-slot').forEach((r) => (r.disabled = true));
          release((Number(b.dataset.slot) + 0.5) / BEACON_SLOTS);
        };
      });
      return;
    }

    // Full motion: the LIGHTHOUSE BEAM sweeps the board top like the old
    // carnival clown game — tap anywhere to drop the ember from roughly where
    // the beam points at that instant. The sweep is a CSS animation (not rAF)
    // so it never stalls under rAF throttling; the tap reads the beam's LIVE
    // position from layout.
    this.coachOnce('beacon-drop', 'The beam sweeps the boats — tap to drop the ember where it points.');
    let released = false;
    beam?.classList.add('sweep');
    if (beacon) {
      beacon.style.touchAction = 'none';
      const startDrop = (): void => {
        if (released) return;
        released = true;
        let beamX = 0.5;
        if (beam) {
          const bb = beacon.getBoundingClientRect();
          // The beam now SWEEPS (rotates from a top pivot), so its tip — not its
          // bounding-box centre — is where the light points. Read the live rotation
          // from the animated transform and project the tip down the beam length.
          const tr = getComputedStyle(beam).transform;
          let theta = 0;
          if (tr && tr !== 'none') {
            const m = new DOMMatrixReadOnly(tr);
            theta = Math.atan2(m.b, m.a);
          }
          const len = beam.offsetHeight || 46; // pivot → tip length in px
          if (bb.width) beamX = Math.max(0.05, Math.min(0.95, 0.5 + (len * Math.sin(theta)) / bb.width));
          if (tr && tr !== 'none') beam.style.transform = tr; // hold the beam where you called it
          beam.classList.add('drop'); // fades out (opacity only — transform stays frozen)
        }
        release(beamX);
      };
      beacon.onpointerdown = startDrop;
      this.startButton('Drop the light', startDrop);
    }
  }

  // ---------- 3) Strike While Hot (whack-a-mole + the hammer) ----------

  private playForge(seed: number): void {
    const stage = el('mg-stage');
    if (!stage) return;
    const schedule = forgeSchedule(seed);
    let cells = '';
    for (let i = 0; i < 9; i++) cells += `<button class="mg-forge-cell" data-cell="${i}" aria-label="anvil"></button>`;
    // Ore → ingot: a glowing lump sits on the hot anvil; the hammer turns it
    // into a bar. Lump sprite when sliced, else the raw copper ore (chain L0).
    const lumpUrl = artUrl('mg_forge_lump') ?? artUrl('item_copper_0');
    const ingotUrl = artUrl('item_copper_2');
    const hammerUrl = artUrl('mg_forge_hammer');
    stage.innerHTML =
      `<div class="mg-forge"><div class="mg-forge-grid">${cells}</div>` +
      `<div class="mg-forge-bar"><span class="mg-forge-fill"></span></div>` +
      `<p class="mg-forge-score">${ingotUrl ? `<img class="mg-forge-counter-ingot" src="${ingotUrl}" alt="" />` : ''}Strikes: <b id="mg-forge-hits">0</b><span id="mg-forge-combo" class="mg-combo"></span></p></div>`;
    this.coachOnce('forge-strike', 'Strike while the glow is brightest — the sweet heat forges the finest copper.');
    const hitsEl = el('mg-forge-hits');
    const comboEl = el('mg-forge-combo');
    let hits = 0;
    let perfects = 0;
    let combo = 0;
    let bestCombo = 0;
    const liveSpawn: Record<number, number | undefined> = {};
    const sweetNow: Record<number, boolean> = {};
    const flameStop: Record<number, (() => void) | undefined> = {};
    const forgeEl = stage.querySelector<HTMLElement>('.mg-forge');
    const cellEls = Array.from(stage.querySelectorAll<HTMLButtonElement>('.mg-forge-cell'));
    const coolCell = (c: HTMLButtonElement, cell: number): void => {
      liveSpawn[cell] = undefined;
      sweetNow[cell] = false;
      flameStop[cell]?.();
      flameStop[cell] = undefined;
      c.classList.remove('hot', 'sweet');
      c.style.backgroundImage = '';
      c.style.backgroundSize = '';
      c.style.backgroundPositionX = '';
      c.querySelector('.mg-forge-lump')?.remove(); // the unstruck lump cools away
    };
    // THE HAMMER: a big smith's hammer swings down onto the struck cell —
    // anticipation (rear back) → impact (sparks + squash) → follow-through.
    const swingHammer = (c: HTMLButtonElement): void => {
      if (this.reduce()) return;
      const h = document.createElement('div');
      h.className = 'mg-hammer';
      h.innerHTML = hammerUrl ? `<img src="${hammerUrl}" alt="" />` : '<span class="mg-hammer-ico">🔨</span>';
      c.appendChild(h);
      this.timers.push(window.setTimeout(() => h.remove(), 340));
    };
    const counterEl = stage.querySelector<HTMLElement>('.mg-forge-score');
    // A clean strike turns the glowing lump into a finished ingot that flies to
    // the strike counter — ore in, copper out, made visible.
    const flyIngot = (c: HTMLButtonElement): void => {
      if (!ingotUrl || this.reduce()) return;
      const cr = c.getBoundingClientRect();
      const fly = document.createElement('img');
      fly.className = 'mg-fly-ingot';
      fly.src = ingotUrl;
      fly.style.left = `${cr.left + cr.width / 2 - 16}px`;
      fly.style.top = `${cr.top + cr.height / 2 - 16}px`;
      document.body.appendChild(fly);
      const tr = (counterEl ?? c).getBoundingClientRect();
      requestAnimationFrame(() => {
        fly.style.transform = `translate(${tr.left + tr.width / 2 - (cr.left + cr.width / 2)}px, ${tr.top + tr.height / 2 - (cr.top + cr.height / 2)}px) scale(0.35)`;
        fly.style.opacity = '0.9';
      });
      this.timers.push(
        window.setTimeout(() => {
          fly.remove();
          counterEl?.classList.remove('bump');
          void counterEl?.offsetWidth; // restart the pop
          counterEl?.classList.add('bump');
        }, 440),
      );
    };
    cellEls.forEach((c) => {
      c.onpointerdown = () => {
        const cell = Number(c.dataset.cell);
        if (liveSpawn[cell] === undefined) return; // not hot: no penalty, just nothing
        const perfect = !!sweetNow[cell];
        // the lump becomes an ingot IN PLACE for a beat, then flies to the counter
        const lump = c.querySelector<HTMLImageElement>('.mg-forge-lump');
        if (lump && ingotUrl) {
          lump.src = ingotUrl;
          lump.classList.add('mg-forge-ingot');
        }
        coolCell(c, cell);
        swingHammer(c);
        c.classList.add('struck');
        this.timers.push(window.setTimeout(() => c.classList.remove('struck'), 300));
        this.squash(c, perfect ? 1.28 : 1.16);
        this.spark(c, 50, 44);
        flyIngot(c);
        vibrate(perfect ? 18 : 12);
        hits += 1;
        if (perfect) perfects += 1;
        combo = comboStep(combo, true);
        bestCombo = Math.max(bestCombo, combo);
        if (hitsEl) hitsEl.textContent = String(hits);
        if (comboEl)
          comboEl.textContent =
            combo >= 3 ? ` · ${combo} in a row!${perfect ? ' ✦' : ''}` : perfect ? ' · sweet heat ✦' : '';
        forgeEl?.classList.toggle('hot-streak', combo >= 3);
        feedback.comboChime(combo); // the anvil rings up the scale
      };
    });
    this.startButton('Heat the forge', () => {
      const actions = el('mg-actions');
      if (actions) actions.innerHTML = '';
      schedule.forEach((sp, si) => {
        this.timers.push(
          window.setTimeout(() => {
            const c = cellEls[sp.cell];
            if (!c) return;
            liveSpawn[sp.cell] = si;
            c.classList.add('hot');
            if (lumpUrl) {
              const lump = document.createElement('img');
              lump.className = 'mg-forge-lump';
              lump.src = lumpUrl;
              lump.alt = '';
              c.appendChild(lump);
            }
            if (!this.reduce()) {
              flameStop[sp.cell] = this.playStrip(c, 'fx_flame_forge', { fps: 14, loop: true });
            }
            // the SWEET HEAT: the middle stretch of the lump's life glows
            // brightest — strike then for a perfect
            const sweetIn = sp.ttlMs * (0.5 - FORGE_SWEET_FRAC / 2);
            const sweetOut = sp.ttlMs * (0.5 + FORGE_SWEET_FRAC / 2);
            this.timers.push(
              window.setTimeout(() => {
                if (liveSpawn[sp.cell] === si) {
                  sweetNow[sp.cell] = true;
                  c.classList.add('sweet');
                }
              }, sweetIn),
            );
            this.timers.push(
              window.setTimeout(() => {
                if (liveSpawn[sp.cell] === si) {
                  sweetNow[sp.cell] = false;
                  c.classList.remove('sweet');
                }
              }, sweetOut),
            );
            this.timers.push(
              window.setTimeout(() => {
                if (liveSpawn[sp.cell] === si) {
                  coolCell(c, sp.cell);
                  combo = comboStep(combo, false); // soft decay — one step, never a shatter
                  forgeEl?.classList.toggle('hot-streak', combo >= 3);
                  if (comboEl) comboEl.textContent = combo >= 3 ? ` · ${combo} in a row!` : '';
                }
              }, sp.ttlMs),
            );
          }, sp.atMs),
        );
      });
      const fill = stage.querySelector<HTMLElement>('.mg-forge-fill');
      if (fill && !this.reduce()) {
        requestAnimationFrame(() => {
          fill.style.transition = `width ${FORGE_DURATION_MS}ms linear`;
          fill.style.width = '0%';
        });
      }
      this.timers.push(
        window.setTimeout(
          () =>
            this.finish(
              forgeReward(hits, schedule.length, perfects, bestCombo),
              undefined,
              forgeScore(hits, perfects, bestCombo),
            ),
          FORGE_DURATION_MS + 400,
        ),
      );
    });
  }

  // ---------- 4) Joss's Catch (strike, then reel) ----------

  private playCatch(seed: number): void {
    const stage = el('mg-stage');
    if (!stage) return;
    const { delayMs, windowMs } = fishBite(seed);
    stage.innerHTML =
      `<div class="mg-catch"><div class="mg-catch-water"><div class="mg-bobber"></div><div class="mg-catch-shadow" hidden></div></div>` +
      `<div class="mg-reel" hidden><div class="mg-reel-zone"></div><div class="mg-reel-marker"></div></div>` +
      `<p class="mg-catch-hint">Cast, then strike the moment the bobber dips.</p></div>`;
    this.coachOnce('joss-catch', 'Strike on the dip, then tap again as the marker crosses the golden water.');
    const water = stage.querySelector<HTMLElement>('.mg-catch-water');
    const bobber = stage.querySelector<HTMLElement>('.mg-bobber');
    const shadow = stage.querySelector<HTMLElement>('.mg-catch-shadow');
    const reel = stage.querySelector<HTMLElement>('.mg-reel');
    const zone = stage.querySelector<HTMLElement>('.mg-reel-zone');
    const marker = stage.querySelector<HTMLElement>('.mg-reel-marker');
    const hint = stage.querySelector<HTMLElement>('.mg-catch-hint');

    // the run's climax: the catch surfaces as a silhouette, then the reveal
    const resolveRun = (q: number, reelQ: number): void => {
      const reward = catchReward(q, reelQ);
      const blend = q * 0.55 + reelQ * 0.45;
      if (water && blend > 0.25 && !this.reduce()) {
        this.waterSplash(water, water.clientWidth / 2, water.clientHeight * 0.42, blend > 0.6);
        if (shadow) {
          shadow.hidden = false;
          shadow.classList.add('rise');
        }
      }
      vibrate(blend > 0.6 ? 18 : 8);
      feedback.chime(blend > 0.6 ? 640 : 480);
      this.timers.push(
        window.setTimeout(() => this.finish(reward, undefined, Math.round(blend * 100)), this.reduce() ? 120 : 640),
      );
    };

    // Stage B: THE REEL. A marker sweeps the bar twice; tap while it crosses
    // the golden zone. Missing just reels it in plain — no-fail.
    const startReel = (q: number): void => {
      if (!reel || !marker || !zone || this.reduce()) return resolveRun(q, this.reduce() ? 0.75 : 0.3);
      reel.hidden = false;
      if (hint) hint.textContent = 'Reel — tap on the golden water!';
      const zoneCentre = 0.3 + ((seed % 100) / 100) * 0.4; // seeded zone position
      zone.style.left = `${(zoneCentre - CATCH_REEL_ZONE / 2) * 100}%`;
      zone.style.width = `${CATCH_REEL_ZONE * 100}%`;
      const rT0 = performance.now();
      let reelDone = false;
      const sweepReel = (): void => {
        if (reelDone) return;
        const t = (performance.now() - rT0) / CATCH_REEL_MS;
        if (t >= 1) {
          reelDone = true;
          resolveRun(q, 0.3); // the line comes in anyway
          return;
        }
        const p = 0.5 - 0.48 * Math.cos(t * Math.PI * 2); // two passes
        marker.style.left = `${p * 100}%`;
        this.rafs.push(requestAnimationFrame(sweepReel));
      };
      this.rafs.push(requestAnimationFrame(sweepReel));
      reel.onpointerdown = () => {
        if (reelDone) return;
        reelDone = true;
        const mp = parseFloat(marker.style.left) / 100;
        const dist = Math.abs(mp - zoneCentre) / (CATCH_REEL_ZONE / 2);
        const reelQ = Math.max(0.2, Math.min(1, 1.05 - dist * 0.5));
        marker.classList.add(dist <= 1 ? 'in-zone' : 'out-zone');
        feedback.chime(dist <= 1 ? 600 : 360);
        resolveRun(q, dist <= 1 ? reelQ : 0.3);
      };
    };

    this.startButton('Cast the line', () => {
      const actions = el('mg-actions');
      if (actions) actions.innerHTML = '';
      if (hint) hint.textContent = 'Wait for it…';
      let dipAt = 0;
      let struck = false;
      water?.addEventListener('pointerdown', () => {
        if (struck) return;
        struck = true;
        if (!dipAt) {
          if (hint) hint.textContent = 'Too soon — but something’s still on the line…';
          startReel(0.15);
          return;
        }
        const q = Math.max(0, 1 - (performance.now() - dipAt) / windowMs);
        bobber?.classList.remove('dip');
        this.squash(water, 1.06);
        startReel(q);
      });
      // a "nibble" tell just before the dip, so the strike can be anticipated
      this.timers.push(
        window.setTimeout(
          () => {
            if (!struck && hint) hint.textContent = 'A nibble…';
            bobber?.classList.add('nibble');
          },
          Math.max(0, delayMs - 500),
        ),
      );
      this.timers.push(
        window.setTimeout(() => {
          if (struck) return;
          dipAt = performance.now();
          bobber?.classList.remove('nibble');
          bobber?.classList.add('dip');
          if (hint) hint.textContent = 'Strike!';
          feedback.chime(300);
          this.timers.push(
            window.setTimeout(() => {
              if (!struck) {
                struck = true;
                startReel(0.2); // slipped, but a nibble — the reel still turns
              }
            }, windowMs + 250),
          );
        }, delayMs),
      );
    });
  }

  // ---------- 5) The Foraging Expedition (warmer / colder) ----------

  private playForage(seed: number): void {
    const stage = el('mg-stage');
    if (!stage) return;
    const { kinds, warmth } = forageField(seed);
    let steps = FORAGE_STEPS;
    let heartFound = false;
    const acc: { coins: number; items: { chain: ChainId; level: number }[]; ember: number } = {
      coins: 0,
      items: [],
      ember: 0,
    };
    let tiles = '';
    for (let i = 0; i < FORAGE_SIZE; i++)
      tiles += `<button class="mg-fog" data-i="${i}" aria-label="uncover"></button>`;
    stage.innerHTML =
      `<div class="mg-forage"><div class="mg-forage-grid">${tiles}</div>` +
      `<p class="mg-forage-steps">Footsteps left: <b id="mg-forage-steps">${steps}</b></p></div>`;
    const stepsEl = el('mg-forage-steps');
    this.coachOnce('foraging', 'Warm colours mean the honeycomb is near. Head home early to keep a light step.');
    let ended = false;
    const end = (): void => {
      if (ended) return;
      ended = true;
      this.finish(
        forageReward(acc, heartFound, Math.max(0, steps)),
        undefined,
        acc.items.length + acc.ember + (heartFound ? Math.max(0, steps) : 0),
      );
    };
    // "Head home" — stop early and keep everything; with the heart found, the
    // unspent footsteps become the forager's bonus (a real decision at last).
    const actions = el('mg-actions');
    if (actions) {
      actions.innerHTML = '';
      const b = document.createElement('button');
      b.className = 'btn-ghost mg-go';
      b.textContent = 'Head home';
      b.onclick = end;
      actions.appendChild(b);
    }
    const token = (art: string, emoji: string, extra = ''): string => {
      const url = artUrl(art);
      return url
        ? `<img class="mg-fog-art ${extra}" src="${url}" alt="" draggable="false" />`
        : `<span class="mg-fog-ico ${extra}">${emoji}</span>`;
    };
    const glyph = (kind: ForageKind, pay: typeof acc): string => {
      if (kind === 'item' && pay.items.length) return tileMarkup(pay.items[0]!.chain, pay.items[0]!.level);
      if (kind === 'coins') return token('mg_forage_coin', '🪙');
      if (kind === 'ember') return token('mg_forage_ember', '🔥');
      if (kind === 'heart') return token('mg_forage_honeycomb', '🍯');
      if (kind === 'clearing') return token('mg_forage_clearing', '✨', 'mg-fog-view');
      return token('mg_forage_leaf', '🌿', 'mg-fog-view');
    };
    const tileEls = Array.from(stage.querySelectorAll<HTMLButtonElement>('.mg-fog'));
    // Reveal a tile: bank its yield, tint it by WARMTH (the warmer/colder
    // trail that turns blind taps into a hunt), and let clearings cascade.
    const reveal = (i: number, free: boolean, depth = 0): void => {
      const t = tileEls[i];
      if (!t || t.classList.contains('found') || ended) return;
      if (!free) {
        if (steps <= 0) return;
        steps -= 1;
        if (stepsEl) stepsEl.textContent = String(steps);
      }
      const kind = kinds[i]!;
      const pay = forageTile(seed, i, kind);
      acc.coins += pay.coins;
      acc.ember += pay.ember;
      acc.items.push(...pay.items);
      const w = Math.min(4, warmth[i] ?? 4);
      t.classList.add('found', `k-${kind}`, `w-${w}`);
      t.innerHTML = glyph(kind, pay);
      this.squash(t, 1.14);
      if (kind === 'heart') {
        heartFound = true;
        this.spark(t, 50, 46);
        vibrate([16, 60, 20]);
        feedback.deliver();
        const hint = stage.querySelector<HTMLElement>('.mg-forage-steps');
        hint?.insertAdjacentHTML(
          'beforeend',
          ' · <span class="mg-forage-bonus">honeycomb found — home pays +3/step!</span>',
        );
      } else if (kind === 'clearing') {
        // the clearing opens its neighbours in a gentle rush — free reveals
        feedback.chime(560);
        const col = i % FORAGE_COLS;
        const neigh = [
          i - FORAGE_COLS,
          i + FORAGE_COLS,
          col > 0 ? i - 1 : -1,
          col < FORAGE_COLS - 1 ? i + 1 : -1,
        ].filter((n) => n >= 0 && n < FORAGE_SIZE);
        neigh.forEach((n, k) => this.timers.push(window.setTimeout(() => reveal(n, true, depth + 1), 140 + k * 110)));
      } else {
        if (kind === 'ember' || kind === 'coins') this.spark(t, 50, 46);
        // warmer tiles ring higher — you can HEAR the trail
        feedback.chime(300 + (4 - w) * 60);
      }
      if (steps <= 0 && !ended) this.timers.push(window.setTimeout(end, 700));
    };
    tileEls.forEach((t) => {
      t.onclick = () => reveal(Number(t.dataset.i), false);
    });
  }

  // ---------- 6) Sorting the Stacks (memory pairs, streaks) ----------

  private playStacks(seed: number): void {
    const stage = el('mg-stage');
    if (!stage) return;
    const pairs = stacksPairsFor(this.game.minigameBest('sorting-stacks') ?? undefined);
    const deck = stacksDeck(seed, pairs);
    // Distinct shelf faces, reusing item art (enough for the ramped shelf too).
    const FACES: readonly [ChainId, number][] = [
      ['wood', 3],
      ['harvest', 3],
      ['flowers', 3],
      ['water', 3],
      ['honey', 3],
      ['herbs', 3],
      ['fish', 2],
      ['copper', 2],
      ['seeds', 2],
      ['books', 2],
    ];
    const face = (v: number) => tileMarkup(FACES[v % FACES.length]![0], FACES[v % FACES.length]![1]);
    let cards = '';
    deck.forEach(
      (v, i) => (cards += `<button class="mg-stack-card" data-i="${i}" data-v="${v}" aria-label="card"></button>`),
    );
    stage.innerHTML =
      `<div class="mg-stacks"><div class="mg-stacks-grid" style="--stack-cols:4">${cards}</div>` +
      `<p class="mg-stacks-hint">Flips: <b id="mg-stacks-flips">0</b><span id="mg-stacks-streak" class="mg-combo"></span></p></div>`;
    this.coachOnce('sorting-stacks', 'Matches in a row build a streak — the finer volumes come from memory.');
    const flipsEl = el('mg-stacks-flips');
    const streakEl = el('mg-stacks-streak');
    let flips = 0;
    let matched = 0;
    let streak = 0;
    let bestStreak = 0;
    let first = -1;
    let busy = false;
    const cardEls = Array.from(stage.querySelectorAll<HTMLButtonElement>('.mg-stack-card'));
    const actions = el('mg-actions');
    if (actions) actions.innerHTML = '';
    cardEls.forEach((c) => {
      c.onclick = () => {
        if (busy || c.classList.contains('up') || c.classList.contains('done')) return;
        const v = Number(c.dataset.v);
        c.classList.add('up');
        c.innerHTML = face(v);
        if (first < 0) {
          first = Number(c.dataset.i);
          return;
        }
        flips += 1;
        if (flipsEl) flipsEl.textContent = String(flips);
        const fc = cardEls[first]!;
        if (Number(fc.dataset.v) === v) {
          c.classList.add('done');
          fc.classList.add('done');
          matched += 1;
          first = -1;
          streak = comboStep(streak, true);
          bestStreak = Math.max(bestStreak, streak);
          if (streakEl) streakEl.textContent = streak >= 2 ? ` · ${streak} from memory!` : '';
          this.spark(c, 50, 42);
          this.spark(fc, 50, 42);
          this.squash(c, 1.2);
          this.squash(fc, 1.2);
          vibrate(12);
          feedback.comboChime(streak); // the shelves sing up the scale
          if (matched === pairs)
            this.timers.push(
              // fewer flips → a higher best (perfect = pairs flips)
              window.setTimeout(
                () => this.finish(stacksReward(flips, bestStreak, pairs), undefined, Math.max(0, 40 - flips)),
                550,
              ),
            );
        } else {
          busy = true;
          streak = comboStep(streak, false); // a forgotten shelf steps down, never shatters
          if (streakEl) streakEl.textContent = streak >= 2 ? ` · ${streak} from memory!` : '';
          this.timers.push(
            window.setTimeout(() => {
              c.classList.remove('up');
              c.innerHTML = '';
              fc.classList.remove('up');
              fc.innerHTML = '';
              first = -1;
              busy = false;
            }, 750),
          );
        }
      };
    });
  }

  // ---------- 7) The Saw Song (rhythm lanes: holds, chords, the strum) ------

  private playSawmill(seed: number): void {
    const stage = el('mg-stage');
    if (!stage) return;
    const schedule = sawmillSchedule(seed);
    const bladeUrl = artUrl('mg_sawmill_blade');
    // The log stands UPRIGHT in its flume — long edge vertical, the round
    // end-grain face looking down the lane. Painted sprite when sliced; a
    // CSS-drawn bark-and-rings log otherwise (never a bare emoji).
    const logVUrl = artUrl('mg_sawmill_log_v');
    const logMarkup = (kind: 'log' | 'hold'): string => {
      const tall = kind === 'hold' ? ' mg-log-tall' : '';
      if (logVUrl) return `<div class="mg-log-body${tall}"><img src="${logVUrl}" alt="" draggable="false" /></div>`;
      return (
        `<div class="mg-log-body mg-log-css${tall}">` +
        `<div class="mg-log-bark"></div><div class="mg-log-face"></div></div>`
      );
    };
    let lanes = '';
    for (let l = 0; l < SAWMILL_LANES; l++) lanes += `<div class="mg-lane" data-lane="${l}"></div>`;
    stage.innerHTML =
      `<div class="mg-saw"><div class="mg-sawmill">${lanes}` +
      `<div class="mg-sawline">${bladeUrl ? `<img class="mg-sawblade" src="${bladeUrl}" alt="" />` : `<span class="mg-sawblade-fallback" aria-hidden="true">🪚</span>`}</div>` +
      `</div>` +
      `<p class="mg-saw-score">Cut: <b id="mg-saw-hits">0</b><span id="mg-saw-combo" class="mg-combo"></span></p></div>`;
    this.coachOnce('sawmill', 'Saw each log as it crosses the blade line — hold the long ones right through.');

    const mill = stage.querySelector<HTMLElement>('.mg-sawmill');
    const lineEl = stage.querySelector<HTMLElement>('.mg-sawline');
    const laneEls = Array.from(stage.querySelectorAll<HTMLElement>('.mg-lane'));
    const hitsEl = el('mg-saw-hits');
    const comboEl = el('mg-saw-combo');
    const reduce = this.reduce();
    let hits = 0;
    let perfects = 0;
    let combo = 0;
    let bestCombo = 0;
    type LiveLog = { elm: HTMLElement; crossAt: number; done: boolean; kind: 'log' | 'hold' | 'strum' };
    // per-lane QUEUES — wave 3 allows same-lane repeats and chords
    const live: LiveLog[][] = Array.from({ length: SAWMILL_LANES }, () => []);
    let liveStrum: LiveLog | null = null;

    const LINE_PCT = 0.78;

    // The spinning blade darts to whichever lane is being cut (it lives on the
    // full-width blade line, so we swap its right-pin for a lane-centre left%).
    const blade = stage.querySelector<HTMLElement>('.mg-sawblade, .mg-sawblade-fallback');
    const moveBlade = (li: number): void => {
      if (!blade || reduce) return;
      blade.style.right = 'auto';
      blade.style.marginLeft = '-15px'; // half the 30px blade → centres on the lane
      blade.style.left = `${((li + 0.5) / SAWMILL_LANES) * 100}%`;
      blade.classList.add('cutting');
      this.timers.push(window.setTimeout(() => blade.classList.remove('cutting'), 220));
    };

    // Split the log DOWN THE MIDDLE into two planks that part, tilt and settle.
    const sawInHalf = (host: HTMLElement, log: HTMLElement, big = false): void => {
      const y = log.offsetTop;
      const html = log.querySelector('.mg-log-body')?.outerHTML ?? '';
      log.remove();
      if (reduce) return;
      for (const side of ['l', 'r'] as const) {
        const half = document.createElement('div');
        half.className = `mg-plank mg-plank-${side}${big ? ' mg-plank-big' : ''}`;
        half.innerHTML = html;
        half.style.top = `${y}px`;
        host.appendChild(half);
        this.timers.push(window.setTimeout(() => half.remove(), 620));
      }
      this.spark(host, 50, LINE_PCT * 100); // sawdust burst at the blade
    };

    const scoreCut = (perfect: boolean): void => {
      hits += 1;
      combo = comboStep(combo, true);
      bestCombo = Math.max(bestCombo, combo);
      if (perfect) perfects += 1;
      if (hitsEl) hitsEl.textContent = String(hits);
      if (comboEl)
        comboEl.textContent =
          combo >= 3 ? ` · ×${combo}${perfect ? ' clean cut!' : ''}` : perfect ? ' · clean cut!' : '';
      mill?.classList.toggle('hot-streak', combo >= 3);
      feedback.comboChime(combo); // the song climbs with the streak
      vibrate(perfect ? 18 : 12);
    };

    const missLog = (): void => {
      combo = comboStep(combo, false); // the song rests a step — never shatters
      mill?.classList.toggle('hot-streak', combo >= 3);
      if (comboEl) comboEl.textContent = combo >= 3 ? ` · ×${combo}` : '';
    };

    const onCut = (lane: HTMLElement, log: LiveLog, perfect: boolean): void => {
      log.done = true;
      log.elm.style.transition = 'none';
      log.elm.style.top = `${log.elm.offsetTop}px`;
      moveBlade(laneEls.indexOf(lane)); // the blade darts over to bite this log
      sawInHalf(lane, log.elm, perfect); // a clean cut splits wider
      lane.classList.add('flash');
      this.timers.push(window.setTimeout(() => lane.classList.remove('flash'), 240));
      scoreCut(perfect);
    };

    // THE BIG STRUM: one wide log across every lane ends the song — hit it and
    // the whole mill sings (slow-mo pause + the full three-note motif).
    const spawnStrum = (sp: { atMs: number }, t0: number): void => {
      if (!mill) return;
      const log = document.createElement('div');
      log.className = 'mg-log mg-strum';
      log.innerHTML = `<div class="mg-log-body mg-log-css mg-strum-body"><div class="mg-log-bark"></div></div>`;
      mill.appendChild(log);
      const crossAt = t0 + sp.atMs + SAWMILL_FALL_MS;
      const entry: LiveLog = { elm: log, crossAt, done: false, kind: 'strum' };
      liveStrum = entry;
      if (reduce) {
        log.style.top = `${LINE_PCT * 100}%`;
        entry.crossAt = performance.now();
      } else {
        const totalMs = SAWMILL_FALL_MS / LINE_PCT;
        requestAnimationFrame(() => {
          log.style.transition = `top ${Math.round(totalMs)}ms linear`;
          log.style.top = '104%';
        });
      }
      this.timers.push(
        window.setTimeout(
          () => {
            if (!entry.done) {
              log.classList.add('drift');
              this.timers.push(window.setTimeout(() => log.remove(), 400));
              missLog();
            }
            if (liveStrum === entry) liveStrum = null;
          },
          reduce ? SAWMILL_WINDOW_MS * 4 : sp.atMs + SAWMILL_FALL_MS + SAWMILL_WINDOW_MS,
        ),
      );
    };

    const tryStrum = (): boolean => {
      const log = liveStrum;
      if (!log || log.done) return false;
      // Judge by LIVE on-screen position (like every other log), not a clock —
      // a taller board changes the fall timing but the pixel truth always holds,
      // so the split lands exactly on the blade line.
      if (!reduce) {
        const band = (mill?.getBoundingClientRect().height || 300) * 0.15;
        if (Math.abs(cutOffset(log)) > band) return false;
      }
      log.done = true;
      log.elm.style.transition = 'none';
      log.elm.style.top = `${log.elm.offsetTop}px`;
      mill?.classList.add('strum-hit');
      if (mill) sawInHalf(mill, log.elm, true);
      this.timers.push(window.setTimeout(() => mill?.classList.remove('strum-hit'), 500));
      scoreCut(true);
      feedback.deliver(); // the final chord
      vibrate([18, 60, 24]);
      return true;
    };

    // How far a log's cut point (the round face, low on the sprite) sits from
    // the blade line RIGHT NOW, in pixels — the live on-screen truth, so a tap
    // is judged against exactly what the player sees, not a separate clock.
    const cutOffset = (log: LiveLog): number => {
      if (!lineEl) return 9999;
      const body = (log.elm.querySelector('.mg-log-body') ?? log.elm).getBoundingClientRect();
      const line = lineEl.getBoundingClientRect();
      // the cut point is ~78% down the log body (where the round end-grain sits)
      return body.top + body.height * 0.78 - (line.top + line.height / 2);
    };
    // Anticipation: the blade line brightens as a log enters the good zone.
    if (!reduce) {
      const pulse = (): void => {
        let near = false;
        for (const q of live) for (const lg of q) if (!lg.done && Math.abs(cutOffset(lg)) < 46) near = true;
        if (liveStrum && !liveStrum.done && Math.abs(cutOffset(liveStrum)) < 60) near = true;
        lineEl?.classList.toggle('ready', near);
        this.rafs.push(requestAnimationFrame(pulse));
      };
      this.rafs.push(requestAnimationFrame(pulse));
    }

    laneEls.forEach((lane, li) => {
      lane.style.touchAction = 'none';
      lane.onpointerdown = (ev) => {
        if (tryStrum()) return;
        if (reduce) return; // reduced motion: the per-log tap handlers do the work
        // Judge by LIVE position: the nearest live log to the blade line wins,
        // and only if its round face is actually within the cut band — so the
        // click lands where the eye is, every time.
        const laneH = lane.getBoundingClientRect().height || 300;
        const good = laneH * 0.15; // forgiving cut band
        const perfect = laneH * 0.05; // the clean-cut sliver
        let log: LiveLog | undefined;
        let bestAbs = Infinity;
        for (const lg of live[li]!) {
          if (lg.done) continue;
          const abs = Math.abs(cutOffset(lg));
          if (abs < bestAbs) {
            bestAbs = abs;
            log = lg;
          }
        }
        if (!log || bestAbs > good) return; // nothing at the blade: no penalty
        if (log.kind === 'hold') {
          // A LONG CUT: hold the saw through the log. Press in-window, keep
          // holding — the full ride is a clean cut; letting go early still cuts.
          log.done = true;
          const startHold = performance.now();
          moveBlade(li); // the blade rides over onto the long log
          log.elm.classList.add('holding');
          log.elm.style.transition = 'none';
          log.elm.style.top = `${log.elm.offsetTop}px`;
          lane.setPointerCapture(ev.pointerId);
          let settled = false;
          const settle = (full: boolean): void => {
            if (settled) return;
            settled = true;
            lane.onpointerup = null;
            sawInHalf(lane, log.elm);
            lane.classList.add('flash');
            this.timers.push(window.setTimeout(() => lane.classList.remove('flash'), 240));
            scoreCut(full);
          };
          lane.onpointerup = () => settle(performance.now() - startHold >= SAWMILL_HOLD_MS * 0.8);
          this.timers.push(window.setTimeout(() => settle(true), SAWMILL_HOLD_MS));
          // the saw sings while you hold
          for (let k = 1; k <= 3; k++)
            this.timers.push(window.setTimeout(() => !settled && feedback.tick(360 + k * 70), k * 240));
          return;
        }
        onCut(lane, log, bestAbs <= perfect);
      };
    });

    this.startButton('Start the saw', () => {
      const actions = el('mg-actions');
      if (actions) actions.innerHTML = '';
      const t0 = performance.now();
      schedule.forEach((sp) => {
        if (sp.kind === 'strum') {
          this.timers.push(window.setTimeout(() => spawnStrum(sp, t0), sp.atMs));
          return;
        }
        this.timers.push(
          window.setTimeout(() => {
            const lane = laneEls[sp.lane];
            if (!lane) return;
            const log = document.createElement('div');
            log.className = `mg-log${sp.kind === 'hold' ? ' mg-log-hold' : ''}`;
            log.innerHTML = logMarkup(sp.kind === 'hold' ? 'hold' : 'log');
            lane.appendChild(log);
            if (reduce) {
              // Reduced motion: the log waits ON the line — tap it in your own time.
              log.style.top = `${LINE_PCT * 100}%`;
              const entry: LiveLog = { elm: log, crossAt: performance.now(), done: false, kind: sp.kind };
              live[sp.lane]!.push(entry);
              log.onpointerdown = (ev2) => {
                ev2.stopPropagation();
                if (!entry.done) onCut(lane, entry, true);
              };
              this.timers.push(
                window.setTimeout(() => {
                  if (!entry.done) log.remove();
                  const q = live[sp.lane]!;
                  const at = q.indexOf(entry);
                  if (at >= 0) q.splice(at, 1);
                }, SAWMILL_WINDOW_MS * 3),
              );
              return;
            }
            // Full motion: ride the flume — a slow, readable fall past the blade
            // line. crossAt is exact wall-clock (transition-independent).
            const crossAt = t0 + sp.atMs + SAWMILL_FALL_MS;
            const entry: LiveLog = { elm: log, crossAt, done: false, kind: sp.kind };
            live[sp.lane]!.push(entry);
            const totalMs = SAWMILL_FALL_MS / LINE_PCT;
            requestAnimationFrame(() => {
              log.style.transition = `top ${Math.round(totalMs)}ms linear`;
              log.style.top = '104%';
            });
            this.timers.push(
              window.setTimeout(
                () => {
                  if (!entry.done) {
                    log.classList.add('drift'); // slides off — no penalty, the song rests
                    this.timers.push(window.setTimeout(() => log.remove(), 400));
                    missLog();
                  }
                  const q = live[sp.lane]!;
                  const at = q.indexOf(entry);
                  if (at >= 0) q.splice(at, 1);
                },
                sp.atMs + SAWMILL_FALL_MS + SAWMILL_WINDOW_MS / 2 + (sp.kind === 'hold' ? SAWMILL_HOLD_MS : 0),
              ),
            );
          }, sp.atMs),
        );
      });
      this.timers.push(
        window.setTimeout(
          () =>
            this.finish(
              sawmillReward(hits, perfects, schedule.length, bestCombo),
              undefined,
              sawmillScore(hits, perfects, bestCombo),
            ),
          SAWMILL_DURATION_MS + 600,
        ),
      );
    });
  }
}
