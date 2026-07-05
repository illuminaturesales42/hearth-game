import { Game } from './core/game';
import { AppShell } from './ui/app-shell';
import { recentEvents, track } from './analytics';
import { SelfReportProvider } from './health/health-provider';
import type { HealthSnapshot } from './health/health-provider';

const game = new Game();
new AppShell(game);

// ---------- analytics (taxonomy: docs/analytics.md) ----------
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
    case 'action':
      if (ev.energy > 0) track('action_done', { actionId: ev.actionId, energy: ev.energy });
      break;
    case 'chest':
      track('chest_opened', { coins: ev.coins });
      break;
    case 'health':
      track('health_grant', {
        energy: ev.energy,
        fromSteps: ev.fromSteps,
        fromStairs: ev.fromStairs,
        fromSleep: ev.fromSleep,
      });
      break;
  }
});

// ---------- health provider ----------
// M1 web: self-report only. Native shells swap CapacitorHealthProvider in here
// and call game.syncHealth on startup + app foreground.
const health = new SelfReportProvider();
void health.read();

// ---------- dev helpers ----------
declare global {
  interface Window {
    hearthReset: () => void;
    hearthHealthSim: (steps: number, sleepHours?: number, flights?: number) => void;
    hearthEvents: () => void;
  }
}
window.hearthReset = () => {
  localStorage.removeItem('hearth:save:v3');
  location.reload();
};
window.hearthHealthSim = (steps: number, sleepHours?: number, flights?: number) => {
  const snap: HealthSnapshot = {
    stepsToday: steps,
    flightsToday: flights ?? 0,
    sleepHoursLastNight: sleepHours ?? null,
    source: 'healthkit',
  };
  game.syncHealth(snap);
};
window.hearthEvents = () => {
  console.table(recentEvents().map((e) => ({ name: e.name, ...e.props })));
};
