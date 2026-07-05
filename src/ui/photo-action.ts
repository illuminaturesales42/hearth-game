/**
 * Camera capture flow for photo actions (photograph the sunrise, step outside,
 * find something green). On the web it uses getUserMedia; on device the native
 * shell can swap in @capacitor/camera. Sunrise/sunset actions are gated to the
 * player's real local light window via src/core/sun — a gate a clock change
 * can't beat.
 *
 * The captured image never leaves the device and is never uploaded. It exists
 * only long enough to show the player their own shot.
 */
import type { EnergyAction } from '../core/types';
import { isWithinWindow, windowOpensLabel } from '../core/sun';
import type { Coords } from '../core/sun';

let coords: Coords | undefined;

/** Best-effort one-time location for accurate sun windows. Optional. */
export async function primeLocation(): Promise<void> {
  if (coords || !('geolocation' in navigator)) return;
  await new Promise<void>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) => {
        coords = { lat: p.coords.latitude, lng: p.coords.longitude };
        resolve();
      },
      () => resolve(),
      { timeout: 4000, maximumAge: 3_600_000 },
    );
  });
}

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

/**
 * Run the capture flow for an action. Resolves true if a valid photo was taken
 * (and the caller should grant energy), false if cancelled or out of window.
 */
export async function capturePhoto(action: EnergyAction): Promise<boolean> {
  const overlay = el('photo-overlay');
  const video = el<HTMLVideoElement>('photo-video');
  const promptEl = el('photo-prompt');
  const shutter = el<HTMLButtonElement>('photo-shutter');
  const closeBtn = el<HTMLButtonElement>('photo-close');
  const gate = el('photo-gate');
  const flash = el('photo-flash');
  if (!overlay || !video || !promptEl || !shutter || !closeBtn || !gate || !flash) return false;

  const gated = action.photoWindow === 'sunrise' || action.photoWindow === 'sunset';
  if (gated) await primeLocation();
  const now = Date.now();
  const inWindow = !gated || isWithinWindow(action.photoWindow as 'sunrise' | 'sunset', now, coords);

  promptEl.textContent = action.photoPrompt ?? 'Take a photo';
  overlay.hidden = false;

  return new Promise<boolean>((resolve) => {
    let stream: MediaStream | null = null;
    const cleanup = () => {
      stream?.getTracks().forEach((t) => t.stop());
      overlay.hidden = true;
      gate.hidden = true;
      shutter.disabled = false;
      video.hidden = false;
    };
    const finish = (ok: boolean) => {
      cleanup();
      resolve(ok);
    };

    closeBtn.onclick = () => finish(false);

    if (!inWindow) {
      // Real, un-cheatable gate: the sun isn't where it needs to be.
      const when = windowOpensLabel(action.photoWindow as 'sunrise' | 'sunset', now, coords);
      const kind = action.photoWindow === 'sunrise' ? 'sunrise' : 'sunset';
      gate.hidden = false;
      gate.innerHTML =
        `<div class="gate-glow">🌅</div>` +
        `<p>The ${kind} isn't here yet.</p>` +
        `<p class="gate-sub">This one opens around <b>${when}</b>. The hearth will be waiting.</p>`;
      video.hidden = true;
      shutter.disabled = true;
      return;
    }

    // Live viewfinder
    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        video.srcObject = stream;
        await video.play();
      } catch {
        // No camera / denied. For day photos, honour-system confirm; gated
        // actions still passed the time check above, so allow the confirm too.
        video.hidden = true;
        gate.hidden = false;
        gate.innerHTML =
          `<div class="gate-glow">📷</div>` +
          `<p>Camera unavailable.</p>` +
          `<p class="gate-sub">Tap below to log it on your honour.</p>` +
          `<button class="btn-primary" id="photo-honour">I took one</button>`;
        const honour = el<HTMLButtonElement>('photo-honour');
        if (honour) honour.onclick = () => finish(true);
        shutter.disabled = true;
        return;
      }
    })();

    shutter.onclick = () => {
      flash.classList.add('fire');
      setTimeout(() => flash.classList.remove('fire'), 320);
      promptEl.textContent = 'Lovely. The hearth brightens.';
      shutter.disabled = true;
      setTimeout(() => finish(true), 620);
    };
  });
}
