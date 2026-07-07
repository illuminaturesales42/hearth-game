/**
 * First-time experience: five warm steps from "welcome" to "it's yours".
 * Skippable at every step, driven by real game events (your first merge and
 * first delivery advance it), never shown again once done (save flag).
 */
import type { Game } from '../core/game';
import { artUrl } from './art';
import type { Metrics } from '../platform/metrics';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

interface Step {
  text: string;
  button: string | null; // null = waits for a game event
  highlight?: string; // CSS selector to glow
  screen?: 'home' | 'create' | 'villagers';
  waitFor?: 'merge' | 'delivered';
}

const STEPS: Step[] = [
  {
    text: 'Welcome to Emberhollow. A storm took the harbour years ago — and you are the reason it comes back. Restore the village, befriend its people, and uncover what happened to Marta.',
    button: 'Begin',
    screen: 'home',
  },
  {
    text: 'This is your town. It grows as you help — every window that lights up is something you did. The workshop is where the helping happens.',
    button: 'To the workshop',
    highlight: '.nav-btn[data-screen="create"]',
    screen: 'home',
  },
  {
    text: 'Merge two matching items — drag one onto its twin. Try joining the two saplings.',
    button: null,
    waitFor: 'merge',
    screen: 'create',
    highlight: '#board',
  },
  {
    text: 'Lovely. Keep merging until you have what Bran needs, then press Deliver. Each delivery rebuilds the village and reveals the story.',
    button: null,
    waitFor: 'delivered',
    screen: 'create',
    highlight: '#deliver-btn',
  },
  {
    text: 'That was for Bran — and Bran will remember it. Every villager keeps the moments you share; help them and their hearts fill. You’ll find the people of Emberhollow under Villagers.',
    button: 'I’ll say hello',
    highlight: '.nav-btn[data-screen="villagers"]',
    screen: 'home',
  },
  {
    text: 'One more thing: merging spends Hearth Energy — and energy is earned from your real day. Walks, sleep, sunlight, a kind word to a stranger. It is never sold. Tap the flame any time to see today’s ways.',
    button: 'Understood',
    highlight: '#energy-pill',
  },
  {
    text: 'The rest is yours to discover — the Journal writes your days, the villagers remember, and the mystery waits. Welcome home.',
    button: 'Welcome home',
  },
];

export class FtueUI {
  private step = -1;
  private unsub: (() => void) | null = null;
  private onDone: () => void = () => undefined;

  constructor(
    private game: Game,
    private metrics?: Metrics,
  ) {}

  /** Start the flow if this is a brand-new player. Returns true when shown. */
  maybeStart(onDone: () => void): boolean {
    this.onDone = onDone;
    if (this.game.flags.ftueDone) return false;
    this.unsub = this.game.subscribe((ev) => {
      const cur = STEPS[this.step];
      if (cur?.waitFor && ev.type === cur.waitFor) this.advance();
    });
    el<HTMLButtonElement>('ftue-skip')?.addEventListener('click', () => this.finish());
    this.step = 0;
    this.show();
    return true;
  }

  private show(): void {
    const s = STEPS[this.step];
    const overlay = el('ftue-overlay');
    if (!s || !overlay) return;
    this.metrics?.ftueReachedStep(this.step); // funnel: where do players drop?
    if (s.screen) document.querySelector<HTMLButtonElement>(`.nav-btn[data-screen="${s.screen}"]`)?.click();
    document.querySelectorAll('.ftue-glow').forEach((n) => n.classList.remove('ftue-glow'));
    if (s.highlight) document.querySelector(s.highlight)?.classList.add('ftue-glow');

    el('ftue-text')!.textContent = s.text;
    const btn = el<HTMLButtonElement>('ftue-next');
    if (btn) {
      btn.hidden = s.button === null;
      btn.textContent = s.button ?? '';
      btn.onclick = () => this.advance();
    }
    const emblem = el('ftue-emblem');
    if (emblem) {
      const art = artUrl('splash_emblem');
      emblem.style.backgroundImage = this.step === 0 && art ? `url(${art})` : '';
      emblem.hidden = !(this.step === 0 && art);
    }
    overlay.hidden = false;
  }

  private advance(): void {
    this.step += 1;
    if (this.step >= STEPS.length) this.finish();
    else this.show();
  }

  private finish(): void {
    document.querySelectorAll('.ftue-glow').forEach((n) => n.classList.remove('ftue-glow'));
    const overlay = el('ftue-overlay');
    if (overlay) overlay.hidden = true;
    this.unsub?.();
    // Completed only if they reached the last step; a skip is a drop we keep.
    if (this.step >= STEPS.length) this.metrics?.ftueFinished();
    this.game.setFlag({ ftueDone: true });
    this.onDone();
  }
}
