/**
 * A themed, accessible confirm dialog — the in-game replacement for the native
 * window.confirm(). Reusable for any two-choice decision (the save-conflict
 * prompt is the first caller). Returns a promise that resolves true on confirm,
 * false on cancel / Esc / backdrop.
 *
 * Accessibility: role=dialog + aria-modal, labelled by its title, a focus trap
 * across the two buttons, Esc cancels, and focus returns to the opener on close.
 */
export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

let seq = 0;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const opener = document.activeElement as HTMLElement | null;
    const id = `confirm-${++seq}`;

    const overlay = document.createElement('div');
    overlay.className = 'modal confirm-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', `${id}-title`);

    const card = document.createElement('div');
    card.className = 'modal-card confirm-card';
    card.innerHTML =
      `<div class="modal-flame" aria-hidden="true"></div>` +
      `<h2 id="${id}-title" class="confirm-title"></h2>` +
      `<p class="confirm-msg"></p>` +
      `<div class="confirm-actions">` +
      `<button type="button" class="btn-primary confirm-yes"></button>` +
      `<button type="button" class="btn-ghost confirm-no"></button>` +
      `</div>`;
    // textContent (not innerHTML) for caller-supplied copy — no injection.
    card.querySelector<HTMLHeadingElement>('.confirm-title')!.textContent = opts.title;
    card.querySelector<HTMLParagraphElement>('.confirm-msg')!.textContent = opts.message;
    const yes = card.querySelector<HTMLButtonElement>('.confirm-yes')!;
    const no = card.querySelector<HTMLButtonElement>('.confirm-no')!;
    yes.textContent = opts.confirmLabel;
    no.textContent = opts.cancelLabel;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const close = (result: boolean): void => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (opener && typeof opener.focus === 'function') opener.focus();
      resolve(result);
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(false);
      } else if (e.key === 'Tab') {
        // Trap focus between the two buttons.
        e.preventDefault();
        (document.activeElement === yes ? no : yes).focus();
      }
    };

    yes.addEventListener('click', () => close(true));
    no.addEventListener('click', () => close(false));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false); // backdrop = cancel (the safe choice)
    });
    document.addEventListener('keydown', onKey, true);
    yes.focus();
  });
}
