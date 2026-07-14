/**
 * Village Life UI — the little building games. One overlay hosts them all;
 * which one runs is chosen by the building you tapped on the map. Each is a
 * short, no-fail delight built from sprites we already ship. The maths lives in
 * ../core/minigames (pure + seeded); this file is only presentation + timing.
 */
import type { Game } from '../core/game';
import {
  BEACON_ROWS,
  FORAGE_SIZE,
  FORAGE_STEPS,
  FORGE_CELLS,
  FORGE_DURATION_MS,
  STACKS_PAIRS,
  beaconPath,
  beaconReward,
  beaconSlot,
  catchReward,
  fishBite,
  forageField,
  forageTile,
  forgeReward,
  forgeSchedule,
  stacksDeck,
  stacksReward,
  wishingWell,
  type ForageKind,
  type MgReward,
} from '../core/minigames';
import type { ChainId } from '../core/types';
import { MINIGAME_BY_ID, WISHES } from '../data/minigames';
import { artUrl, tileMarkup } from './art';
import { feedback } from './feedback';
import { toast } from './toast';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

export class MinigameUI {
  private id: string | null = null;
  private timers: number[] = [];

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
    return (
      document.body.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  }

  private clearTimers(): void {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }

  /** Open the overlay for a building's game and begin the first run. */
  open(id: string): void {
    const def = MINIGAME_BY_ID[id];
    if (!def) return;
    const overlay = el('minigame-overlay');
    if (overlay) overlay.hidden = false;
    const title = el('mg-title');
    if (title) title.textContent = def.title;
    const sub = el('mg-sub');
    if (sub) sub.textContent = def.blurb;
    this.play(id);
  }

  private close(): void {
    this.clearTimers();
    const overlay = el('minigame-overlay');
    if (overlay) overlay.hidden = true;
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
  }

  private finish(reward: MgReward, wish?: { who: string; text: string }): void {
    if (!this.id) return;
    this.game.finishMinigame(this.id, reward, wish);
    feedback.chime(560);
    this.showResult(reward, wish);
  }

