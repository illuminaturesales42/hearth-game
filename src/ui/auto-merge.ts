/**
 * Auto-merge: when enabled, automatically joins matching items on the board and
 * delivers any item that completes the current order — one step at a time with a
 * short beat so the pops and story beats read. Pauses while a story modal is
 * open so the player can read each beat. Off by default (hand-merging is the
 * core toy); this is a comfort helper.
 */
import type { Game } from '../core/game';

const STEP_MS = 260;

export class AutoMergeController {
  private running = false;

  constructor(private game: Game) {
    const toggle = document.getElementById('auto-merge') as HTMLInputElement | null;
    if (toggle) {
      toggle.checked = game.settings.autoMerge;
      toggle.onchange = () => {
        game.setAutoMerge(toggle.checked);
        if (toggle.checked) this.kick();
      };
    }
    game.subscribe((ev) => {
      if (ev.type === 'settings') {
        const t = document.getElementById('auto-merge') as HTMLInputElement | null;
        if (t) t.checked = this.game.settings.autoMerge;
      }
      // New items arriving (spawn) or a merge settling may expose a fresh pair.
      if ((ev.type === 'spawn' || ev.type === 'merge') && this.game.settings.autoMerge) this.kick();
    });
    if (game.settings.autoMerge) this.kick();
  }

  private kick(): void {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  private loop(): void {
    window.setTimeout(() => {
      if (!this.game.settings.autoMerge) {
        this.running = false;
        return;
      }
      // Let the player read each story beat before continuing.
      const storyOpen = document.getElementById('story-modal')?.hidden === false;
      if (storyOpen) {
        this.loop();
        return;
      }
      // Prefer delivering a completed order, then merging the next pair.
      if (this.game.deliverableIndex() >= 0) {
        this.game.deliver();
        this.loop();
        return;
      }
      if (this.game.autoMergeOnce()) {
        this.loop();
        return;
      }
      this.running = false;
    }, STEP_MS);
  }
}
