/**
 * First-time experience: a handful of warm steps from "welcome" to "it's
 * yours". Skippable at every step, driven by real game events (your first
 * merge, first delivery, and first real-world action advance it), never shown
 * again once done (save flag).
 */
import type { Game } from '../core/game';
import { artUrl } from './art';
import type { Metrics } from '../platform/metrics';
import { openAvatarCreator } from './avatar-creator';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

interface Step {
  text: string;
  /** null = waits for a game event only. A step may have BOTH a button and a
   *  waitFor — whichever comes first advances (the button is a gentle skip). */
  button: string | null;
  highlight?: string; // CSS selector to glow
  screen?: 'home' | 'create' | 'villagers';
  waitFor?: 'merge' | 'delivered' | 'action';
  /** CSS selector clicked when the step shows (e.g. open the energy sheet). */
  tap?: string;
  /** Special action performed by this step's button before advancing. */
  action?: 'avatar';
}

const STEPS: Step[] = [
  {
    text: 'Welcome to Emberhollow. A storm took the harbour years ago — and you are the reason it comes back. Restore the village, befriend its people, and uncover what happened to Marta.',
    button: 'Begin',
    screen: 'home',
  },
  {
    // Identity before instruction: the player becomes a villager before they
    // learn a single mechanic. Bran-framed ("how should the village see you?").
    // The button opens the painted-portrait picker; advancing keeps whatever
    // they chose (or the gentle default if they close it — never a dead end).
    text: 'Before the village meets you — let’s give them a face to know you by. Bran’s already saved you a spot by the fire.',
    button: 'Choose your look',
    action: 'avatar',
    screen: 'home',
  },
  {
    text: 'This is your town. It grows as you help — every window that lights up is something you did. The workshop is where the helping happens.',
    button: 'To the workshop',
    highlight: '.nav-btn[data-screen="create"]',
    screen: 'home',
  },
  {
    text: 'Merge two matching items — tap one, then tap its twin. Try joining the two saplings. (You can drag them together too, if you like.)',
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
    // The heart of Hearth, FELT rather than told: the player performs one real
    // action during onboarding and watches energy arrive. The button is a
    // no-guilt skip; logging any action also advances.
    text: 'One more thing — the important one. Tapping the crate spends Hearth Energy, and energy is earned from your real day: walks, sleep, sunlight, a glass of water. It is never sold. Try it now — log a glass of water and watch the hearth warm.',
    button: 'Maybe later',
    highlight: '#energy-pill',
    tap: '#energy-pill',
    waitFor: 'action',
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
    if (s.tap) document.querySelector<HTMLButtonElement>(s.tap)?.click(); // e.g. open the energy sheet
    document.querySelectorAll('.ftue-glow').forEach((n) => n.classList.remove('ftue-glow'));
    if (s.highlight) document.querySelector(s.highlight)?.classList.add('ftue-glow');

    el('ftue-text')!.textContent = s.text;
    const btn = el<HTMLButtonElement>('ftue-next');
    if (btn) {
      btn.hidden = s.button === null;
      btn.textContent = s.button ?? '';
      btn.onclick =
        s.action === 'avatar'
          ? () => {
              // Open the picker; advance whether they pick or close it (the
              // default look stands, and the mirror stays open forever).
              void openAvatarCreator(this.game).then(() => this.advance());
            }
          : () => this.advance();
    }
    const emblem = el('ftue-emblem');
    if (emblem) {
      // Drop-in art hook: a painted harbour-arrival scene (ftue_arrival) is used
      // on the welcome step if present, otherwise the existing splash emblem.
      const art = artUrl('ftue_arrival') ?? artUrl('splash_emblem');
      emblem.style.backgroundImage = this.step === 0 && art ? `url(${art})` : '';
      emblem.hidden = !(this.step === 0 && art);
    }
    overlay.hidden = false;
  }

  private advance(): void {
    // Leaving a step that opened a sheet (tap:) tidies it away again, so the
    // closing "welcome home" isn't delivered behind the energy panel.
    if (STEPS[this.step]?.tap) el<HTMLButtonElement>('energy-close')?.click();
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
