/**
 * Bonfire Duel — hot-seat (pass-and-play) UI. Two players share one board and
 * take turns making merges. Tap an item, then tap a matching item to merge it;
 * turn passes. When no merges remain, most points wins and takes the board's
 * spoils into the Repository (which feeds the story), and a win grows the
 * player's win streak → a reward multiplier.
 */
import type { Game } from '../core/game';
import { bestDuelMove, boardSpoils, createDuel, duelMerge, duelWinner } from '../core/duel';
import type { DuelState } from '../core/duel';
import { tileMarkup } from './art';
import { feedback } from './feedback';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

export class DuelUI {
  private state: DuelState | null = null;
  private selected = -1;
  private seed = 12345;
  /** Solo mode: Old Joss takes the friend's chair. */
  private vsAi = false;
  private aiTimer = 0;

  constructor(private game: Game) {
    const close = el<HTMLButtonElement>('duel-close');
    if (close) close.onclick = () => this.close();
    const rematch = el<HTMLButtonElement>('duel-rematch');
    if (rematch) rematch.onclick = () => this.beginMatch(this.vsAi);
    const done = el<HTMLButtonElement>('duel-done');
    if (done) done.onclick = () => this.close();
    const deliver = el<HTMLButtonElement>('duel-deliver');
    if (deliver) deliver.onclick = () => this.game.deliverFromRepository();
    el<HTMLButtonElement>('duel-mode-friend')?.addEventListener('click', () => this.beginMatch(false));
    el<HTMLButtonElement>('duel-mode-ai')?.addEventListener('click', () => this.beginMatch(true));
  }

  private oppName(): string {
    return this.vsAi ? 'Old Joss' : 'Friend';
  }

  /** Open the duel: first choose who's playing, then the board deals. */
  start(): void {
    const overlay = el('duel-overlay');
    const results = el('duel-results');
    const mode = el('duel-mode');
    if (overlay) overlay.hidden = false;
    if (results) results.hidden = true;
    if (mode) mode.hidden = false;
    this.state = null;
    const grid = el('duel-board');
    if (grid) grid.innerHTML = '';
  }

  private beginMatch(vsAi: boolean): void {
    this.vsAi = vsAi;
    const mode = el('duel-mode');
    if (mode) mode.hidden = true;
    const opp = el('duel-opp-name');
    if (opp) opp.textContent = this.oppName();
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    this.state = createDuel(this.seed);
    this.selected = -1;
    const results = el('duel-results');
    if (results) results.hidden = true;
    this.buildGrid();
    this.render();
  }

  private close(): void {
    const overlay = el('duel-overlay');
    if (overlay) overlay.hidden = true;
    this.state = null;
    clearTimeout(this.aiTimer);
  }

  private buildGrid(): void {
    const grid = el('duel-board');
    if (!grid || !this.state) return;
    grid.style.gridTemplateColumns = `repeat(${this.state.board.cols}, 1fr)`;
    grid.innerHTML = '';
    for (let i = 0; i < this.state.board.cells.length; i++) {
      const cell = document.createElement('div');
      cell.className = 'duel-cell';
      cell.dataset.index = String(i);
      cell.addEventListener('click', () => this.tap(i));
      grid.appendChild(cell);
    }
  }

  private tap(index: number): void {
    if (!this.state || this.state.over) return;
    if (this.vsAi && this.state.turn === 1) return; // Joss is thinking
    const cell = this.state.board.cells[index];
    if (!cell || cell.kind !== 'item') {
      this.selected = -1;
      this.render();
      return;
    }
    if (this.selected < 0) {
      this.selected = index;
      this.render();
      return;
    }
    if (this.selected === index) {
      this.selected = -1;
      this.render();
      return;
    }
    const move = duelMerge(this.state, this.selected, index);
    if (move.merged) {
      this.state = move.state;
      this.selected = -1;
      feedback.merge(move.resultLevel);
      this.render();
      if (this.state.over) this.showResults();
      else this.maybeAiMove();
    } else {
      // not a match — reselect the tapped item
      this.selected = index;
      this.render();
    }
  }

  /** Joss ponders a moment, then takes the biggest merge on the table. */
  private maybeAiMove(): void {
    if (!this.vsAi || !this.state || this.state.over || this.state.turn !== 1) return;
    clearTimeout(this.aiTimer);
    this.aiTimer = window.setTimeout(() => {
      if (!this.vsAi || !this.state || this.state.over || this.state.turn !== 1) return;
      const pick = bestDuelMove(this.state);
      if (!pick) return;
      const move = duelMerge(this.state, pick[0], pick[1]);
      if (!move.merged) return;
      this.state = move.state;
      feedback.merge(move.resultLevel);
      this.render();
      if (this.state.over) this.showResults();
    }, 750);
  }

  private render(): void {
    if (!this.state) return;
    const s = this.state;
    for (let i = 0; i < s.board.cells.length; i++) {
      const c = s.board.cells[i]!;
      const cell = el('duel-board')?.children[i] as HTMLElement | undefined;
      if (!cell) continue;
      cell.className = 'duel-cell';
      if (c.kind === 'item') {
        cell.classList.add('item');
        cell.innerHTML = tileMarkup(c.item.chain, c.item.level);
        if (i === this.selected) cell.classList.add('sel');
      } else {
        cell.innerHTML = '';
      }
    }
    el('duel-turn')!.textContent = s.over ? 'Round over' : `${s.turn === 0 ? 'You' : this.oppName()}${s.turn === 0 ? 'r' : '’s'} turn`;
    el('duel-turn')!.className = `duel-turn p${s.turn}`;
    el('duel-score-0')!.textContent = String(s.scores[0]);
    el('duel-score-1')!.textContent = String(s.scores[1]);
  }

  private showResults(): void {
    if (!this.state) return;
    const w = duelWinner(this.state);
    const spoils = boardSpoils(this.state.board);
    const playerWon = w === 0;
    // Only bank when the local player wins (hot-seat: streak/Repository belong to the account).
    this.game.finishDuel(playerWon, spoils, this.state.scores[0]);

    const results = el('duel-results');
    const title = el('duel-result-title');
    const body = el('duel-result-body');
    const deliver = el<HTMLButtonElement>('duel-deliver');
    if (!results || !title || !body || !deliver) return;

    if (w === -1) {
      title.textContent = 'A draw by the fire';
      body.innerHTML = `<p>Evenly matched. The streak resets, but no harm done.</p>`;
    } else if (playerWon) {
      const streak = this.game.duelStreak;
      const mult = (1 + 0.15 * Math.min(streak, 6)).toFixed(2);
      title.textContent = 'You win the duel!';
      body.innerHTML =
        `<p><b>${spoils.length} items</b> banked to your Repository.</p>` +
        `<p>Win streak <b>×${streak}</b> · reward multiplier <b>${mult}×</b>.</p>` +
        `<p class="duel-hint">Repository items can be delivered straight to the story.</p>`;
    } else {
      title.textContent = `${this.oppName()} takes this one`;
      body.innerHTML = this.vsAi
        ? `<p>Joss chuckles into his beard. Your win streak resets — rematch?</p>`
        : `<p>The spoils go to your friend. Your win streak resets — rematch?</p>`;
    }

    deliver.hidden = !this.game.canDeliverFromRepository();
    deliver.textContent = 'Deliver to Emberhollow';
    results.hidden = false;
  }
}
