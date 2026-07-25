let timer: ReturnType<typeof setTimeout> | undefined;
let queue: string[] = [];
let showing = false;

/** Cap the backlog so a burst can't queue stale messages for many seconds. */
const MAX_QUEUE = 5;

/**
 * Warm, transient bottom toast. Shared across screens. Messages are shown one
 * at a time: a single action that earns several things (quest + achievement +
 * milestone all emit synchronously) would otherwise clobber a single element
 * and only the last would be seen. Duration scales with length.
 */
export function toast(message: string): void {
  queue.push(message);
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE); // keep the most recent
  if (!showing) pump();
}

function pump(): void {
  const el = document.getElementById('toast');
  if (!el) {
    queue = [];
    showing = false;
    return;
  }
  const msg = queue.shift();
  if (msg === undefined) {
    showing = false;
    el.classList.remove('show');
    return;
  }
  showing = true;
  el.textContent = msg;
  el.classList.add('show');
  const dur = Math.min(4200, Math.max(1600, 900 + msg.length * 40));
  clearTimeout(timer);
  timer = setTimeout(() => {
    el.classList.remove('show');
    // a short gap so consecutive toasts read as distinct, then show the next
    timer = setTimeout(pump, 180);
  }, dur);
}
