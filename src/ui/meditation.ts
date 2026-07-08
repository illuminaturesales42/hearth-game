/**
 * Meditation: a menu of guided sessions + a "log your own" flow. The player
 * follows an animated breath pacer with a countdown and ambient tone; finishing
 * a session grants energy through the action ledger. Narrated audio is a stub
 * (M2 audio pass) — the pacer and tone carry the experience for now.
 */
import type { Game } from '../core/game';
import { LOG_MEDITATION, MEDITATIONS, findMeditation, loggedMinutesToEnergy } from '../data/meditations';
import type { Meditation } from '../data/meditations';
import { actionIcon } from './art';
import { feedback } from './feedback';
import { toast } from './toast';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class MeditationUI {
  private raf = 0;

  constructor(private game: Game) {
    const close = el<HTMLButtonElement>('med-menu-close');
    if (close) close.onclick = () => this.closeMenu();
    const pClose = el<HTMLButtonElement>('med-close');
    if (pClose) pClose.onclick = () => this.stopPlayer(false);
  }

  openMenu(): void {
    const body = el('med-menu-body');
    const panel = el('med-menu');
    if (!body || !panel) return;
    body.innerHTML =
      `<h2 class="energy-h2">Meditation</h2>` +
      `<p class="energy-tag">Sit a while. The hearth rewards a quiet mind.</p>` +
      `<p class="earn-label">Guided sessions</p>` +
      `<div class="earn-list">` +
      MEDITATIONS.map((m) => {
        const done = !this.game.canDoAction(m.id);
        return (
          `<div class="earn-row">` +
          actionIcon('log-meditation', '🧘') +
          `<span class="earn-body"><b>${m.title}</b><span>${m.sublabel} · ${mmss(m.durationSec)}</span></span>` +
          `<span class="earn-gain">+${m.energy}</span>` +
          `<div class="earn-ctrl">` +
          (done ? `<span class="earn-check">✓</span>` : `<button class="earn-btn" data-med="${m.id}">Begin</button>`) +
          `</div></div>`
        );
      }).join('') +
      `</div>` +
      `<p class="earn-label">Log a meditation you did</p>` +
      `<div class="med-log">` +
      LOG_MEDITATION.options
        .map((min) => `<button class="med-log-btn" data-min="${min}">${min}m<span>+${loggedMinutesToEnergy(min)}</span></button>`)
        .join('') +
      `</div>` +
      `<p class="med-log-note">Once a day, on your honour.</p>`;

    body.querySelectorAll<HTMLButtonElement>('[data-med]').forEach((b) => {
      b.onclick = () => {
        const m = findMeditation(b.dataset.med ?? '');
        if (m) this.startSession(m);
      };
    });
    body.querySelectorAll<HTMLButtonElement>('[data-min]').forEach((b) => {
      b.onclick = () => {
        if (!this.game.canDoAction(LOG_MEDITATION.id)) {
          toast('Meditation already logged today. Rest easy.');
          return;
        }
        this.game.logMeditation(Number(b.dataset.min));
        this.openMenu();
      };
    });
    panel.hidden = false;
  }

  closeMenu(): void {
    const panel = el('med-menu');
    if (panel) panel.hidden = true;
  }

  private startSession(m: Meditation): void {
    const player = el('med-player');
    const phase = el('med-phase');
    const ring = el('med-ring');
    const timer = el('med-timer');
    if (!player || !phase || !ring || !timer) return;

    player.hidden = false;
    feedback.ambient(true);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cycle = m.inhaleSec + m.holdSec + m.exhaleSec + m.holdOutSec;
    const start = performance.now();
    let lastPhase = '';

    const step = (t: number) => {
      const elapsed = (t - start) / 1000;
      const remain = Math.max(0, m.durationSec - elapsed);
      timer.textContent = mmss(remain);

      const p = elapsed % cycle;
      let label: string;
      let scale: number;
      if (p < m.inhaleSec) {
        label = 'Breathe in';
        scale = 0.45 + 0.55 * (p / m.inhaleSec);
      } else if (p < m.inhaleSec + m.holdSec) {
        label = 'Hold';
        scale = 1;
      } else if (p < m.inhaleSec + m.holdSec + m.exhaleSec) {
        label = 'Breathe out';
        scale = 1 - 0.55 * ((p - m.inhaleSec - m.holdSec) / m.exhaleSec);
      } else {
        label = 'Rest';
        scale = 0.45;
      }
      phase.textContent = label;
      if (!reduce) ring.style.transform = `scale(${scale.toFixed(3)})`;
      if (label !== lastPhase) {
        if (label === 'Breathe in') feedback.chime();
        lastPhase = label;
      }

      if (remain <= 0) {
        this.game.completeAction(m.id);
        this.stopPlayer(true);
        return;
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private stopPlayer(completed: boolean): void {
    cancelAnimationFrame(this.raf);
    feedback.ambient(false);
    const player = el('med-player');
    if (player) player.hidden = true;
    if (completed) {
      feedback.chime(660);
      this.openMenu();
    }
  }
}
