/**
 * Stargaze: a short night-only session. Shows tonight's real moon phase (from
 * the calendar), gates to after dark, and grants energy with a full-moon bonus.
 * A calm starfield + moon; gaze for a few seconds, then the hearth brightens.
 */
import type { Game } from '../core/game';
import { illumination, isWaxing, phaseName } from '../data/moon';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const GAZE_MS = 8000;

export class StargazeUI {
  private raf = 0;
  private starsBuilt = false;

  constructor(private game: Game) {
    const close = el<HTMLButtonElement>('star-close');
    if (close) close.onclick = () => this.close();
  }

  open(now = Date.now()): void {
    const overlay = el('star-overlay');
    if (!overlay) return;
    this.buildStars();
    this.paintMoon(now);
    overlay.hidden = false;

    const phase = el('star-phase');
    const msg = el('star-msg');
    const gaze = el<HTMLButtonElement>('star-gaze');
    const timer = el('star-timer');
    if (!phase || !msg || !gaze || !timer) return;

    const preview = this.game.stargazePreview(now);
    phase.textContent = `${preview.moon}${preview.bonus > 0 ? ` · full-moon bonus +${preview.bonus}` : ''}`;
    timer.textContent = '';

    if (!this.game.canStargaze(now)) {
      const night = new Date(now).getHours() >= 20 || new Date(now).getHours() < 5;
      msg.textContent = night ? 'You have already gazed tonight. Rest well.' : 'The stars aren’t out yet. Come back after dark.';
      gaze.hidden = true;
      return;
    }
    msg.textContent = `Gaze a while for +${preview.energy} energy.`;
    gaze.hidden = false;
    gaze.disabled = false;
    gaze.textContent = 'Gaze';
    gaze.onclick = () => this.gaze();
  }

  private gaze(): void {
    const gaze = el<HTMLButtonElement>('star-gaze');
    const timer = el('star-timer');
    const msg = el('star-msg');
    if (!gaze || !timer || !msg) return;
    gaze.disabled = true;
    msg.textContent = 'Breathe. Let the night settle.';
    const start = performance.now();
    const step = (t: number) => {
      const left = Math.max(0, GAZE_MS - (t - start));
      timer.textContent = `${Math.ceil(left / 1000)}s`;
      if (left <= 0) {
        this.game.doStargaze();
        this.close();
        return;
      }
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  private close(): void {
    cancelAnimationFrame(this.raf);
    const overlay = el('star-overlay');
    if (overlay) overlay.hidden = true;
  }

  private paintMoon(now: number): void {
    const moon = el('star-moon');
    if (!moon) return;
    const ill = illumination(now);
    // Shift a dark overlay across the disc to suggest the lit fraction.
    const offset = (isWaxing(now) ? 1 : -1) * (1 - ill) * 100;
    moon.style.setProperty('--moon-shadow', `${offset}%`);
    moon.style.setProperty('--moon-glow', `${(0.25 + ill * 0.75).toFixed(2)}`);
    moon.title = phaseName(now);
  }

  private buildStars(): void {
    if (this.starsBuilt) return;
    const field = el('star-field');
    if (!field) return;
    // Deterministic scatter (no Math.random dependency): a woven grid with jitter.
    let html = '';
    for (let i = 0; i < 44; i++) {
      const x = (i * 37) % 100;
      const y = (i * 53) % 92;
      const d = (i % 5) * 0.4;
      const s = 1 + (i % 3);
      html += `<span class="star" style="left:${x}%;top:${y}%;width:${s}px;height:${s}px;animation-delay:${d}s"></span>`;
    }
    field.innerHTML = html;
    this.starsBuilt = true;
  }
}
