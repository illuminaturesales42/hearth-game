/**
 * The Hearth Energy panel (concept screen #2). Shows the energy ring, the
 * positive-only streak, chest countdown, and the full catalogue of real-world
 * ways to earn energy. Owns the photo / motion / self-report flows.
 */
import type { Game } from '../core/game';
import type { EnergyAction } from '../core/types';
import { DAILY_GAUGE, featuredActions, moreActions } from '../data/actions';
import { chestDaysLeft, doneCount } from '../core/actions';
import { capturePhoto } from './photo-action';
import { runMotion } from './motion-action';
import { toast } from './toast';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

export class EnergyPanel {
  private expanded = false;

  constructor(private game: Game) {
    const close = el<HTMLButtonElement>('energy-close');
    if (close) close.onclick = () => this.close();
    const more = el<HTMLButtonElement>('energy-more');
    if (more)
      more.onclick = () => {
        this.expanded = !this.expanded;
        this.render();
      };
    game.subscribe((ev) => {
      if (this.isOpen() && (ev.type === 'state' || ev.type === 'action' || ev.type === 'health' || ev.type === 'chest')) {
        this.render();
      }
    });
  }

  isOpen(): boolean {
    return !(el('energy-panel')?.hidden ?? true);
  }
  open(): void {
    const p = el('energy-panel');
    if (!p) return;
    p.hidden = false;
    this.render();
  }
  close(): void {
    const p = el('energy-panel');
    if (p) p.hidden = true;
  }

  private render(): void {
    const s = this.game.snapshot;
    const energy = s.energy.current;
    el('energy-big')!.textContent = String(energy);
    const pct = Math.min(100, Math.round((energy / DAILY_GAUGE) * 100));
    const fill = el('energy-fill');
    if (fill) fill.style.width = `${pct}%`;
    el('energy-streak')!.textContent = `${s.actions.streak}`;
    el('energy-chest')!.textContent = `${chestDaysLeft(s.actions)}`;

    const list = el('energy-list');
    if (list) {
      list.innerHTML = '';
      for (const a of featuredActions()) list.appendChild(this.row(a));
    }
    const moreList = el('energy-more-list');
    if (moreList) {
      moreList.hidden = !this.expanded;
      moreList.innerHTML = '';
      if (this.expanded) for (const a of moreActions()) moreList.appendChild(this.row(a));
    }
    const moreBtn = el('energy-more');
    if (moreBtn) moreBtn.textContent = this.expanded ? 'Fewer ways ▲' : 'More ways to earn energy ▼';
  }

  private row(a: EnergyAction): HTMLElement {
    const s = this.game.snapshot;
    const row = document.createElement('div');
    row.className = 'earn-row';

    const done = this.isDone(a);
    row.innerHTML =
      `<span class="earn-ico">${a.icon}</span>` +
      `<span class="earn-body"><b>${a.label}</b><span>${a.sublabel}</span></span>` +
      `<span class="earn-gain">+${a.energy}</span>`;

    const ctrl = document.createElement('div');
    ctrl.className = 'earn-ctrl';
    if (done) {
      ctrl.innerHTML = '<span class="earn-check">✓</span>';
    } else if (a.kind === 'sensor') {
      ctrl.innerHTML = '<span class="earn-auto">Auto</span>';
      row.title = 'Syncs from your phone’s health data';
    } else {
      const btn = document.createElement('button');
      btn.className = 'earn-btn';
      btn.textContent = a.kind === 'photo' ? 'Go' : 'Do';
      btn.onclick = () => void this.perform(a);
      ctrl.appendChild(btn);
    }
    row.appendChild(ctrl);
    void s; // snapshot referenced for potential future per-row state
    return row;
  }

  private isDone(a: EnergyAction): boolean {
    const s = this.game.snapshot;
    if (a.kind === 'sensor') {
      const l = s.healthLedger;
      if (!l) return false;
      return a.sensor === 'steps' ? l.stepsGranted > 0 : l.sleepGranted;
    }
    return doneCount(s.actions, a.id) >= a.timesPerDay;
  }

  private async perform(a: EnergyAction): Promise<void> {
    if (!this.game.canDoAction(a.id)) {
      toast('Already done today. Tomorrow is a new day.');
      return;
    }
    let ok = true;
    if (a.kind === 'photo') ok = await capturePhoto(a);
    else if (a.kind === 'motion') ok = await runMotion(a);
    // selfReport: immediate
    if (ok) this.game.completeAction(a.id);
  }
}
