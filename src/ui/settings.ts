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

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;

export class SettingsUI {
  private resetArmed = false;

  constructor(private game: Game) {
    el<HTMLButtonElement>('settings-open')?.addEventListener('click', () => this.open());
    el<HTMLButtonElement>('settings-close')?.addEventListener('click', () => this.close());

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

    el<HTMLButtonElement>('set-export')?.addEventListener('click', () => this.export());
    el<HTMLButtonElement>('set-import')?.addEventListener('click', () => this.import());
    el<HTMLButtonElement>('set-diag')?.addEventListener('click', () => this.diagnostics());
    el<HTMLButtonElement>('set-reset')?.addEventListener('click', () => this.reset());

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
    this.paint();
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
    const v = el('set-version');
    if (v) v.textContent = `Hearth MVP · save v${CURRENT_VERSION} · health data never leaves your device`;
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
