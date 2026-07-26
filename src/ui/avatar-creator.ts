/**
 * Avatar picker — where a player chooses the painted bust that becomes their face
 * in Emberhollow. Portrait-first (GDD): a calm grid of hand-painted, on-style
 * portraits + a name field. "Meaningful choice over overwhelming choice."
 *
 * Two-step flow once the modular catalogue art exists (docs/avatar-modular-
 * catalogue.md): step 1 picks a face-type (one of 12 base characters), step 2
 * browses that character's skin-tone × hairstyle variations. Falls back to a
 * flat single-step grid (the legacy/fallback portraits) until any catalogue
 * art has landed, so the picker is always testable.
 *
 * Accessibility: role=dialog + aria-modal, Esc closes, focus returns to opener,
 * radio-style option grid with aria-checked, keyboard reachable. The preview is a
 * static image, so it is inert under reduced motion by construction.
 *
 * Pattern follows confirm-modal.ts (overlay + card appended to <body>).
 */
import type { Game } from '../core/game';
import type { AvatarConfig } from '../core/types';
import {
  availableFaceTypes,
  availablePortraits,
  availableVariationsFor,
  faceTypeThumbnail,
  hasCatalogueArt,
  portraitArt,
  PORTRAITS,
} from '../data/avatar-portraits';
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

type Step = 'face' | 'variation' | 'flat';

/**
 * Open the picker. Resolves true if the player saved, false if cancelled.
 * On save, persists via game.setAvatar with created:true.
 */