  private showResult(reward: MgReward, wish?: { who: string; text: string }): void {
    const result = el('mg-result');
    const title = el('mg-result-title');
    const body = el('mg-result-body');
    if (!result || !title || !body) return;
    title.textContent = reward.heart || 'A good little while.';
    const items = reward.items
      .map((it) => `<span class="mg-reward-item">${tileMarkup(it.chain, it.level)}</span>`)
      .join('');
    body.innerHTML =
      `<div class="mg-reward-row">${items}</div>` +
      `<p class="mg-reward-line">🪙 ${reward.coins}${reward.ember > 0 ? ` · 🔥 +${reward.ember} energy` : ''}</p>` +
      (wish ? `<p class="mg-wish">“${wish.who} ${wish.text}”</p>` : '') +
      `<p class="mg-reward-hint">Kept in your Repository, ready for the village’s needs.</p>`;
    result.hidden = false;
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

  // ---------- 1) Wishing Well ----------

  private playWell(seed: number): void {
    const stage = el('mg-stage');
    if (!stage) return;
    const res = wishingWell(seed, this.game.wishCount());
    const wsrc = res.wishIndex >= 0 ? WISHES[res.wishIndex] : undefined;
    const wish = wsrc ? { who: wsrc.who, text: wsrc.text } : undefined;
    const wellUrl = artUrl('prop_well');
    stage.innerHTML =
      `<div class="mg-well">` +
      (wellUrl
        ? `<img class="mg-well-art" src="${wellUrl}" alt="" />`
        : `<div class="mg-well-fallback" aria-hidden="true">🕳️</div>`) +
      `<div class="mg-pebble"></div><div class="mg-ripple"></div></div>`;
    const done = () => this.finish(res, wish);
    this.startButton('Drop a pebble', () => {
      const actions = el('mg-actions');
      if (actions) actions.innerHTML = '';
      if (this.reduce()) return done();
      const pebble = stage.querySelector<HTMLElement>('.mg-pebble');
      const ripple = stage.querySelector<HTMLElement>('.mg-ripple');
      pebble?.classList.add('drop');
      feedback.chime(300);
      this.timers.push(
        window.setTimeout(() => {
          pebble?.classList.add('gone');
          ripple?.classList.add('go');
          feedback.chime(210);
        }, 950),
      );
      this.timers.push(window.setTimeout(done, 1550));
    });
  }

  // ---------- 2) Beacon Drop (plinko) ----------

  private playBeacon(seed: number): void {
    const stage = el('mg-stage');
    if (!stage) return;
    const path = beaconPath(seed);
    const slot = beaconSlot(path);
    const reward = beaconReward(slot);
    const slots = BEACON_ROWS + 1;
    const beaconUrl = artUrl('fx_flame_beacon');
    let pegs = '';
    for (let r = 0; r < BEACON_ROWS; r++) {
      const count = r + 2;
      let row = '';
      for (let c = 0; c < count; c++) row += `<span class="mg-peg"></span>`;
      pegs += `<div class="mg-peg-row">${row}</div>`;
    }
    let slotCells = '';
    for (let s = 0; s < slots; s++) {
      const dist = Math.abs(s - BEACON_ROWS / 2);
      slotCells += `<div class="mg-slot ${dist === 0 ? 'heart' : dist <= 2 ? 'good' : ''}" data-slot="${s}"></div>`;
    }
    stage.innerHTML =
      `<div class="mg-beacon">` +
      `<div class="mg-beacon-lamp">${beaconUrl ? `<img src="${beaconUrl}" alt="" />` : '🔆'}</div>` +
      `<div class="mg-pegs">${pegs}</div>` +
      `<div class="mg-slots">${slotCells}</div>` +
      `<div class="mg-ember"></div></div>`;
    const ember = stage.querySelector<HTMLElement>('.mg-ember');
    const land = () => {
      stage.querySelector<HTMLElement>(`.mg-slot[data-slot="${slot}"]`)?.classList.add('lit');
      this.finish(reward);
    };
    this.startButton('Release the light', () => {
      const actions = el('mg-actions');
      if (actions) actions.innerHTML = '';
      if (this.reduce() || !ember) return land();
      // Walk the ember down the seeded path: centre → left/right each row.
      let x = 50; // percent
      const step = 44 / BEACON_ROWS; // total lateral spread
      ember.style.left = `${x}%`;
      ember.style.top = `6%`;
      feedback.chime(480);
      path.forEach((dir, i) => {
        this.timers.push(
          window.setTimeout(
            () => {
              x += (dir === 1 ? 1 : -1) * step;
              ember.style.left = `${x}%`;
              ember.style.top = `${10 + ((i + 1) / (BEACON_ROWS + 1)) * 72}%`;
              feedback.chime(360 + i * 8);
            },
            220 * (i + 1),
          ),
        );
      });
      this.timers.push(window.setTimeout(land, 220 * (BEACON_ROWS + 1) + 200));
    });
  }

  // ---------- 3) Strike While Hot (whack-a-mole) ----------

  private playForge(seed: number): void {
    const stage = el('mg-stage');
    if (!stage) return;
    const schedule = forgeSchedule(seed);
    const flameUrl = artUrl('fx_flame_forge') ?? artUrl('fx_flame_small');
    let cells = '';
    for (let i = 0; i < FORGE_CELLS; i++)
      cells += `<button class="mg-forge-cell" data-cell="${i}" aria-label="anvil"></button>`;
    stage.innerHTML =
      `<div class="mg-forge"><div class="mg-forge-grid">${cells}</div>` +
      `<div class="mg-forge-bar"><span class="mg-forge-fill"></span></div>` +
      `<p class="mg-forge-score">Strikes: <b id="mg-forge-hits">0</b></p></div>`;
    const hitsEl = el('mg-forge-hits');
    let hits = 0;
    const liveSpawn: Record<number, number | undefined> = {};
    const cellEls = Array.from(stage.querySelectorAll<HTMLButtonElement>('.mg-forge-cell'));
    cellEls.forEach((c) => {
      c.onclick = () => {
        const cell = Number(c.dataset.cell);
        if (liveSpawn[cell] === undefined) return; // not hot: no penalty, just nothing
        liveSpawn[cell] = undefined;
        c.classList.remove('hot');
        c.style.backgroundImage = '';
        hits += 1;
        if (hitsEl) hitsEl.textContent = String(hits);
        feedback.merge(1);
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
            if (flameUrl) c.style.backgroundImage = `url(${flameUrl})`;
            this.timers.push(
              window.setTimeout(() => {
                if (liveSpawn[sp.cell] === si) {
                  liveSpawn[sp.cell] = undefined;
                  c.classList.remove('hot');
                  c.style.backgroundImage = '';
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
        window.setTimeout(() => this.finish(forgeReward(hits, schedule.length)), FORGE_DURATION_MS + 400),
      );
    });
  }

  // ---------- 4) Joss's Catch (bobber timing) ----------

  private playCatch(seed: number): void {
    const stage = el('mg-stage');
    if (!stage) return;
    const { delayMs, windowMs } = fishBite(seed);
    stage.innerHTML =
      `<div class="mg-catch"><div class="mg-catch-water"><div class="mg-bobber"></div></div>` +
      `<p class="mg-catch-hint">Cast, then strike the moment the bobber dips.</p></div>`;
    const water = stage.querySelector<HTMLElement>('.mg-catch-water');
    const bobber = stage.querySelector<HTMLElement>('.mg-bobber');
    const hint = stage.querySelector<HTMLElement>('.mg-catch-hint');
    this.startButton('Cast the line', () => {
      const actions = el('mg-actions');
      if (actions) actions.innerHTML = '';
      if (hint) hint.textContent = 'Wait for it…';
      let dipAt = 0;
      let resolved = false;
      const resolve = (quality: number) => {
        if (resolved) return;
        resolved = true;
        this.finish(catchReward(quality));
      };
      water?.addEventListener('click', () => {
        if (resolved) return;
        if (!dipAt) {
          if (hint) hint.textContent = 'Too soon — it darted off!';
          resolve(0);
          return;
        }
        resolve(Math.max(0, 1 - (performance.now() - dipAt) / windowMs));
      });
      this.timers.push(
        window.setTimeout(() => {
          if (resolved) return;
          dipAt = performance.now();
          bobber?.classList.add('dip');
          if (hint) hint.textContent = 'Strike!';
          feedback.chime(300);
          this.timers.push(window.setTimeout(() => resolve(0.2), windowMs + 250)); // slipped, but a nibble
        }, delayMs),
      );
    });
  }

  // ---------- 5) The Foraging Expedition (fog grid) ----------

  private playForage(seed: number): void {
    const stage = el('mg-stage');
    if (!stage) return;
    const { kinds } = forageField(seed);
    let steps = FORAGE_STEPS;
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
    const end = () => this.finish({ ...acc, heart: 'You came home with your basket full — and a story or two.' });
    // A "head home" button so you can stop early and keep everything found.
    const actions = el('mg-actions');
    if (actions) {
      actions.innerHTML = '';
      const b = document.createElement('button');
      b.className = 'btn-ghost mg-go';
      b.textContent = 'Head home';
      b.onclick = end;
      actions.appendChild(b);
    }
    const glyph = (kind: ForageKind, pay: typeof acc): string => {
      if (kind === 'item' && pay.items.length) return tileMarkup(pay.items[0]!.chain, pay.items[0]!.level);
      if (kind === 'coins') return `<span class="mg-fog-ico">🪙</span>`;
      if (kind === 'ember') return `<span class="mg-fog-ico">🔥</span>`;
      if (kind === 'heart') return `<span class="mg-fog-ico">🍯</span>`;
      return `<span class="mg-fog-ico mg-fog-view">🌿</span>`;
    };
    stage.querySelectorAll<HTMLButtonElement>('.mg-fog').forEach((t) => {
      t.onclick = () => {
        if (steps <= 0 || t.classList.contains('found')) return;
        const i = Number(t.dataset.i);
        const kind = kinds[i]!;
        const pay = forageTile(seed, i, kind);
        acc.coins += pay.coins;
        acc.ember += pay.ember;
        acc.items.push(...pay.items);
        steps -= 1;
        if (stepsEl) stepsEl.textContent = String(steps);
        t.classList.add('found', `k-${kind}`);
        t.innerHTML = glyph(kind, pay);
        feedback.chime(kind === 'heart' ? 520 : 360);
        if (steps <= 0) this.timers.push(window.setTimeout(end, 600));
      };
    });
  }

  // ---------- 6) Sorting the Stacks (memory pairs) ----------

  private playStacks(seed: number): void {
    const stage = el('mg-stage');
    if (!stage) return;
    const deck = stacksDeck(seed);
    // Six distinct shelf faces, reusing item art.
    const FACES: readonly [ChainId, number][] = [
      ['wood', 3],
      ['harvest', 3],
      ['flowers', 3],
      ['water', 3],
      ['honey', 3],
      ['herbs', 3],
    ];
    const face = (v: number) => tileMarkup(FACES[v]![0], FACES[v]![1]);
    let cards = '';
    deck.forEach(
      (v, i) => (cards += `<button class="mg-card" data-i="${i}" data-v="${v}" aria-label="card"></button>`),
    );
    stage.innerHTML =
      `<div class="mg-stacks"><div class="mg-stacks-grid">${cards}</div>` +
      `<p class="mg-stacks-hint">Flips: <b id="mg-stacks-flips">0</b></p></div>`;
    const flipsEl = el('mg-stacks-flips');
    let flips = 0;
    let matched = 0;
    let first = -1;
    let busy = false;
    const cardEls = Array.from(stage.querySelectorAll<HTMLButtonElement>('.mg-card'));
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
          feedback.merge(1);
          if (matched === STACKS_PAIRS)
            this.timers.push(window.setTimeout(() => this.finish(stacksReward(flips)), 550));
        } else {
          busy = true;
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
}
