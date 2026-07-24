/**
 * Settings sheet: sound volumes, text size, contrast, motion, save
 * export/import, diagnostics, reset. Prefs live in the save (v9) and are
 * applied to the document + audio engine on boot and on change.
 */
import type { Game } from '../core/game';
import { clearSave, exportSave, importSave, CURRENT_VERSION } from '../core/save';
import { EXPORT_STAMP_KEY } from './growth';
import { recentEvents } from '../analytics';
import { feedback } from './feedback';
import { toast } from './toast';
import { pickNotificationProvider, DAILY_NOTIF_BODY, DEFAULT_NOTIF_HOUR } from '../platform/notification-provider';
import { requestGeolocation, setLocationByCity, latestLocationLabel, getSkyPref, setSkyPref } from './weather';
import type { SkyPref } from './weather';
import { openAvatarCreator } from './avatar-creator';
import { avatarBustSVG } from './avatar-render';

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

export class SettingsUI {
  private resetArmed = false;

  constructor(private game: Game) {
    el<HTMLButtonElement>('settings-open')?.addEventListener('click', () => this.open());
    el<HTMLButtonElement>('settings-close')?.addEventListener('click', () => this.close());

    el<HTMLButtonElement>('set-avatar')?.addEventListener('click', () => void openAvatarCreator(this.game));
    game.subscribe((ev) => {
      if (ev.type === 'avatar') this.renderAvatarPreview();
    });

    el<HTMLInputElement>('set-music')?.addEventListener('input', (e) => {
      this.game.setPrefs({ musicVol: Number((e.target as HTMLInputElement).value) / 100 });
    });
    el<HTMLInputElement>('set-sfx')?.addEventListener('change', (e) => {
      this.game.setPrefs({ sfxVol: Number((e.target as HTMLInputElement).value) / 100 });
      feedback.chime(523); // audible confirmation at the new level
    });
    document.querySelectorAll<HTMLButtonElement>('#set-textscale button').forEach((b) => {
      b.addEventListener('click', () => this.game.setPrefs({ textScale: Number(b.dataset.scale) }));
    });
    el<HTMLInputElement>('set-contrast')?.addEventListener('change', (e) => {
      this.game.setPrefs({ highContrast: (e.target as HTMLInputElement).checked });
    });
    el<HTMLInputElement>('set-motion')?.addEventListener('change', (e) => {
      this.game.setPrefs({ forceReducedMotion: (e.target as HTMLInputElement).checked });
    });
    el<HTMLInputElement>('set-notif')?.addEventListener('change', (e) => {
      void this.toggleNotifications((e.target as HTMLInputElement).checked);
    });

    el<HTMLButtonElement>('set-export')?.addEventListener('click', () => this.export());
    el<HTMLButtonElement>('set-import')?.addEventListener('click', () => this.import());
    el<HTMLButtonElement>('set-diag')?.addEventListener('click', () => this.diagnostics());
    el<HTMLButtonElement>('set-reset')?.addEventListener('click', () => this.reset());
    el<HTMLButtonElement>('set-loc-gps')?.addEventListener('click', () => void this.useMyLocation());
    el<HTMLButtonElement>('set-loc-city-btn')?.addEventListener('click', () => void this.useCity());
    document.querySelectorAll<HTMLButtonElement>('#set-skypref button').forEach((b) => {
      b.addEventListener('click', () => this.chooseSky(b.dataset.sky as SkyPref));
    });

    game.subscribe((ev) => {
      if (ev.type === 'settings') this.apply();
    });
    this.apply();
  }

  /** Apply prefs to the document + audio engine. Called on boot and change. */
  apply(): void {
    const p = this.game.prefs;
    feedback.setVolumes({ sfx: p.sfxVol, music: p.musicVol });
    const app = document.getElementById('app');
    if (app) (app.style as CSSStyleDeclaration & { zoom?: string }).zoom = String(p.textScale);
    document.body.classList.toggle('high-contrast', p.highContrast);
    document.body.classList.toggle('reduce-motion', p.forceReducedMotion);
    this.renderAvatarPreview();
    this.paint();
  }

  /** Show the player's current bust beside the "Your look" button. */
  private renderAvatarPreview(): void {
    const host = el('set-avatar-preview');
    if (host) host.innerHTML = avatarBustSVG(this.game.avatar.appearance, { backdrop: null, label: 'your look' });
    const btn = el<HTMLButtonElement>('set-avatar');
    if (btn) btn.textContent = this.game.avatar.created ? 'Edit your look' : 'Create your look';
  }

  private open(): void {
    this.resetArmed = false;
    const reset = el<HTMLButtonElement>('set-reset');
    if (reset) reset.textContent = 'Reset everything';
    this.paint();
    el('settings-panel')!.hidden = false;
  }

  private close(): void {
    el('settings-panel')!.hidden = true;
  }