export function openAvatarCreator(game: Game): Promise<boolean> {
  return new Promise((resolve) => {
    const opener = document.activeElement as HTMLElement | null;
    const usesCatalogue = hasCatalogueArt();
    const flatPortraits = availablePortraits();
    const start = game.avatar;

    let chosen = flatPortraits.some((p) => p.id === start.portrait)
      ? start.portrait
      : (flatPortraits[0]?.id ?? start.portrait);
    let name = start.name ?? '';

    // Always open on the face-type grid first (per GDD: pick a base avatar,
    // THEN see its variations) — never auto-resume straight into a ring, even
    // if the player already has a catalogue portrait chosen. selectedCharacterId
    // stays unset until they actually pick a face-type tile.
    const startDef = PORTRAITS.find((p) => p.id === chosen);
    let step: Step = !usesCatalogue ? 'flat' : 'face';
    let selectedCharacterId: number | undefined;

    const overlay = document.createElement('div');
    overlay.className = 'modal avatar-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Choose your look');

    const card = document.createElement('div');
    card.className = 'modal-card avatar-card';
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    const renderFaceGrid = (): string => {
      const faces = availableFaceTypes();
      return `
        <h2 class="avatar-title">Your look</h2>
        <p class="avatar-sub">Choose a face for the village to know you by.</p>
        <div class="avatar-grid avatar-grid--faces" role="radiogroup" aria-label="Face types">
          ${faces
            .map((f) => {
              const thumb = faceTypeThumbnail(f.characterId);
              const isCurrent = startDef?.characterId === f.characterId;
              return `<button type="button" role="radio" aria-checked="${isCurrent}" class="avatar-choice${isCurrent ? ' on' : ''}" data-face-id="${f.characterId}" title="${esc(f.name)}" aria-label="${esc(f.name)}">${thumb ? avatarPortraitHTML(thumb, { label: f.name }) : ''}<span class="avatar-choice-label">${esc(f.name)}</span></button>`;
            })
            .join('')}
        </div>`;
    };

    const renderVariationGrid = (characterId: number): string => {
      const variations = availableVariationsFor(characterId);
      const face = availableFaceTypes().find((f) => f.characterId === characterId);
      return `
        <button type="button" class="avatar-back">← Choose a different face</button>
        <h2 class="avatar-title">${esc(face?.name ?? 'Your look')}</h2>
        <p class="avatar-sub">Pick a skin tone and hairstyle.</p>
        <div class="avatar-ring-wrap">
          <div class="avatar-ring-center">${avatarPortraitHTML(chosen, { framed: true, label: 'your chosen portrait' })}</div>
          <div class="avatar-ring" role="radiogroup" aria-label="Variations">
            ${variations
              .map((p, i) => {
                // Alternate tiers (inner/outer ring) so each ring gets an even
                // mix of skin/hair combos rather than "front half vs back half".
                const tier = i % 2;
                const tierIndex = Math.floor(i / 2);
                const tierCount = Math.ceil(variations.length / 2);
                return `<button type="button" role="radio" aria-checked="${p.id === chosen}" class="avatar-ring-item${p.id === chosen ? ' on' : ''}" data-id="${p.id}" data-ring-tier="${tier}" data-ring-index="${tierIndex}" data-ring-count="${tierCount}" title="${esc(p.name)}" aria-label="${esc(p.name)}">${avatarPortraitHTML(p.id, { label: p.name })}</button>`;
              })
              .join('')}
          </div>
        </div>`;
    };

    /** Positions .avatar-ring-item buttons on two staggered concentric rings
     *  around the centre portrait (inner tier 0, outer tier 1, outer rotated
     *  half a step so the two rings interleave rather than stacking radially),
     *  then triggers the expand-out transition. Respects the in-game
     *  reduce-motion setting (body.reduce-motion) by skipping the animated
     *  delay and placing items directly in their final spot. */
    const placeRingItems = (): void => {
      const items = card.querySelectorAll<HTMLButtonElement>('.avatar-ring-item');
      if (items.length === 0) return;
      const reduceMotion = document.body.classList.contains('reduce-motion');
      const RADIUS_BY_TIER = [122, 180];

      items.forEach((item) => {
        const tier = Number(item.dataset.ringTier);
        const i = Number(item.dataset.ringIndex);
        const n = Number(item.dataset.ringCount);
        const radius = RADIUS_BY_TIER[tier] ?? RADIUS_BY_TIER[1]!;
        const stagger = tier === 1 ? Math.PI / n : 0; // half-step offset for the outer ring
        const angle = (i / n) * 2 * Math.PI - Math.PI / 2 + stagger;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;
        const finalTransform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(1)`;

        if (reduceMotion) {
          item.style.transition = 'none';
          item.style.transform = finalTransform;
          item.style.opacity = '1';
          return;
        }

        item.style.transform = 'translate(0px, 0px) scale(0.3)';
        item.style.opacity = '0';
        // Force layout so the browser registers the start state before the
        // transition to the final position — otherwise both writes coalesce
        // and nothing appears to move.
        void item.offsetWidth;
        requestAnimationFrame(() => {
          item.style.transform = finalTransform;
          item.style.opacity = '1';
        });
      });
    };

    const renderFlatGrid = (): string => `
        <h2 class="avatar-title">Your look</h2>
        <p class="avatar-sub">Choose a face for the village to know you by.</p>
        <div class="avatar-preview">${avatarPortraitHTML(chosen, { framed: true, label: 'your chosen portrait' })}</div>
        <div class="avatar-grid" role="radiogroup" aria-label="Portraits">
          ${flatPortraits
            .map(
              (p) =>
                `<button type="button" role="radio" aria-checked="${p.id === chosen}" class="avatar-choice${p.id === chosen ? ' on' : ''}" data-id="${p.id}" title="${esc(p.name)}" aria-label="${esc(p.name)}">${avatarPortraitHTML(p.id, { label: p.name })}</button>`,
            )
            .join('')}
        </div>`;

    const render = (): void => {
      const body =
        step === 'face'
          ? renderFaceGrid()
          : step === 'variation'
            ? renderVariationGrid(selectedCharacterId!)
            : renderFlatGrid();

      card.classList.toggle('avatar-card--wide', step === 'face' || step === 'variation');

      card.innerHTML = `
        <button type="button" class="sheet-close avatar-cancel" aria-label="Close">✕</button>
        ${body}
        ${
          step !== 'face'
            ? `<label class="avatar-name-row">Name
          <input type="text" class="avatar-name" maxlength="24" placeholder="What will the villagers call you?" value="${esc(name)}" />
        </label>
        <div class="avatar-actions">
          <button type="button" class="btn-primary avatar-done">This is me</button>
        </div>`
            : ''
        }`;
      wire();
      if (step === 'variation') placeRingItems();
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

      card.querySelectorAll<HTMLButtonElement>('.avatar-choice[data-face-id]').forEach((b) => {
        b.onclick = () => {
          const characterId = Number(b.dataset.faceId);
          selectedCharacterId = characterId;
          // Keep the player's existing variation if it belongs to this same
          // character; otherwise default to that character's first variation.
          if (startDef?.characterId !== characterId) {
            const firstVariation = availableVariationsFor(characterId)[0];
            if (firstVariation) chosen = firstVariation.id;
          }
          step = 'variation';
          render();
        };
      });

      card.querySelectorAll<HTMLButtonElement>('.avatar-choice[data-id], .avatar-ring-item[data-id]').forEach((b) => {
        b.onclick = () => {
          chosen = b.dataset.id ?? chosen;
          render();
        };
      });

      // Preview a ring variation in the centre portrait on hover/focus,
      // without re-rendering the ring (which would restart its positioning/
      // animation). Reverts to the actual chosen portrait on leave/blur.
      const center = card.querySelector<HTMLElement>('.avatar-ring-center .avatar-portrait');
      if (center) {
        const showPreview = (id: string | undefined): void => {
          const url = id ? portraitArt(id) : null;
          center.style.backgroundImage = url ? `url(${url})` : '';
        };
        const restoreChosen = (): void => showPreview(chosen);

        card.querySelectorAll<HTMLButtonElement>('.avatar-ring-item[data-id]').forEach((b) => {
          b.addEventListener('mouseenter', () => showPreview(b.dataset.id));
          b.addEventListener('mouseleave', restoreChosen);
          b.addEventListener('focus', () => showPreview(b.dataset.id));
          b.addEventListener('blur', restoreChosen);
        });
      }

      const back = card.querySelector<HTMLButtonElement>('.avatar-back');
      if (back) {
        back.onclick = () => {
          step = 'face';
          selectedCharacterId = undefined;
          render();
        };
      }

      const nameInput = card.querySelector<HTMLInputElement>('.avatar-name');
      if (nameInput) {
        nameInput.oninput = () => {
          name = nameInput.value;
        };
      }

      const done = card.querySelector<HTMLButtonElement>('.avatar-done');
      if (done) {
        done.onclick = () => {
          const cfg: AvatarConfig = { created: true, portrait: chosen };
          const trimmed = name.trim();
          if (trimmed) cfg.name = trimmed.slice(0, 24);
          game.setAvatar(cfg);
          close(true);
        };
      }
    }

    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    });
    render();
    card.querySelector<HTMLButtonElement>('.avatar-done, .avatar-choice')?.focus();
  });
}
