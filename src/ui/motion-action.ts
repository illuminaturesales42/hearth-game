/**
 * Movement flow for motion actions (squats, stretch, slow breaths). A guided
 * rep counter the player taps through; the shipping native build swaps in the
 * device motion sensor for true rep detection. Honest placeholder — the count
 * is real, the sensing is stubbed.
 */
import type { EnergyAction } from '../core/types';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

export async function runMotion(action: EnergyAction): Promise<boolean> {
  const overlay = el('motion-overlay');
  const title = el('motion-title');
  const count = el('motion-count');
  const btn = el<HTMLButtonElement>('motion-btn');
  const closeBtn = el<HTMLButtonElement>('motion-close');
  if (!overlay || !title || !count || !btn || !closeBtn) return false;

  const target = action.motionReps ?? 10;
  const verb = action.motionVerb ?? 'Move';
  let done = 0;

  title.textContent = `${action.label}`;
  count.textContent = `0 / ${target}`;
  btn.textContent = verb;
  overlay.hidden = false;

  return new Promise<boolean>((resolve) => {
    const cleanup = () => {
      overlay.hidden = true;
      btn.onclick = null;
      closeBtn.onclick = null;
    };
    closeBtn.onclick = () => {
      cleanup();
      resolve(false);
    };
    btn.onclick = () => {
      done += 1;
      count.textContent = `${done} / ${target}`;
      btn.classList.remove('bounce');
      // reflow to restart the animation
      void btn.offsetWidth;
      btn.classList.add('bounce');
      if (done >= target) {
        title.textContent = 'Well done.';
        btn.disabled = true;
        setTimeout(() => {
          btn.disabled = false;
          cleanup();
          resolve(true);
        }, 600);
      }
    };
  });
}
