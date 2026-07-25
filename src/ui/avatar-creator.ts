/**
 * Avatar picker — where a player chooses the painted bust that becomes their face
 * in Emberhollow. Portrait-first (GDD): a calm grid of hand-painted, on-style
 * portraits + a name field. "Meaningful choice over overwhelming choice" — no
 * feature sliders, nothing to get wrong, and every option already fits the town.
 *
 * Accessibility: role=dialog + aria-modal, Esc closes, focus returns to opener,
 * radio-style option grid with aria-checked, keyboard reachable. The preview is a
 * static image, so it is inert under reduced motion by construction.
 *
 * Pattern follows confirm-modal.ts (overlay + card appended to <body>).
 */
import type { Game } from '../core/game';
import type { AvatarConfig } from '../core/types';
import { availablePortraits } from '../data/avatar-portraits';
import { avatarPortraitHTML } from './avatar-render';
import { esc } from './esc';
import { toast } from './toast';

const NUDGE_KEY = 'hearth:avatar-nudged';

/**
 * Gentle, once-only retrofit for existing players who have no avatar yet
 * (created:false). Opt-in, never forced (GDD §3b): a warm toast pointing them to
 * their look. Called at boot for saves that skipped the FTUE avatar step.
 */
export function maybeNudgeAvatar(game: Game): void {
  try {
    if (game.avatar.created) return;
    if (localStorage.getItem(NUDGE_KEY)) return;
    localStorage.setItem(NUDGE_KEY, '1');
  } catch {
    return; // storage unavailable — skip quietly rather than nag every boot
  }
  // A beat after load so it doesn't collide with the sunrise/new-day panel.
  setTimeout(
    () => toast('A looking-glass washed up with the tide — choose your look under Villagers, or in Settings.'),
    2600,
  );
}

/**
 * Open the picker. Resolves true if the player saved, false if cancelled.
 * On save, persists via game.setAvatar with created:true.
 */
export function openAvatarCreator(game: Game): Promise<boolean> {
  return new Promise((resolve) => {
    const opener = document.activeElement as HTMLElement | null;
    const portraits = availablePortraits();
    const start = game.avatar;
    let chosen = portraits.some((p) => p.id === start.portrait) ? start.portrait : (portraits[0]?.id ?? start.portrait);
    let name = start.name ?? '';

    const overlay = document.createElement('div');
    overlay.className = 'modal avatar-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Choose your look');

    const card = document.createElement('div');
    card.className = 'modal-card avatar-card';
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const render = (): void => {
      card.innerHTML = `
        <button type="button" class="sheet-close avatar-cancel" aria-label="Close">✕</button>
        <h2 class="avatar-title">Your look</h2>
        <p class="avatar-sub">Choose a face for the village to know you by.</p>
        <div class="avatar-preview">${avatarPortraitHTML(chosen, { framed: true, label: 'your chosen portrait' })}</div>

        <div class="avatar-grid" role="radiogroup" aria-label="Portraits">
          ${portraits
            .map(
              (p) =>
                `<button type="button" role="radio" aria-checked="${p.id === chosen}" class="avatar-choice${p.id === chosen ? ' on' : ''}" data-id="${p.id}" title="${esc(p.name)}" aria-label="${esc(p.name)}">${avatarPortraitHTML(p.id, { label: p.name })}</button>`,
            )
            .join('')}
        </div>

        <label class="avatar-name-row">Name
          <input type="text" class="avatar-name" maxlength="24" placeholder="What will the villagers call you?" value="${esc(name)}" />
        </label>

        <div class="avatar-actions">
          <button type="button" class="btn-primary avatar-done">This is me</button>
        </div>`;
      wire();
    };

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
      }
    };

    function wire(): void {
      card.querySelector<HTMLButtonElement>('.avatar-cancel')!.onclick = () => close(false);
      card.querySelectorAll<HTMLButtonElement>('.avatar-choice').forEach((b) => {
        b.onclick = () => {
          chosen = b.dataset.id ?? chosen;
          render();
        };
      });
      const nameInput = card.querySelector<HTMLInputElement>('.avatar-name')!;
      nameInput.oninput = () => {
        name = nameInput.value;
      };
      card.querySelector<HTMLButtonElement>('.avatar-done')!.onclick = () => {
        const cfg: AvatarConfig = { created: true, portrait: chosen };
        const trimmed = name.trim();
        if (trimmed) cfg.name = trimmed.slice(0, 24);
        game.setAvatar(cfg);
        close(true);
      };
    }

    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    render();
    card.querySelector<HTMLButtonElement>('.avatar-done')?.focus();
  });
}
