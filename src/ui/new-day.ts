/**
 * Sunrise "New Day" — shown once per day at first open. A fresh dawn over
 * Emberhollow with a streak-scaled energy reward. Claiming marks the day active
 * (drives the same streak as everything else), so it never double-pays.
 */
import type { Game } from '../core/game';
import { nextTease } from './tease';
import { nudgeLine } from '../core/discovery';

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
    const chestLine = p.chestCoins > 0 ? `${streakLine} A milestone chest, too: +${p.chestCoins} coins.` : streakLine;
    // Reassure the player their streak is protected — hearthstones auto-save a missed day.
    const freezes = this.game.freezeCount();
    el('newday-streak')!.textContent =
      freezes > 0
        ? `${chestLine} You hold ${freezes} hearthstone${freezes > 1 ? 's' : ''} — each keeps your streak safe through a missed day.`
        : chestLine;
    // Give today a face: who's waiting, and what for.
    const tease = nextTease(this.game.snapshot.orderIndex);
    const teaseEl = el('newday-tease');
    if (teaseEl) {
      teaseEl.textContent = tease ? `Today: ${tease}` : '';
      teaseEl.hidden = !tease;
    }
    // One warm nudge toward the most worthwhile thing not yet tried — an
    // invitation, never a checklist. The matching glow marks the spot on return.
    const nudgeEl = el('newday-nudge');
    if (nudgeEl) {
      const top = this.game.pendingNudges()[0];
      const line = top ? nudgeLine(top) : '';
      nudgeEl.textContent = line ? `✦ ${line}` : '';
      nudgeEl.hidden = !line;
    }
    el('newday-modal')!.hidden = false;
  }

  private claim(): void {
    this.game.claimDaily();
    const modal = el('newday-modal');
    if (modal) modal.hidden = true;
  }
}
