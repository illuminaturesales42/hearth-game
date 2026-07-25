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
import { artUrl, actionArt } from './art';
import { FtueUI } from './ftue';
import { maybeNudgeAvatar } from './avatar-creator';
import { NewDayUI } from './new-day';
import { GrowthUI } from './growth';
import { refreshGlobalGlows } from './glow-marker';
import { nudgesForScreen } from '../core/discovery';
import type { Metrics } from '../platform/metrics';

type ScreenId = 'home' | 'create' | 'villagers' | 'journal' | 'shop';

export class AppShell {
  private active: ScreenId = 'home';
  private energy: EnergyPanel;
  private screens: Screens;
  private map: MapView;
  private social: SocialScreen;
  private rendered = new Set<ScreenId>(['home']);

  constructor(
    private game: Game,
    private metrics?: Metrics,
  ) {
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
    new GrowthUI(game);
    const newDay = new NewDayUI(game);
    // New players get the welcome first; the sunrise claim follows it.
    const ftueShown = new FtueUI(game, this.metrics).maybeStart(() => newDay.maybeShow());
    if (!ftueShown) {
      newDay.maybeShow();
      // Existing players (past the FTUE) who never got an avatar: a soft, once-
      // only nudge to choose their look. New players get it inside the FTUE.
      maybeNudgeAvatar(game);
    }
    // The town map now lives on the Home screen; animate it while Home is active.
    this.map.setVisible(true);

    document.querySelectorAll<HTMLButtonElement>('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.go((btn.dataset.screen as ScreenId) ?? 'home'));
      // Painted nav medallions where sliced art exists (Create reuses the hammer).
      const screen = btn.dataset.screen ?? '';
      // Create has no painted medallion yet: prefer nav_create the moment it
      // lands, and meanwhile borrow the hammer tile (a merge sprite, so it
      // needs the contrast lift in .nav-art-fallback to read at 26px).
      const fallbackArt = screen === 'create' ? artUrl('item_wood_3') : null;
      const art = artUrl(`nav_${screen}`) ?? fallbackArt;
      const ico = btn.querySelector('span');
      if (art && ico) {
        ico.textContent = '';
        ico.style.backgroundImage = `url(${art})`;
        ico.classList.add('nav-art');
        if (art === fallbackArt) ico.classList.add('nav-art-fallback');
      }
    });
    // Currency/energy pips get their painted tokens — the energy is the
    // flaming heart (Batch 14); home.ts brightens/dims its glow by level.
    const pip = document.querySelector<HTMLElement>('.energy-pill .pip');
    const energyArt = artUrl('energy_heart') ?? artUrl('res_energy');
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
    // painted wellness medallions on the energy-panel CTAs (Batch 10)
    for (const [btnId, subject] of [
      ['med-open', 'meditate'],
      ['recovery-open', 'cold_plunge'],
      ['star-open', 'sleep'],
      ['kind-open', 'kindness'],
    ] as const) {
      const url = actionArt(subject);
      const ico = document.querySelector<HTMLElement>(`#${btnId} .med-cta-ico`);
      if (url && ico) {
        ico.innerHTML = `<img src="${url}" alt="" />`;
        ico.classList.add('act-art');
      }
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
    const tidyBtn = document.getElementById('tidy-btn');
    if (tidyBtn) tidyBtn.addEventListener('click', () => game.tidy());
    // Workshop toggle: appears once unlocked; flips the crate's spawn table.
    const workshopBtn = document.getElementById('workshop-btn') as HTMLButtonElement | null;
    if (workshopBtn) {
      const syncWorkshop = () => {
        workshopBtn.hidden = !game.workshopUnlocked();
        const on = game.workshopMode();
        workshopBtn.textContent = on ? '⚒ Workshop ✓' : '⚒ Workshop';
        workshopBtn.classList.toggle('on', on);
      };
      workshopBtn.addEventListener('click', () => game.toggleProducerMode());
      game.subscribe(syncWorkshop);
      syncWorkshop();
    }
    const duelCreate = document.getElementById('duel-create-btn');
    if (duelCreate) duelCreate.addEventListener('click', () => duel.start());

    // Discovery glows: light the nav items + energy pill for untried features,
    // and repaint whenever engagement state changes (a glow dies on first use).
    refreshGlobalGlows(game);
    game.subscribe((ev) => {
      if (ev.type === 'state' || ev.type === 'action' || ev.type === 'minigameEnd' || ev.type === 'bond') {
        refreshGlobalGlows(game);
      }
    });
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
    // Opening a screen retires the screen-level nudges its nav dot pointed at —
    // villager & week-digest. (Per-feature game/almanac glows clear only when
    // the player actually plays/opens them, not on a screen visit.)
    if (id === 'villagers' || id === 'journal') {
      for (const nudge of nudgesForScreen(this.game.snapshot, id)) {
        if (nudge.startsWith('villager:') || nudge.startsWith('week-digest:')) this.game.discover(nudge);
      }
    }
    refreshGlobalGlows(this.game);
  }
}
