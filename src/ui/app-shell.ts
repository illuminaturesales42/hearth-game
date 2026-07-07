/**
 * App shell: bottom-nav routing between screens, plus the energy panel opener.
 * Keeps the merge board (Home) always mounted; other screens render lazily.
 */
import type { Game } from '../core/game';
import { BoardView } from './board-view';
import { Home } from './home';
import { EnergyPanel } from './energy-panel';
import { Screens } from './screens';
import { MeditationUI } from './meditation';
import { RecoveryUI } from './recovery';
import { MapView } from './map-view';
import { SocialScreen } from './social-screen';
import { AutoMergeController } from './auto-merge';
import { StargazeUI } from './stargaze';
import { DuelUI } from './duel';
import { KindnessUI } from './kindness';
import { SettingsUI } from './settings';
import { artUrl } from './art';
import { FtueUI } from './ftue';
import { NewDayUI } from './new-day';

type ScreenId = 'home' | 'create' | 'villagers' | 'journal' | 'shop';

export class AppShell {
  private active: ScreenId = 'home';
  private energy: EnergyPanel;
  private screens: Screens;
  private map: MapView;
  private social: SocialScreen;
  private rendered = new Set<ScreenId>(['home']);

  constructor(private game: Game) {
    const boardEl = document.getElementById('board');
    if (!boardEl) throw new Error('Missing #board');
    new BoardView(game, boardEl);
    new Home(game);
    this.energy = new EnergyPanel(game);
    this.screens = new Screens(game);
    this.map = new MapView(game);
    const duel = new DuelUI(game);
    this.social = new SocialScreen(game, () => duel.start());
    const meditation = new MeditationUI(game);
    const recovery = new RecoveryUI(game);
    const stargaze = new StargazeUI(game);
    const kindness = new KindnessUI(game);
    new SettingsUI(game);
    new AutoMergeController(game);
    const newDay = new NewDayUI(game);
    // New players get the welcome first; the sunrise claim follows it.
    const ftueShown = new FtueUI(game).maybeStart(() => newDay.maybeShow());
    if (!ftueShown) newDay.maybeShow();
    // The town map now lives on the Home screen; animate it while Home is active.
    this.map.setVisible(true);

    document.querySelectorAll<HTMLButtonElement>('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.go((btn.dataset.screen as ScreenId) ?? 'home'));
      // Painted nav medallions where sliced art exists (Create reuses the hammer).
      const screen = btn.dataset.screen ?? '';
      const art = artUrl(screen === 'create' ? 'item_wood_3' : `nav_${screen}`);
      const ico = btn.querySelector('span');
      if (art && ico) {
        ico.textContent = '';
        ico.style.backgroundImage = `url(${art})`;
        ico.classList.add('nav-art');
      }
    });
    // Currency/energy pips get their painted tokens.
    const pip = document.querySelector<HTMLElement>('.energy-pill .pip');
    const energyArt = artUrl('res_energy');
    if (pip && energyArt) {
      pip.style.backgroundImage = `url(${energyArt})`;
      pip.classList.add('pip-art');
    }
    const coin = document.querySelector<HTMLElement>('.coinpill .coin-ico');
    const coinArt = artUrl('res_coin');
    if (coin && coinArt) {
      coin.style.backgroundImage = `url(${coinArt})`;
      coin.classList.add('pip-art');
    }
    const pill = document.getElementById('energy-pill');
    if (pill) pill.addEventListener('click', () => this.energy.open());
    const medOpen = document.getElementById('med-open');
    if (medOpen) medOpen.addEventListener('click', () => meditation.openMenu());
    const recoveryOpen = document.getElementById('recovery-open');
    if (recoveryOpen) recoveryOpen.addEventListener('click', () => recovery.open());
    const starOpen = document.getElementById('star-open');
    if (starOpen) starOpen.addEventListener('click', () => stargaze.open());
    const kindOpen = document.getElementById('kind-open');
    if (kindOpen) kindOpen.addEventListener('click', () => kindness.open());
    // Board tools: single-step undo + duel straight from the workshop.
    const undoBtn = document.getElementById('undo-btn') as HTMLButtonElement | null;
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        game.undoLastMerge();
        undoBtn.hidden = true;
      });
      game.subscribe((ev) => {
        if (ev.type === 'merge') undoBtn.hidden = false;
        else if (ev.type !== 'state') undoBtn.hidden = !game.canUndoMerge();
      });
    }
    const duelCreate = document.getElementById('duel-create-btn');
    if (duelCreate) duelCreate.addEventListener('click', () => duel.start());
  }

  private go(id: ScreenId): void {
    this.active = id;
    document.querySelectorAll<HTMLElement>('.screen').forEach((s) => {
      s.classList.toggle('active', s.id === `screen-${id}`);
    });
    document.querySelectorAll<HTMLElement>('.nav-btn').forEach((b) => {
      b.classList.toggle('on', b.dataset.screen === id);
    });
    // The map (on Home) animates only while Home is showing.
    this.map.setVisible(id === 'home');
    // Social/villagers re-renders on every view (friend + gift state changes).
    if (id === 'villagers') this.social.render();
    if (!this.rendered.has(id)) {
      this.rendered.add(id);
      if (id === 'journal') this.screens.renderJournal();
      if (id === 'shop') this.screens.renderShop();
    }
  }
}
