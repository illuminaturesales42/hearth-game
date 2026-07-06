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
    new NewDayUI(game).maybeShow();
    // The town map now lives on the Home screen; animate it while Home is active.
    this.map.setVisible(true);

    document.querySelectorAll<HTMLButtonElement>('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.go((btn.dataset.screen as ScreenId) ?? 'home'));
    });
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
