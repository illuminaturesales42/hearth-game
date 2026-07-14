/**
 * Sunrise "New Day" — shown once per day at first open. A fresh dawn over
 * Emberhollow with a streak-scaled energy reward. Claiming marks the day active
 * (drives the same streak as everything else), so it never double-pays.
 */
import type { Game } from '../core/game';
import { nextTease } from './tease';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

export class NewDayUI {
  constructor(private game: Game) {
    const claim = el<HTMLButtonElement>('newday-claim');
    if (claim) claim.onclick = () => this.claim();
  }

  /** Show the dawn moment if today hasn't been claimed yet. */
  maybeShow(): void {
    if (!this.game.canClaimDaily()) return;
    const p = this.game.dailyRewardPreview();
    el('newday-title')!.textContent = `Day ${p.streak}`;
    el('newday-energy')!.textContent = `+${p.energy}`;
    const streakLine =
      p.streak > 1
        ? `${p.streak}-day streak — the longer you tend the hearth, the more it gives.`
        : 'Return tomorrow to start a streak and grow the reward.';
    el('newday-streak')!.textContent =
      p.chestCoins > 0 ? `${streakLine} A milestone chest, too: +${p.chestCoins} coins.` : streakLine;
    // Give today a face: who's waiting, and what for.
    const tease = nextTease(this.game.snapshot.orderIndex);
    const teaseEl = el('newday-tease');
    if (teaseEl) {
      teaseEl.textContent = tease ? `Today: ${tease}` : '';
      teaseEl.hidden = !tease;
    }
    el('newday-modal')!.hidden = false;
  }

  private claim(): void {
    this.game.claimDaily();
    const modal = el('newday-modal');
    if (modal) modal.hidden = true;
  }
}
