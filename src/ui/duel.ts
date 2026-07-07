/**
 * Bonfire Duel — a RACE, not turns. The board deals full; you and Old Joss
 * both hunt pairs on the same board at the same time. Tap an item, then its
 * twin, to take the merge; Joss snatches the biggest pair on his own clock
 * (which quickens as the round goes on). When no pairs remain, the higher
 * score wins the board's spoils into the Repository — duels feed the story.
 */
import type { Game } from '../core/game';
import { bestDuelMove, boardSpoils, createDuel, duelWinner, raceMerge } from '../core/duel';
import type { DuelState } from '../core/duel';
import { tileMarkup } from './art';
import { feedback } from './feedback';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

/** Joss's pace: first grab after this long, then a little faster each time. */
const AI_START_MS = 2400;
const AI_STEP_MS = 90;
const AI_FLOOR_MS = 1100;

export class DuelUI {
  private state: DuelState | null = null;
  private selected = -1;
  private seed = 12345;
  private aiTimer = 0;
  private aiDelay = AI_START_MS;

  constructor(private game: Game) {
    const close = el<HTMLButtonElement>('duel-close');
    if (close) close.onclick = () => this.close();
    const rematch = el<HTMLButtonElement>('duel-rematch');
    if (rematch) rematch.onclick = () => this.beginMatch();
    const done = el<HTMLButtonElement>('duel-done');
    if (done) done.onclick = () => this.close();
    const deliver = el<HTMLButtonElement>('duel-deliver');
    if (deliver) deliver.onclick = () => this.game.deliverFromRepository();
  }

  /** Open the overlay and deal the race board. */
  start(): void {
    const overlay = el('duel-overlay');
    if (overlay) overlay.hidden = false;
    this.beginMatch();
  }

  private beginMatch(): void {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    this.state = createDuel(this.seed);
    this.selected = -1;
    this.aiDelay = AI_START_MS;
    const results = el('duel-results');
    if (results) results.hidden = true;
    const opp = el('duel-opp-name');
    if (opp) opp.textContent = 'Old Joss';
    this.buildGrid();
    this.render();
    this.scheduleAi();
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

  /** The player races freely — no waiting on anyone. */
  private tap(index: number): void {
    if (!this.state || this.state.over) return;
    const cell = this.state.board.cells[index];
    if (!cell || cell.kind !== 'item') {
      this.selected = -1;
      this.render();
      return;
    }
    if (this.selected < 0 || this.selected === index) {
      this.selected = this.selected === index ? -1 : index;
      this.render();
      return;
    }
    const move = raceMerge(this.state, this.selected, index, 0);
    if (move.merged) {
      this.state = move.state;
      this.selected = -1;
      feedback.merge(move.resultLevel);
      this.render();
      if (this.state.over) this.showResults();
    } else {
      // not a match — reselect the tapped item
      this.selected = index;
      this.render();
    }
  }

  /** Joss grabs the biggest pair on the table on his own quickening clock. */
  private scheduleAi(): void {
    clearTimeout(this.aiTimer);
    this.aiTimer = window.setTimeout(() => {
      if (!this.state || this.state.over) return;
      const pick = bestDuelMove(this.state);
      if (pick) {
        const move = raceMerge(this.state, pick[0], pick[1], 1);
        if (move.merged) {
          this.state = move.state;
          // Joss stole the player's selection? Clear it if it vanished.
          if (this.selected >= 0 && this.state.board.cells[this.selected]?.kind !== 'item') this.selected = -1;
          feedback.chime(330);
          this.render();
          if (this.state.over) {
            this.showResults();
            return;
          }
        }
      }
      this.aiDelay = Math.max(AI_FLOOR_MS, this.aiDelay - AI_STEP_MS);
      this.scheduleAi();
    }, this.aiDelay);
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
    el('duel-turn')!.textContent = s.over ? 'The field is bare' : 'Race — most pairs wins!';
    el('duel-turn')!.className = 'duel-turn race';
    el('duel-score-0')!.textContent = String(s.scores[0]);
    el('duel-score-1')!.textContent = String(s.scores[1]);
  }

  private showResults(): void {
    if (!this.state) return;
    clearTimeout(this.aiTimer);
    const w = duelWinner(this.state);
    const spoils = boardSpoils(this.state.board);
    const playerWon = w === 0;
    // Only the local player banks (streak/Repository belong to the account).
    this.game.finishDuel(playerWon, spoils, this.state.scores[0]);

    const results = el('duel-results');
    const title = el('duel-result-title');
    const body = el('duel-result-body');
    const deliver = el<HTMLButtonElement>('duel-deliver');
    if (!results || !title || !body || !deliver) return;

    if (w === -1) {
      title.textContent = 'A dead heat by the fire';
      body.innerHTML = `<p>Evenly matched to the last pair. The streak resets, but no harm done.</p>`;
    } else if (playerWon) {
      const streak = this.game.duelStreak;
      const mult = (1 + 0.15 * Math.min(streak, 6)).toFixed(2);
      title.textContent = 'You out-raced Old Joss!';
      body.innerHTML =
        `<p><b>${spoils.length} items</b> banked to your Repository.</p>` +
        `<p>Win streak <b>×${streak}</b> · reward multiplier <b>${mult}×</b>.</p>` +
        `<p class="duel-hint">Repository items can be delivered straight to the story.</p>`;
    } else {
      title.textContent = 'Old Joss takes this one';
      body.innerHTML = `<p>Joss chuckles into his beard — quick hands for an old boatswain. Your win streak resets. Rematch?</p>`;
    }

    deliver.hidden = !this.game.canDeliverFromRepository();
    deliver.textContent = 'Deliver to Emberhollow';
    results.hidden = false;
  }
}
