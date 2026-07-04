import { Game } from './core/game';
import { BoardView } from './ui/board-view';
import { Hud } from './ui/hud';

const game = new Game();

const boardEl = document.getElementById('board');
if (!boardEl) throw new Error('Missing #board');

new BoardView(game, boardEl);
new Hud(game);

// Dev helper: window.hearthReset() wipes the save for playtesting.
declare global {
  interface Window {
    hearthReset: () => void;
  }
}
window.hearthReset = () => {
  localStorage.removeItem('hearth:save:v1');
  location.reload();
};
