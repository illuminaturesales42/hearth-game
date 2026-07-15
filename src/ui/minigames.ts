/**
 * Village Life UI — the little building games. One overlay hosts them all;
 * which one runs is chosen by the building you tapped on the map. Each is a
 * short, no-fail delight built from sprites we already ship. The maths lives in
 * ../core/minigames (pure + seeded); this file is only presentation + timing.
 */
import type { Game } from '../core/game';
import {
  BEACON_ROWS,
  BEACON_SLOTS,
  FORAGE_SIZE,
  FORAGE_STEPS,
  FORGE_CELLS,
  FORGE_DURATION_MS,
  STACKS_PAIRS,
  WELL_SLOTS,
  beaconDrop,
  beaconReward,
  beaconScore,
  catchReward,
  fishBite,
  forageField,
  forageTile,
  forgeReward,
  forgeSchedule,
  stacksDeck,
  stacksReward,
  wellScore,
  wishingWellReward,
  type ForageKind,
  type MgReward,
} from '../core/minigames';
import type { ChainId } from '../core/types';
import { MINIGAME_BY_ID, WISHES } from '../data/minigames';
import { artUrl, tileMarkup } from './art';
import { feedback } from './feedback';
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
};

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
    this.timers.push(window.setTimeout(() => tip.remove(), 4600));
  }

  private finish(reward: MgReward, wish?: { who: string; text: string }, score?: number): void {
    if (!this.id) return;
    const res = this.game.finishMinigame(this.id, reward, wish, score);
    feedback.chime(res.isBest ? 720 : 560);
    this.showResult(reward, wish, res.isBest);
  }

  private showResult(reward: MgReward, wish?: { who: string; text: string }, isBest?: boolean): void {
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
      (isBest ? `<p class="mg-best">✦ A new personal best!</p>` : '') +
      (wish ? `<p class="mg-wish">“${wish.who} ${wish.text}”</p>` : '') +
      `<p class="mg-reward-hint">Kept in your Repository, ready for the village’s needs.</p>`;
    result.hidden = false;
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

  // ---------- 1) Wishing Well (aim the drop) ----------

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
      return `<button class="mg-ring ${cls}" data-slot="${s}" aria-label="ring ${s + 1} of ${WELL_SLOTS}"></button>`;
    }).join('');
    stage.innerHTML =
      `<div class="mg-well">${wellArt}` +
      `<div class="mg-well-track"><div class="mg-aim"></div></div>` +
      `<div class="mg-well-rings">${rings}</div>` +
      `<div class="mg-pebble"></div><div class="mg-ripple"></div></div>`;

    // Resolve a chosen ring → reward, animate the pebble to it, then bank it.
    const drop = (slotRaw: number): void => {
      const slot = Math.max(0, Math.min(WELL_SLOTS - 1, slotRaw));
      const res = wishingWellReward(slot, seed, this.game.wishCount());
      const wsrc = res.wishIndex >= 0 ? WISHES[res.wishIndex] : undefined;
      const wish = wsrc ? { who: wsrc.who, text: wsrc.text } : undefined;
      stage.querySelector<HTMLElement>(`.mg-ring[data-slot="${slot}"]`)?.classList.add('lit');
      const done = () => this.finish(res, wish, wellScore(slot));
      if (this.reduce()) return done();
      const pebble = stage.querySelector<HTMLElement>('.mg-pebble');
      const ripple = stage.querySelector<HTMLElement>('.mg-ripple');
      if (pebble) pebble.style.left = `${((slot + 0.5) / WELL_SLOTS) * 100}%`;
      pebble?.classList.add('drop');
      feedback.chime(320);
      this.timers.push(
        window.setTimeout(() => {
          pebble?.classList.add('gone');
          ripple?.classList.add('go');
          feedback.chime(slot === 2 ? 540 : 220);
        }, 880),
      );
      this.timers.push(window.setTimeout(done, 1480));
    };

    // Reduced motion: tap the ring you want (no timed sweep). Fully accessible.
    if (this.reduce()) {
      this.coachOnce('wishing-well', 'Choose a ring — the centre roots the deepest wish.');
      stage.querySelectorAll<HTMLButtonElement>('.mg-ring').forEach((b) => {
        b.onclick = () => {
          stage.querySelectorAll<HTMLButtonElement>('.mg-ring').forEach((r) => (r.disabled = true));
          drop(Number(b.dataset.slot));
        };
      });
      const actions = el('mg-actions');
      if (actions) actions.innerHTML = '';
      return;
    }

    // Full motion: a light sweeps the rings; tap to release it where it lands.
    this.coachOnce('wishing-well', 'Tap the moment the light lines up with the centre ring.');
    const aim = stage.querySelector<HTMLElement>('.mg-aim');
    const track = stage.querySelector<HTMLElement>('.mg-well-track');
    aim?.classList.add('sweep');
    this.startButton('Drop the pebble', () => {
      const actions = el('mg-actions');
      if (actions) actions.innerHTML = '';
      let slot = 2;
      if (aim && track) {
        const a = aim.getBoundingClientRect();
        const t = track.getBoundingClientRect();
        const pct = t.width ? (a.left + a.width / 2 - t.left) / t.width : 0.5;
        slot = Math.max(0, Math.min(WELL_SLOTS - 1, Math.floor(pct * WELL_SLOTS)));
        aim.classList.remove('sweep');
        aim.style.left = `${((slot + 0.5) / WELL_SLOTS) * 100}%`;
      }
      drop(slot);
    });
  }

  // ---------- 2) Beacon Drop (aim the release) ----------

  private playBeacon(seed: number): void {
    const stage = el('mg-stage');
    if (!stage) return;
    const beaconUrl = artUrl('fx_flame_beacon');
    let pegs = '';
    for (let r = 0; r < BEACON_ROWS; r++) {
      const count = r + 2;
      let row = '';
      for (let c = 0; c < count; c++) row += `<span class="mg-peg"></span>`;
      pegs += `<div class="mg-peg-row">${row}</div>`;
    }
    let slotCells = '';
    for (let s = 0; s < BEACON_SLOTS; s++) {
      const dist = Math.abs(s - BEACON_ROWS / 2);
      slotCells += `<button class="mg-slot ${dist === 0 ? 'heart' : dist <= 2 ? 'good' : ''}" data-slot="${s}" aria-label="slot ${s + 1}"></button>`;
    }
    stage.innerHTML =
      `<div class="mg-beacon">` +
      `<div class="mg-beacon-lamp">${beaconUrl ? `<img src="${beaconUrl}" alt="" />` : '🔆'}</div>` +
      `<div class="mg-beacon-aim-track"><div class="mg-beacon-aim"></div></div>` +
      `<div class="mg-pegs">${pegs}</div>` +
      `<div class="mg-slots">${slotCells}</div>` +
      `<div class="mg-ember"></div></div>`;
    const ember = stage.querySelector<HTMLElement>('.mg-ember');

    // Release from a chosen column → seeded drift → final slot → reward.
    const release = (targetSlot: number): void => {
      const slot = beaconDrop(targetSlot, seed);
      const reward = beaconReward(slot);
      const land = () => {
        stage.querySelector<HTMLElement>(`.mg-slot[data-slot="${slot}"]`)?.classList.add('lit');
        this.finish(reward, undefined, beaconScore(slot));
      };
      if (this.reduce() || !ember) return land();
      // Fall from the aimed column, wobbling toward the final slot.
      const startX = ((targetSlot + 0.5) / BEACON_SLOTS) * 100;
      const endX = ((slot + 0.5) / BEACON_SLOTS) * 100;
      ember.style.left = `${startX}%`;
      ember.style.top = `6%`;
      feedback.chime(480);
      const steps = BEACON_ROWS;
      for (let i = 1; i <= steps; i++) {
        this.timers.push(
          window.setTimeout(() => {
            const t = i / steps;
            const wobble = Math.sin(i * 1.7) * (1 - t) * 4; // settles as it nears the slot
            ember.style.left = `${startX + (endX - startX) * t + wobble}%`;
            ember.style.top = `${10 + t * 72}%`;
            feedback.chime(360 + i * 8);
          }, 200 * i),
        );
      }
      this.timers.push(window.setTimeout(land, 200 * (steps + 1)));
    };

    // Reduced motion: tap the slot you aim for (no sweep).
    if (this.reduce()) {
      this.coachOnce('beacon-drop', 'Aim for the centre slot — the light draws the finest catch there.');
      stage.querySelectorAll<HTMLButtonElement>('.mg-slot').forEach((b) => {
        b.onclick = () => {
          stage.querySelectorAll<HTMLButtonElement>('.mg-slot').forEach((r) => (r.disabled = true));
          release(Number(b.dataset.slot));
        };
      });
      const actions = el('mg-actions');
      if (actions) actions.innerHTML = '';
      return;
    }

    // Full motion: a launch marker sweeps the top; tap to release from there.
    this.coachOnce('beacon-drop', 'A launch light sweeps above — release it aimed at the centre.');
    const aim = stage.querySelector<HTMLElement>('.mg-beacon-aim');
    const track = stage.querySelector<HTMLElement>('.mg-beacon-aim-track');
    aim?.classList.add('sweep');
    this.startButton('Release the light', () => {
      const actions = el('mg-actions');
      if (actions) actions.innerHTML = '';
      let targetSlot = BEACON_ROWS / 2;
      if (aim && track) {
        const a = aim.getBoundingClientRect();
        const t = track.getBoundingClientRect();
        const pct = t.width ? (a.left + a.width / 2 - t.left) / t.width : 0.5;
        targetSlot = Math.max(0, Math.min(BEACON_ROWS, Math.round(pct * BEACON_ROWS)));
        aim.classList.remove('sweep');
      }
      release(targetSlot);
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
      `<p class="mg-forge-score">Strikes: <b id="mg-forge-hits">0</b><span id="mg-forge-combo" class="mg-combo"></span></p></div>`;
    this.coachOnce('forge-strike', 'Strike each glowing anvil before it cools — a clean run forges a bar.');
    const hitsEl = el('mg-forge-hits');
    const comboEl = el('mg-forge-combo');
    let hits = 0;
    let combo = 0; // consecutive clean strikes — brighter chime, a warm streak note
    const liveSpawn: Record<number, number | undefined> = {};
    const cellEls = Array.from(stage.querySelectorAll<HTMLButtonElement>('.mg-forge-cell'));
    cellEls.forEach((c) => {
      c.onclick = () => {
        const cell = Number(c.dataset.cell);
        if (liveSpawn[cell] === undefined) return; // not hot: no penalty, just nothing
        liveSpawn[cell] = undefined;
        c.classList.remove('hot');
        c.style.backgroundImage = '';
        c.classList.add('struck'); // bright flash on a clean strike
        this.timers.push(window.setTimeout(() => c.classList.remove('struck'), 340));
        hits += 1;
        combo += 1;
        if (hitsEl) hitsEl.textContent = String(hits);
        if (comboEl) comboEl.textContent = combo >= 3 ? ` · ${combo} in a row!` : '';
        feedback.chime(420 + Math.min(combo, 8) * 45); // rises with the streak
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
                  combo = 0; // a cooled anvil breaks the streak (no other penalty)
                  if (comboEl) comboEl.textContent = '';
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
          () => this.finish(forgeReward(hits, schedule.length), undefined, hits),
          FORGE_DURATION_MS + 400,
        ),
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
    this.coachOnce('joss-catch', 'Wait for the bobber to dip, then tap the water — patience lands the best fish.');
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
        this.finish(catchReward(quality), undefined, Math.round(Math.max(0, Math.min(1, quality)) * 100));
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
      // a "nibble" tell just before the dip, so the strike can be anticipated
      this.timers.push(
        window.setTimeout(
          () => {
            if (!resolved && hint) hint.textContent = 'A nibble…';
            bobber?.classList.add('nibble');
          },
          Math.max(0, delayMs - 500),
        ),
      );
      this.timers.push(
        window.setTimeout(() => {
          if (resolved) return;
          dipAt = performance.now();
          bobber?.classList.remove('nibble');
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
    this.coachOnce('foraging', 'Uncover the ground tile by tile. Keep everything — head home whenever you like.');
    const end = () =>
      this.finish(
        { ...acc, heart: 'You came home with your basket full — and a story or two.' },
        undefined,
        acc.items.length + acc.ember, // finds gathered — the forage best
      );
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
    // Painted token if the art's been sliced (mg_forage_*), emoji otherwise —
    // so the grid upgrades the moment the assets land, with no code change.
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
      return token('mg_forage_leaf', '🌿', 'mg-fog-view');
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
      (v, i) => (cards += `<button class="mg-stack-card" data-i="${i}" data-v="${v}" aria-label="card"></button>`),
    );
    stage.innerHTML =
      `<div class="mg-stacks"><div class="mg-stacks-grid">${cards}</div>` +
      `<p class="mg-stacks-hint">Flips: <b id="mg-stacks-flips">0</b></p></div>`;
    this.coachOnce('sorting-stacks', 'Flip two cards to find a matching pair — fewer flips, a finer sort.');
    const flipsEl = el('mg-stacks-flips');
    let flips = 0;
    let matched = 0;
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
          feedback.merge(1);
          if (matched === STACKS_PAIRS)
            this.timers.push(
              // fewer flips → a higher best (perfect = STACKS_PAIRS flips)
              window.setTimeout(() => this.finish(stacksReward(flips), undefined, Math.max(0, 40 - flips)), 550),
            );
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
