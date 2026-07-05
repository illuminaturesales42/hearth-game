/**
 * A Kind Word — prompts the player to compliment a stranger, logs it for energy,
 * and offers a selfie-with-a-new-friend bonus (camera capture). Honour system.
 */
import type { Game } from '../core/game';
import { KINDNESS, promptAt } from '../data/kindness';
import { capturePhoto } from './photo-action';
import type { EnergyAction } from '../core/types';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

const SELFIE_ACTION = {
  id: 'kindness-selfie',
  label: 'Selfie with your new friend',
  sublabel: '',
  icon: '🤳',
  energy: 0,
  timesPerDay: 1,
  kind: 'photo',
  featured: false,
  photoPrompt: 'A selfie with your new friend',
  photoWindow: 'day',
} as EnergyAction;

export class KindnessUI {
  private idx = 0;

  constructor(private game: Game) {
    const close = el<HTMLButtonElement>('kind-close');
    if (close) close.onclick = () => this.hide();
    const another = el<HTMLButtonElement>('kind-another');
    if (another)
      another.onclick = () => {
        this.idx += 1;
        this.paint();
      };
    const did = el<HTMLButtonElement>('kind-did');
    if (did) did.onclick = () => this.finish(false);
    const selfie = el<HTMLButtonElement>('kind-selfie');
    if (selfie) selfie.onclick = () => void this.withSelfie();
  }

  open(): void {
    const overlay = el('kind-overlay');
    if (!overlay) return;
    this.paint();
    overlay.hidden = false;
  }

  private hide(): void {
    const overlay = el('kind-overlay');
    if (overlay) overlay.hidden = true;
  }

  private paint(): void {
    const done = !this.game.canDoKindness();
    el('kind-prompt')!.textContent = done ? 'You’ve warmed a stranger today. Beautiful.' : promptAt(this.idx);
    const buttons = ['kind-another', 'kind-did', 'kind-selfie'];
    buttons.forEach((id) => {
      const b = el<HTMLButtonElement>(id);
      if (b) b.hidden = done;
    });
    const didBtn = el<HTMLButtonElement>('kind-did');
    if (didBtn) didBtn.textContent = `I did it · +${KINDNESS.baseEnergy}`;
    const selfieBtn = el<HTMLButtonElement>('kind-selfie');
    if (selfieBtn) selfieBtn.textContent = `…and took a selfie · +${KINDNESS.baseEnergy + KINDNESS.selfieBonus}`;
  }

  private finish(withSelfie: boolean): void {
    this.game.doKindness(withSelfie);
    this.hide();
  }

  private async withSelfie(): Promise<void> {
    const ok = await capturePhoto(SELFIE_ACTION);
    if (ok) this.finish(true);
  }
}
