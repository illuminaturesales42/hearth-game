/**
 * Avatar creator — the modal where a player becomes a villager of Emberhollow.
 * Two-speed by design (GDD §4): a preset row for a ~30-second look, plus per-
 * category editing for those who want to fuss. Live SVG preview, instant feedback,
 * curated randomise (never ugly), undo, and a name field. Cosmetic only.
 *
 * Accessibility: role=dialog + aria-modal, Esc closes, focus returns to opener,
 * every control keyboard-reachable, labels on options. No animation is required
 * for function — the preview is a static SVG that simply re-renders on change,
 * so it is inert under reduced motion by construction.
 *
 * Pattern follows confirm-modal.ts (overlay + card, appended to <body>).
 */
import type { Game } from '../core/game';
import type { AvatarAppearance, AvatarConfig } from '../core/types';
import {
  BODIES,
  CLOTH_COLOURS,
  FACES,
  HAIR_COLOURS,
  HAIR_STYLES,
  PRESETS,
  SKIN_TONES,
  TOPS,
  normalizeAppearance,
  randomAppearance,
} from '../core/avatar';
import { avatarBustSVG } from './avatar-render';
import { esc } from './esc';

type OptList = readonly { readonly id: string; readonly name: string }[];

interface Category {
  key: keyof AvatarAppearance;
  label: string;
  opts: OptList;
  /** Swatch categories show colour dots instead of text chips. */
  swatch?: boolean;
}

const CATEGORIES: readonly Category[] = [
  { key: 'body', label: 'Body', opts: BODIES },
  { key: 'skin', label: 'Skin', opts: SKIN_TONES, swatch: true },
  { key: 'hair', label: 'Hair', opts: HAIR_STYLES },
  { key: 'hairColour', label: 'Hair colour', opts: HAIR_COLOURS, swatch: true },
  { key: 'face', label: 'Face', opts: FACES },
  { key: 'top', label: 'Top', opts: TOPS },
  { key: 'topColour', label: 'Colour', opts: CLOTH_COLOURS, swatch: true },
];

const hexOf = (opts: OptList, id: string): string =>
  (opts as readonly { id: string; hex?: string }[]).find((o) => o.id === id)?.hex ?? '#ccc';

/**
 * Open the creator. Resolves true if the player saved a look, false if they
 * cancelled. On save, persists via game.setAvatar with created:true.
 */
export function openAvatarCreator(game: Game): Promise<boolean> {
  return new Promise((resolve) => {
    const opener = document.activeElement as HTMLElement | null;
    const start = game.avatar;
    // Working copy: start from current look (or a preset if never created).
    let look: AvatarAppearance = normalizeAppearance(start.appearance);
    let name = start.name ?? '';
    let activeCat = 0;
    const undo: AvatarAppearance[] = [];

    const overlay = document.createElement('div');
    overlay.className = 'modal avatar-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Create your look');

    const card = document.createElement('div');
    card.className = 'modal-card avatar-card';
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const pushUndo = (): void => {
      undo.push({ ...look });
      if (undo.length > 30) undo.shift();
    };

    const render = (): void => {
      const cat = CATEGORIES[activeCat]!;
      card.innerHTML = `
        <button type="button" class="sheet-close avatar-cancel" aria-label="Close">✕</button>
        <h2 class="avatar-title">Your look</h2>
        <div class="avatar-preview">${avatarBustSVG(look, { label: 'your avatar' })}</div>

        <div class="avatar-presets" role="group" aria-label="Starting looks">
          ${PRESETS.map((p) => `<button type="button" class="avatar-preset" data-preset="${p.id}" title="${esc(p.name)}"><span class="ap-mini">${avatarBustSVG(p.appearance, { backdrop: null })}</span></button>`).join('')}
        </div>

        <div class="avatar-cats" role="tablist" aria-label="Categories">
          ${CATEGORIES.map((c, i) => `<button type="button" role="tab" aria-selected="${i === activeCat}" class="avatar-cat${i === activeCat ? ' on' : ''}" data-cat="${i}">${esc(c.label)}</button>`).join('')}
        </div>

        <div class="avatar-opts" role="listbox" aria-label="${esc(cat.label)} options">
          ${cat.opts
            .map((o) => {
              const on = look[cat.key] === o.id;
              return cat.swatch
                ? `<button type="button" role="option" aria-selected="${on}" class="avatar-swatch${on ? ' on' : ''}" data-opt="${o.id}" title="${esc(o.name)}" aria-label="${esc(o.name)}" style="--sw:${hexOf(cat.opts, o.id)}"></button>`
                : `<button type="button" role="option" aria-selected="${on}" class="avatar-opt${on ? ' on' : ''}" data-opt="${o.id}">${esc(o.name)}</button>`;
            })
            .join('')}
        </div>

        <label class="avatar-name-row">Name
          <input type="text" class="avatar-name" maxlength="24" placeholder="What will the villagers call you?" value="${esc(name)}" />
        </label>

        <div class="avatar-actions">
          <button type="button" class="btn-ghost avatar-random">Surprise me</button>
          <button type="button" class="btn-ghost avatar-undo"${undo.length ? '' : ' disabled'}>Undo</button>
          <button type="button" class="btn-primary avatar-done">This is me</button>
        </div>`;
      wire();
    };

    const setLook = (patch: Partial<AvatarAppearance>): void => {
      pushUndo();
      look = normalizeAppearance({ ...look, ...patch });
      render();
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
      card.querySelectorAll<HTMLButtonElement>('.avatar-cat').forEach((b) => {
        b.onclick = () => {
          activeCat = Number(b.dataset.cat);
          render();
        };
      });
      card.querySelectorAll<HTMLButtonElement>('.avatar-preset').forEach((b) => {
        b.onclick = () => {
          const p = PRESETS.find((x) => x.id === b.dataset.preset);
          if (p) setLook(p.appearance);
        };
      });
      card.querySelectorAll<HTMLButtonElement>('[data-opt]').forEach((b) => {
        b.onclick = () => setLook({ [CATEGORIES[activeCat]!.key]: b.dataset.opt });
      });
      const nameInput = card.querySelector<HTMLInputElement>('.avatar-name')!;
      nameInput.oninput = () => {
        name = nameInput.value;
      };
      card.querySelector<HTMLButtonElement>('.avatar-random')!.onclick = () => {
        // Curated randomise: draw only from catalogues via a simple varying pick.
        let seed = undo.length * 7 + Date.now();
        setLook(randomAppearance(() => (seed = (seed * 1103515245 + 12345) & 0x7fffffff)));
      };
      const undoBtn = card.querySelector<HTMLButtonElement>('.avatar-undo')!;
      undoBtn.onclick = () => {
        const prev = undo.pop();
        if (prev) {
          look = prev;
          render();
        }
      };
      card.querySelector<HTMLButtonElement>('.avatar-done')!.onclick = () => {
        const cfg: AvatarConfig = { created: true, appearance: look };
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