  private paint(): void {
    const p = this.game.prefs;
    const music = el<HTMLInputElement>('set-music');
    if (music) music.value = String(Math.round(p.musicVol * 100));
    const sfx = el<HTMLInputElement>('set-sfx');
    if (sfx) sfx.value = String(Math.round(p.sfxVol * 100));
    document.querySelectorAll<HTMLButtonElement>('#set-textscale button').forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.scale) === p.textScale);
    });
    const contrast = el<HTMLInputElement>('set-contrast');
    if (contrast) contrast.checked = p.highContrast;
    const motion = el<HTMLInputElement>('set-motion');
    if (motion) motion.checked = p.forceReducedMotion;
    const notif = el<HTMLInputElement>('set-notif');
    if (notif) notif.checked = !!p.notifyDaily;
    const notifNote = el('set-notif-note');
    if (notifNote) notifNote.hidden = !p.notifyDaily;
    const v = el('set-version');
    if (v) v.textContent = `Hearth MVP · save v${CURRENT_VERSION} · health data never leaves your device`;
    this.paintLocation();
  }

  /**
   * Opt in/out of the daily hearth reminder. On enable, ask permission then
   * schedule; if permission is refused, quietly revert the toggle (never nag).
   * On disable, cancel the schedule. Persists the choice in prefs.
   */
  private async toggleNotifications(on: boolean): Promise<void> {
    const provider = pickNotificationProvider();
    if (on) {
      const granted = await provider.requestPermission();
      if (!granted) {
        this.game.setPrefs({ notifyDaily: false });
        const box = el<HTMLInputElement>('set-notif');
        if (box) box.checked = false;
        toast('Reminders need notification permission — enable it in your device settings.');
        return;
      }
      const hour = this.game.prefs.notifyHour ?? DEFAULT_NOTIF_HOUR;
      await provider.scheduleDaily(hour, DAILY_NOTIF_BODY);
      this.game.setPrefs({ notifyDaily: true, notifyHour: hour });
      toast(
        provider.canSchedule
          ? 'A gentle daily reminder is set. ☀'
          : 'Saved — reminders arrive fully in the installed app.',
      );
    } else {
      await provider.cancelAll();
      this.game.setPrefs({ notifyDaily: false });
    }
  }

  /** Reflect the current location choice + refresh the status line. */
  private paintLocation(): void {
    const status = el('set-loc-status');
    if (status) {
      const label = latestLocationLabel();
      status.textContent = label
        ? `Following ${label}. The island mirrors its sky.`
        : 'Not set — the island keeps a gentle default sky.';
    }
    this.paintSky();
  }

  private static readonly SKY_NOTE: Record<SkyPref, string> = {
    real: 'Following your real sky. Prefer a mood? Choose one — the day’s light still tracks your true sunrise.',
    clear: 'Clear skies over Emberhollow, whatever it’s doing outside. Your daylight still follows your real sun.',
    rain: 'A cosy rain settles over the island. Your daylight still follows your real sun.',
    snow: 'A soft snowfall blankets the island. Your daylight still follows your real sun.',
  };

  /** Reflect the chosen sky in the segmented control + its note. */
  private paintSky(): void {
    const pref = getSkyPref();
    document.querySelectorAll<HTMLButtonElement>('#set-skypref button').forEach((b) => {
      b.classList.toggle('on', b.dataset.sky === pref);
    });
    const note = el('set-skypref-note');
    if (note) note.textContent = SettingsUI.SKY_NOTE[pref];
  }

  /** Switch the island's sky and repaint straight away. */
  private chooseSky(pref: SkyPref): void {
    if (!pref) return;
    setSkyPref(pref);
    this.paintSky();
    // Nudge the map to re-render with the new sky at once.
    document.dispatchEvent(new CustomEvent('hearth:location-changed'));
  }

  /** Nudge the map to refetch weather for a just-changed location. */
  private notifyLocationChanged(): void {
    document.dispatchEvent(new CustomEvent('hearth:location-changed'));
    this.paintLocation();
  }

  private async useMyLocation(): Promise<void> {
    toast('Asking your device for its location…');
    const ok = await requestGeolocation();
    toast(
      ok ? 'Location shared — your sky is on its way.' : 'Couldn’t get your location. You can set your town instead.',
    );
    if (ok) this.notifyLocationChanged();
  }

  private async useCity(): Promise<void> {
    const input = el<HTMLInputElement>('set-loc-city');
    const name = input?.value.trim() ?? '';
    if (!name) {
      toast('Type your town first.');
      return;
    }
    toast('Finding your town…');
    const label = await setLocationByCity(name);
    if (label) {
      if (input) input.value = '';
      toast(`Set to ${label}.`);
      this.notifyLocationChanged();
    } else {
      toast('Couldn’t find that town. Try a nearby city.');
    }
  }

  private export(): void {
    const json = exportSave();
    if (!json) {
      toast('Nothing to export yet.');
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `hearth-save-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    try {
      localStorage.setItem(EXPORT_STAMP_KEY, String(Date.now()));
    } catch {
      /* fine */
    }
    toast('Save exported. Keep it somewhere warm.');
  }

  private import(): void {
    const json = window.prompt('Paste your exported Hearth save:');
    if (!json) return;
    const state = importSave(json.trim());
    if (state) {
      toast('Save imported. Welcome back to Emberhollow.');
      setTimeout(() => location.reload(), 900);
    } else {
      toast('That save could not be read. Nothing was changed.');
    }
  }

  private diagnostics(): void {
    const diag = {
      when: new Date().toISOString(),
      saveVersion: CURRENT_VERSION,
      ua: navigator.userAgent,
      events: recentEvents().slice(-50),
    };
    void navigator.clipboard
      ?.writeText(JSON.stringify(diag, null, 2))
      .then(() => toast('Diagnostics copied.'))
      .catch(() => toast('Could not copy diagnostics.'));
  }

  private reset(): void {
    const btn = el<HTMLButtonElement>('set-reset');
    if (!this.resetArmed) {
      this.resetArmed = true;
      if (btn) btn.textContent = 'Tap again to erase all progress';
      return;
    }
    clearSave();
    location.reload();
  }
}
