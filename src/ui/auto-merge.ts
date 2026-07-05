/**
 * Auto-merge: when enabled, automatically joins matching items on the board,
 * one pair at a time with a short beat between each so the merge pops read.
 * Off by default (merging by hand is the core toy); this is a comfort helper.
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
      const merged = this.game.settings.autoMerge && this.game.autoMergeOnce();
      if (merged) this.loop();
      else this.running = false;
    }, STEP_MS);
  }
}
