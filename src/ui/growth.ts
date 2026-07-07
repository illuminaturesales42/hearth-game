/**
 * Growth & data-safety touches from the market research
 * (docs/market-research-2026-07.md):
 *  - email capture ("get the next chapter first") — the launch channel
 *  - Share my town — the 10-second-clip hook, player-shaped
 *  - install-to-home-screen + export nudges — iOS evicts PWA storage after
 *    7 quiet days; until cloud saves, install + export are the defence
 * All of it is invitation-only: dismissible, snoozed, never a gate.
 */
import type { Game } from '../core/game';
import { ORDERS } from '../data/economy';
import { toast } from './toast';

/** Swap for a real list address/endpoint when one exists. */
const LIST_EMAIL = 'illuminature.sales@gmail.com';

const EMAIL_KEY = 'hearth:email-card'; // 'joined' | 'later:<epoch>'
const KEEPSAFE_KEY = 'hearth:keepsafe-snooze'; // epoch ms of last dismissal
export const EXPORT_STAMP_KEY = 'hearth:lastExportAt';

const DAY = 24 * 60 * 60 * 1000;

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export class GrowthUI {
  private installEvt: InstallPromptEvent | null = null;

  constructor(private game: Game) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installEvt = e as InstallPromptEvent;
      this.renderKeepsafe();
    });
    this.wireEmailCard();
    this.wireShare();
    this.renderEmailCard();
    this.renderKeepsafe();
    // Cards react to progress: they appear once the player is invested.
    game.subscribe((ev) => {
      if (ev.type === 'delivered') {
        this.renderEmailCard();
        this.renderKeepsafe();
      }
    });
  }

  // ---------- email capture ----------

  private wireEmailCard(): void {
    document.getElementById('email-join')?.addEventListener('click', () => {
      const subject = encodeURIComponent('Hearth — keep me posted');
      const body = encodeURIComponent(
        'Count me in for Hearth news and the next chapter first.\n\n(Just hit send — that’s it.)',
      );
      window.open(`mailto:${LIST_EMAIL}?subject=${subject}&body=${body}`, '_self');
      try {
        localStorage.setItem(EMAIL_KEY, 'joined');
      } catch { /* fine */ }
      this.renderEmailCard();
      toast('Thank you — you’ll hear when the next chapter is ready.');
    });
    document.getElementById('email-later')?.addEventListener('click', () => {
      try {
        localStorage.setItem(EMAIL_KEY, `later:${Date.now()}`);
      } catch { /* fine */ }
      this.renderEmailCard();
    });
  }

  private renderEmailCard(): void {
    const card = document.getElementById('email-card');
    if (!card) return;
    let flag = '';
    try {
      flag = localStorage.getItem(EMAIL_KEY) ?? '';
    } catch { /* fine */ }
    const snoozed = flag.startsWith('later:') && Date.now() - Number(flag.slice(6)) < 3 * DAY;
    const engaged = this.game.snapshot.orderIndex >= 2;
    card.hidden = !engaged || flag === 'joined' || snoozed;
  }

  // ---------- share my town ----------

  private wireShare(): void {
    document.getElementById('share-town-btn')?.addEventListener('click', () => void this.shareTown());
  }

  /** Compose the current town into a shareable card and hand it to the OS. */
  private async shareTown(): Promise<void> {
    const src = document.getElementById('map-canvas') as HTMLCanvasElement | null;
    if (!src || src.width === 0) {
      toast('The town is still waking up — try again in a moment.');
      return;
    }
    const pct = Math.round((this.game.snapshot.orderIndex / ORDERS.length) * 100);
    const out = document.createElement('canvas');
    out.width = 1080;
    out.height = 860;
    const ctx = out.getContext('2d');
    if (!ctx) return;
    // night-navy card with the town as its centrepiece
    ctx.fillStyle = '#0f1626';
    ctx.fillRect(0, 0, out.width, out.height);
    const pad = 40;
    const mapW = out.width - pad * 2;
    const mapH = Math.round((mapW / src.width) * src.height);
    ctx.drawImage(src, pad, 150, mapW, mapH);
    ctx.strokeStyle = 'rgba(240, 200, 120, 0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(pad, 150, mapW, mapH);
    ctx.fillStyle = '#f0c878';
    ctx.font = '600 64px Georgia, serif';
    ctx.textAlign = 'center';
    ctx.fillText('HEARTH', out.width / 2, 95);
    ctx.fillStyle = 'rgba(235, 226, 208, 0.9)';
    ctx.font = '30px Georgia, serif';
    ctx.fillText(`Emberhollow, ${pct}% restored — grown by my real days`, out.width / 2, 150 + mapH + 62);
    ctx.font = '24px Georgia, serif';
    ctx.fillStyle = 'rgba(235, 226, 208, 0.55)';
    ctx.fillText('a merge story warmed by walks, sleep and small kindnesses', out.width / 2, 150 + mapH + 104);

    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
    if (!blob) return;
    const file = new File([blob], 'my-emberhollow.png', { type: 'image/png' });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'My Emberhollow', text: `Emberhollow, ${pct}% restored — grown by my real days.` });
        return;
      } catch {
        /* user cancelled — fall through to download */
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'my-emberhollow.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Town portrait saved — share it anywhere.');
  }

  // ---------- keep-your-save-safe (install + export nudges) ----------

  private renderKeepsafe(): void {
    const card = document.getElementById('keepsafe-card');
    const text = document.getElementById('keepsafe-text');
    const btn = document.getElementById('keepsafe-install') as HTMLButtonElement | null;
    if (!card || !text || !btn) return;

    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const engaged = this.game.snapshot.orderIndex >= 3;
    let snoozedAt = 0;
    try {
      snoozedAt = Number(localStorage.getItem(KEEPSAFE_KEY) ?? 0);
    } catch { /* fine */ }
    const snoozed = Date.now() - snoozedAt < 7 * DAY;

    let lastExport = 0;
    try {
      lastExport = Number(localStorage.getItem(EXPORT_STAMP_KEY) ?? 0);
    } catch { /* fine */ }
    const exportStale = Date.now() - lastExport > 5 * DAY;

    const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const needsInstall = !standalone && (isIos || this.installEvt !== null);
    const show = engaged && !snoozed && (needsInstall || exportStale);
    card.hidden = !show;
    if (!show) return;

    if (needsInstall && isIos && !this.installEvt) {
      text.textContent =
        'iPhones clear browser saves after a week away. Add Hearth to your Home Screen (Share → Add to Home Screen) to keep Emberhollow safe — and export a copy in Settings.';
      btn.hidden = true;
    } else if (needsInstall) {
      text.textContent = 'Install Hearth to keep your village safe between visits — and export a copy in Settings.';
      btn.hidden = false;
      btn.onclick = () => {
        void this.installEvt?.prompt();
        this.installEvt = null;
        this.renderKeepsafe();
      };
    } else {
      text.textContent = 'It’s been a while since your last save export. A copy in Settings keeps Emberhollow safe, whatever happens to this device.';
      btn.hidden = true;
    }
    document.getElementById('keepsafe-later')?.addEventListener(
      'click',
      () => {
        try {
          localStorage.setItem(KEEPSAFE_KEY, String(Date.now()));
        } catch { /* fine */ }
        card.hidden = true;
      },
      { once: true },
    );
  }
}
