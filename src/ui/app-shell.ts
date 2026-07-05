/**
 * App shell: bottom-nav routing between screens, plus the energy panel opener.
 * Keeps the merge board (Home) always mounted; other screens render lazily.
 */
import type { Game } from '../core/game';
import { BoardView } from './board-view';
import { Home } from './home';
import { EnergyPanel } from './energy-panel';
import { Screens } from './screens';

type ScreenId = 'home' | 'map' | 'villagers' | 'journal' | 'shop';

export class AppShell {
  private active: ScreenId = 'home';
  private energy: EnergyPanel;
  private screens: Screens;
  private rendered = new Set<ScreenId>(['home']);

  constructor(private game: Game) {
    const boardEl = document.getElementById('board');
    if (!boardEl) throw new Error('Missing #board');
    new BoardView(game, boardEl);
    new Home(game);
    this.energy = new EnergyPanel(game);
    this.screens = new Screens(game);

    document.querySelectorAll<HTMLButtonElement>('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.go((btn.dataset.screen as ScreenId) ?? 'home'));
    });
    const pill = document.getElementById('energy-pill');
    if (pill) pill.addEventListener('click', () => this.energy.open());
  }

  private go(id: ScreenId): void {
    this.active = id;
    document.querySelectorAll<HTMLElement>('.screen').forEach((s) => {
      s.classList.toggle('active', s.id === `screen-${id}`);
    });
    document.querySelectorAll<HTMLElement>('.nav-btn').forEach((b) => {
      b.classList.toggle('on', b.dataset.screen === id);
    });
    if (!this.rendered.has(id)) {
      this.rendered.add(id);
      if (id === 'map') this.screens.renderMap();
      if (id === 'villagers') this.screens.renderVillagers();
      if (id === 'journal') this.screens.renderJournal();
      if (id === 'shop') this.screens.renderShop();
    }
  }
}
