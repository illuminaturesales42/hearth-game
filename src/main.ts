import { Game } from './core/game';
import { clearSave } from './core/save';
import { stageFor } from './data/economy';
import { feedback } from './ui/feedback';
import { toast } from './ui/toast';
import { AppShell } from './ui/app-shell';
import { recentEvents, track } from './analytics';
import { SelfReportProvider } from './health/health-provider';
import type { HealthSnapshot } from './health/health-provider';

const game = new Game();
new AppShell(game);

// Heartbeat: passive energy regen + midnight rollover (Chronicle writes itself).
setInterval(() => game.tick(), 20_000);

// Ambient score starts on the first gesture (browser autoplay policy) and
// gains instruments as the village is restored.
const startMusic = () => {
  feedback.startMusic(stageFor(game.snapshot.orderIndex));
  window.removeEventListener('pointerdown', startMusic);
};
window.addEventListener('pointerdown', startMusic);
game.subscribe((ev) => {
  if (ev.type === 'delivered') feedback.setMusicStage(stageFor(game.snapshot.orderIndex));
});

// Wind-down: after 90 minutes of continuous play the hearth suggests rest.
// A softening, never a lock (anti-compulsion pillar).
const sessionStart = Date.now();
let windDownShown = false;
setInterval(() => {
  if (windDownShown || Date.now() - sessionStart < 90 * 60_000) return;
  windDownShown = true;
  document.body.classList.add('winddown');
  toast('The hearth burns low and steady. Emberhollow will keep — rest is progress too.');
}, 5 * 60_000);

// Crash telemetry stays local: errors land in the diagnostics buffer only.
window.addEventListener('error', (e) => {
  track('client_error', { message: String(e.message).slice(0, 200) });
});
window.addEventListener('unhandledrejection', (e) => {
  track('client_error', { message: String(e.reason).slice(0, 200) });
});

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
      track('chapter_complete', { chapter: ev.chapter });
      break;
    case 'action':
      if (ev.energy > 0) track('action_done', { actionId: ev.actionId, energy: ev.energy });
      break;
    case 'chest':
      track('chest_opened', { coins: ev.coins });
      break;
    case 'friendJoined':
      track('friend_joined', { energy: ev.energy });
      break;
    case 'help':
      track('friend_help', { count: ev.count });
      break;
    case 'daily':
      track('daily_bonus', { energy: ev.energy, streak: ev.streak });
      break;
    case 'newDay':
      track('new_day_claimed', { streak: ev.streak, energy: ev.energy, coins: ev.chestCoins });
      break;
    case 'gratitude':
      if (ev.energy > 0) track('gratitude_written', { energy: ev.energy });
      break;
    case 'flashback':
      track('flashback_claimed', { energy: ev.energy });
      break;
    case 'stargaze':
      if (ev.energy > 0) track('stargaze', { energy: ev.energy, moon: ev.moon });
      break;
    case 'kindness':
      if (ev.energy > 0) track('kindness', { energy: ev.energy, selfie: ev.selfie });
      break;
    case 'achievement':
      track('achievement', { id: ev.id });
      break;
    case 'questDone':
      track('daily_quest_done', { label: ev.label, coins: ev.coins });
      break;
    case 'duelEnd':
      track('duel_end', { won: ev.won, streak: ev.streak, coins: ev.coins, items: ev.itemCount });
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
  clearSave();
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
