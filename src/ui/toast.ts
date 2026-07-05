let timer: ReturnType<typeof setTimeout> | undefined;

/** Warm, transient bottom toast. Shared across screens. */
export function toast(message: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('show'), 2800);
}
