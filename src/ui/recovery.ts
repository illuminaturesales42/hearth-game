/**
 * Recovery logger: cold plunge + sauna duration pickers. Opened from the
 * Energy panel. Reuses the log-your-own model (once per day each, capped).
 */
import type { Game } from '../core/game';
import { RECOVERY, recoveryEnergy } from '../data/recovery';
import { toast } from './toast';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

export class RecoveryUI {
  constructor(private game: Game) {
    const close = el<HTMLButtonElement>('recovery-menu-close');
    if (close) close.onclick = () => this.close();
  }

  open(): void {
    const body = el('recovery-menu-body');
    const panel = el('recovery-menu');
    if (!body || !panel) return;
    body.innerHTML =
      `<h2 class="energy-h2">Recovery</h2>` +
      `<p class="energy-tag">Log the cold and the heat. The hearth honours the effort.</p>` +
      RECOVERY.map((a) => {
        const done = !this.game.canDoAction(a.id);
        return (
          `<p class="earn-label">${a.icon} ${a.title} · ${a.sublabel}</p>` +
          (done
            ? `<div class="med-log-note">Logged today. Well done.</div>`
            : `<div class="med-log">` +
              a.options
                .map((min) => `<button class="med-log-btn" data-act="${a.id}" data-min="${min}">${min}m<span>+${recoveryEnergy(a, min)}</span></button>`)
                .join('') +
              `</div>`)
        );
      }).join('') +
      `<p class="med-log-note">Once a day each, on your honour.</p>`;

    body.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.act ?? '';
        if (!this.game.canDoAction(id)) {
          toast('Already logged today. Rest and recover.');
          return;
        }
        this.game.logRecovery(id, Number(b.dataset.min));
        this.open();
      };
    });
    panel.hidden = false;
  }

  close(): void {
    const panel = el('recovery-menu');
    if (panel) panel.hidden = true;
  }
}
