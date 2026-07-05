/**
 * Matches bar on the game screen: village happenings surface over time; the
 * player can join for a little energy, or flip on Auto-join to have available
 * matches joined automatically. Daily-capped and gentle so it never nags.
 */
import type { Game } from '../core/game';
import { MATCHES, MATCH_INTERVAL_MS } from '../data/matches';
import type { MatchTemplate } from '../data/matches';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

export class MatchesController {
  private current: MatchTemplate | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private spin = 0;

  constructor(private game: Game) {
    const toggle = el<HTMLInputElement>('auto-join');
    if (toggle) {
      toggle.checked = game.settings.autoJoinMatches;
      toggle.onchange = () => {
        game.setAutoJoinMatches(toggle.checked);
        if (toggle.checked && this.current) this.join();
      };
    }
    game.subscribe((ev) => {
      if (ev.type === 'match') {
        this.current = null;
        this.render();
      }
      if (ev.type === 'settings') {
        const t = el<HTMLInputElement>('auto-join');
        if (t) t.checked = this.game.settings.autoJoinMatches;
      }
    });
    this.timer = setInterval(() => this.tick(), MATCH_INTERVAL_MS);
    this.render();
  }

  private tick(): void {
    if (!this.game.canJoinMatch()) {
      this.current = null;
      this.render();
      return;
    }
    if (this.current) {
      if (this.game.settings.autoJoinMatches) this.join();
      return;
    }
    // Deterministic-enough rotation without Math.random dependency.
    this.spin = (this.spin + 1) % MATCHES.length;
    this.current = MATCHES[this.spin] ?? null;
    this.render();
    if (this.game.settings.autoJoinMatches) window.setTimeout(() => this.join(), 700);
  }

  private join(): void {
    if (this.current) this.game.joinMatch(this.current.id);
  }

  private render(): void {
    const info = el('matches-info');
    if (!info) return;
    if (!this.game.canJoinMatch()) {
      info.innerHTML = `<span class="matches-quiet">The village rests. More happenings tomorrow.</span>`;
      return;
    }
    if (!this.current) {
      info.innerHTML = `<span class="matches-quiet">Watching for village happenings…</span>`;
      return;
    }
    info.innerHTML =
      `<div class="match-chip"><span class="match-dot" aria-hidden="true"></span>` +
      `<span class="match-text"><b>${this.current.name}</b><span>${this.current.blurb}</span></span>` +
      `<button class="earn-btn" id="match-join">Join +${this.current.energy}</button></div>`;
    const btn = el<HTMLButtonElement>('match-join');
    if (btn) btn.onclick = () => this.join();
  }
}
