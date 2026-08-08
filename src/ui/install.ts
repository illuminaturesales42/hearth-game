/**
 * "Get the app" — the always-findable install path.
 *
 * Hearth ships as a PWA, so installing is the browser's job, not ours. The
 * catch is that only Chromium-family browsers hand us a programmatic prompt
 * (`beforeinstallprompt`); everywhere else the player has to walk a menu we
 * can't open for them, and if we say nothing they conclude the link is broken.
 *
 * So `installAdvice()` is a pure map from "what browser is this" to "what do we
 * tell them" — every branch produces real guidance, and the no-guidance case
 * doesn't exist. The dismissible keep-your-save card (growth.ts) is the nudge;
 * the Settings row this feeds is the permanent home, because a nudge that has
 * been snoozed is indistinguishable from a missing feature.
 */

/** Everything the advice depends on — passed in, so the logic stays testable. */
export interface InstallEnv {
  /** Already running as an installed app (display-mode standalone / iOS flag). */
  standalone: boolean;
  /** A `beforeinstallprompt` event is in hand, so we can install in one tap. */
  canPrompt: boolean;
  /** navigator.userAgent */
  ua: string;
  /** Touch-first device, for the iPadOS case where the UA claims Macintosh. */
  touch: boolean;
}

export type InstallState =
  'installed' | 'prompt' | 'ios' | 'ios-other-browser' | 'in-app-browser' | 'manual-android' | 'manual-desktop';

export interface InstallAdvice {
  state: InstallState;
  /** Short status line. */
  title: string;
  /** The actual steps, in the player's words. */
  body: string;
  /** Label for the one-tap button, or null when the browser gives us no hook. */
  button: string | null;
}

/**
 * Social apps open links in an embedded webview that CANNOT install anything —
 * no prompt, no menu item. This is the single most common "the link doesn't
 * work" report, and the only fix is to reopen in a real browser.
 */
const IN_APP = /\b(FBAN|FBAV|FB_IAB|Instagram|Line|Twitter|WhatsApp|Snapchat|TikTok|Pinterest|MicroMessenger)\b/i;

/** iOS proper, plus iPadOS 13+ which reports itself as a Macintosh. */
function isIos(ua: string, touch: boolean): boolean {
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return /Macintosh/.test(ua) && touch;
}

/** On iOS every browser is Safari underneath, but only some expose the option. */
function isIosSafari(ua: string): boolean {
  return !/CriOS|FxiOS|EdgiOS|OPiOS|YaBrowser/.test(ua);
}

export function installAdvice(env: InstallEnv): InstallAdvice {
  const { standalone, canPrompt, ua, touch } = env;

  if (standalone) {
    return {
      state: 'installed',
      title: 'Hearth is installed on this device.',
      body: 'You’re running the installed app — your village stays put between visits.',
      button: null,
    };
  }

  // Checked before `canPrompt`: an in-app webview never fires the prompt, and
  // its menu has no install entry, so "open in your browser" is the only step
  // that leads anywhere.
  if (IN_APP.test(ua)) {
    return {
      state: 'in-app-browser',
      title: 'Open Hearth in your browser first.',
      body: 'This link opened inside another app, which can’t install games. Tap the ⋯ menu and choose “Open in browser” (Safari or Chrome) — then come back to Settings and the install option will be here.',
      button: null,
    };
  }

  if (canPrompt) {
    return {
      state: 'prompt',
      title: 'Add Hearth to your home screen.',
      body: 'Installs the app on this device — full screen, works offline, and keeps your village safe between visits.',
      button: 'Install Hearth',
    };
  }

  if (isIos(ua, touch)) {
    if (!isIosSafari(ua)) {
      return {
        state: 'ios-other-browser',
        title: 'Open Hearth in Safari to install it.',
        body: 'On iPhone and iPad only Safari can add a game to the Home Screen. Open this page in Safari, tap Share, then “Add to Home Screen”.',
        button: null,
      };
    }
    return {
      state: 'ios',
      title: 'Add Hearth to your Home Screen.',
      body: 'Tap the Share button at the bottom of Safari, scroll down, then tap “Add to Home Screen”. iPhones clear browser saves after a week away — the installed app keeps Emberhollow safe.',
      button: null,
    };
  }

  if (/Android/i.test(ua)) {
    return {
      state: 'manual-android',
      title: 'Add Hearth to your home screen.',
      body: 'Tap your browser’s ⋮ menu, then “Install app” (or “Add to Home screen”). If you don’t see it, open this page in Chrome — it offers the one-tap install.',
      button: null,
    };
  }

  return {
    state: 'manual-desktop',
    title: 'Install Hearth on this computer.',
    body: 'Look for the install icon in the address bar, or open your browser’s menu and choose “Install Hearth”. On a phone, open this same link and the install option appears here.',
    button: null,
  };
}

/** Read the live environment (the impure half, kept to one place). */
export function readInstallEnv(canPrompt: boolean): InstallEnv {
  let standalone = false;
  try {
    standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
  } catch {
    /* fine — treat as not installed */
  }
  let touch = false;
  try {
    touch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 1;
  } catch {
    /* fine */
  }
  return { standalone, canPrompt, ua: navigator.userAgent, touch };
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Holds the one-shot `beforeinstallprompt` event so every surface that offers
 * installing (Settings row, keep-your-save card) works from the same source of
 * truth — the event can only be consumed once, and whichever surface uses it
 * must be able to tell the others to re-render.
 */
class InstallController {
  private evt: InstallPromptEvent | null = null;
  private listeners = new Set<() => void>();

  constructor() {
    // Guarded so the module stays importable outside a browser — the pure
    // `installAdvice` above is unit-tested in plain node.
    if (typeof window === 'undefined') return;
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // keep Chrome's own mini-infobar out of the way
      this.evt = e as InstallPromptEvent;
      this.emit();
    });
    window.addEventListener('appinstalled', () => {
      this.evt = null;
      this.emit();
    });
  }

  get canPrompt(): boolean {
    return this.evt !== null;
  }

  advice(): InstallAdvice {
    return installAdvice(readInstallEnv(this.canPrompt));
  }

  /** Re-render me when the install situation changes. */
  subscribe(fn: () => void): void {
    this.listeners.add(fn);
  }

  /** Fire the browser's install prompt. Returns whether the player accepted. */
  async prompt(): Promise<boolean> {
    const evt = this.evt;
    if (!evt) return false;
    this.evt = null; // single-use, whatever the outcome
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      return choice?.outcome === 'accepted';
    } catch {
      return false;
    } finally {
      this.emit();
    }
  }

  private emit(): void {
    this.listeners.forEach((fn) => fn());
  }
}

export const installer = new InstallController();
