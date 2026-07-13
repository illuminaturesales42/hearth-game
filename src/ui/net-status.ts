/**
 * A quiet connection indicator. When the device goes offline the game keeps
 * working (everything is local-first), so this only reassures — a small pill,
 * plus a one-line toast on the transition. Cosy, never alarming.
 */
import { toast } from './toast';

export function initNetStatus(): void {
  const pill = document.createElement('div');
  pill.className = 'net-offline';
  pill.setAttribute('role', 'status');
  pill.setAttribute('aria-live', 'polite');
  pill.hidden = true;
  pill.textContent = 'Offline — your village is safe on this device';
  document.body.appendChild(pill);

  let wasOffline = !navigator.onLine;

  const sync = (announce: boolean): void => {
    const offline = !navigator.onLine;
    pill.hidden = !offline;
    if (announce && offline && !wasOffline) {
      toast('You’re offline — Emberhollow keeps going, and your progress is saved here.');
    } else if (announce && !offline && wasOffline) {
      toast('Back online — your village will sync.');
    }
    wasOffline = offline;
  };

  window.addEventListener('offline', () => sync(true));
  window.addEventListener('online', () => sync(true));
  sync(false); // set initial state without a toast on load
}
