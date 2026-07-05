import { Game } from './core/game';
import { BoardView } from './ui/board-view';
import { Hud } from './ui/hud';
import { track } from './analytics';
import { SelfReportProvider } from './health/health-provider';
import type { HealthSnapshot } from './health/health-provider';

const game = new Game();

const boardEl = document.getElementById('board');
if (!boardEl) throw new Error('Missing #board');

new BoardView(game, boardEl);
new Hud(game);

// ---------- analytics wiring (taxonomy: docs/analytics.md) ----------
let firstMergeSeen = game.snapshot.xp > 0;
let firstOrderSeen = game.snapshot.orderIndex > 0;
track('session_start', { orderIndex: game.snapshot.orderIndex, energy: game.snapshot.energy.current });
game.subscribe((ev) => {
  switch (ev.type) {
    case 'merge':
      if (!firstMergeSeen) {
        firstMergeSeen = true;
        track('ftue_first_merge');
      }
      track('merge', { chain: ev.item.chain, level: ev.item.level });
      break;
    case 'spawn':
      track('spawn');
      break;
    case 'reject':
      if (ev.reason !== 'invalid') track('spawn_blocked', { reason: ev.reason });
      break;
    case 'delivered':
      if (!firstOrderSeen) {
        firstOrderSeen = true;
        track('ftue_first_order', { orderId: ev.orderId });
      }
      track('order_delivered', { orderId: ev.orderId, rewardEnergy: ev.rewardEnergy, rewardCoins: ev.rewardCoins });
      break;
    case 'chapterComplete':
      track('chapter_complete', { chapter: 1 });
      break;
    case 'quest':
      if (ev.granted > 0) track('quest_done', { questId: ev.questId, energy: ev.granted });
      break;
    case 'health':
      track('health_grant', { energy: ev.energy, fromSteps: ev.fromSteps, fromSleep: ev.fromSleep });
      break;
  }
});

// ---------- health provider ----------
// M1 web: self-report only. The Capacitor native shells swap in
// CapacitorHealthProvider here; sync runs at startup and on app foreground.
const health = new SelfReportProvider();
void health.read();

// ---------- dev helpers ----------
declare global {
  interface Window {
    hearthReset: () => void;
    /** Simulate a native health sync, e.g. hearthHealthSim(6200, 7.8) */
    hearthHealthSim: (steps: number, sleepHours?: number) => void;
    hearthEvents: () => void;
  }
}
window.hearthReset = () => {
  localStorage.removeItem('hearth:save:v1');
  location.reload();
};
window.hearthHealthSim = (steps: number, sleepHours?: number) => {
  const snap: HealthSnapshot = {
    stepsToday: steps,
    sleepHoursLastNight: sleepHours ?? null,
    source: 'healthkit',
  };
  game.syncHealth(snap);
};
window.hearthEvents = async () => {
  const { recentEvents } = await import('./analytics');
  console.table(recentEvents().map((e) => ({ name: e.name, ...e.props })));
};
