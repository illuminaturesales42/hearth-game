import { Game } from './core/game';
import { clearSave } from './core/save';
import { setPhaseOverride } from './core/time-of-day';
import { stageFor } from './data/economy';
import { feedback } from './ui/feedback';
import { toast } from './ui/toast';
import { AppShell } from './ui/app-shell';
import { MinigameUI } from './ui/minigames';
import { confirmDialog } from './ui/confirm-modal';
import { initNetStatus } from './ui/net-status';
import { initTimeBadge } from './ui/time-badge';
import { pickNotificationProvider, DAILY_NOTIF_BODY, DEFAULT_NOTIF_HOUR } from './platform/notification-provider';
import { recentEvents, setSink, track } from './analytics';
import { createNetworkSink, stableAnonId } from './platform/analytics-sink';
import type { HealthSnapshot } from './health/health-provider';
import { pickHealthProvider } from './platform/providers';
import { HttpSyncProvider, LocalMirrorSyncProvider, deviceKey } from './platform/sync-provider';
import { SyncController } from './platform/sync-controller';
import { Metrics, exposeMetricsConsole } from './platform/metrics';
import { computeMood, meditatedToday } from './core/world-mood';
import { registerSW } from 'virtual:pwa-register';

const game = new Game();

// Retention & funnel metrics: mark today active, expose the dev dashboard
// (window.hearthMetrics), report this session. The soft-launch gate is
// retention — this is how we read it during friends-and-family week.
const metrics = new Metrics();
exposeMetricsConsole(metrics);
metrics.reportSession();

new AppShell(game, metrics);

// Village Life: building mini-games, launched from the map building cards via a
// 'hearth:play-minigame' event (unlock at story-complete; attempts from living well).
new MinigameUI(game);

// The corner time-of-day badge on the Home map (reflects the real clock; the
// map's own lighting turns with the same phase).
initTimeBadge();

// If the player opted into the daily hearth reminder, re-affirm the schedule on
// boot (native only; the web/no-op paths do nothing). Never prompts — permission
// was granted at opt-in time.
if (game.prefs.notifyDaily) {
  const provider = pickNotificationProvider();
  if (provider.canSchedule) {
    void provider.scheduleDaily(game.prefs.notifyHour ?? DEFAULT_NOTIF_HOUR, DAILY_NOTIF_BODY);
  }
}

// A quiet offline indicator (the game is local-first; this only reassures).
initNetStatus();

// New-version flow: the SW installs updates in the background but never swaps
// under the player's feet — a warm banner offers a refresh whenever they're
// ready. (This is the structural fix for the "testers stuck on a stale build"
// problem; registerType 'prompt' + this banner replace the self-destroying SW.)
/** True for testers (opted in via ?tester, remembered) — computed early so the
 *  SW can auto-apply updates for them instead of waiting on the banner. */
const isTester = (() => {
  try {
    if (new URLSearchParams(location.search).has('tester')) return true;
    return localStorage.getItem('hearth:tester') === '1';
  } catch {
    return false;
  }
})();

const updateSW = registerSW({
  onNeedRefresh() {
    // Testers always run the freshest build — apply the update and reload at
    // once, no banner, so map/feature tweaks show up without the refresh dance.
    if (isTester) {
      void updateSW(true);
      return;
    }
    const banner = document.getElementById('update-banner');
    const btn = document.getElementById('update-banner-btn');
    if (!banner || !btn) return;
    banner.hidden = false;
    btn.onclick = () => {
      banner.hidden = true;
      void updateSW(true);
    };
  },
  onOfflineReady() {
    toast('Emberhollow is ready to play offline.');
  },
});

// The splash lifts once the shell is mounted (a breath later, so it never blinks).
const splash = document.getElementById('splash');
if (splash) {
  setTimeout(() => {
    splash.classList.add('lifting');
    setTimeout(() => splash.remove(), 650);
  }, 400);
}

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

// Analytics + crash reporting sink. In production, when an endpoint is
// configured (VITE_ANALYTICS_ENDPOINT), events + client errors are batched to
// it (health values stripped at the boundary — see analytics-sink.ts). Without
// an endpoint, or in dev, everything stays in the local in-memory buffer.
const analyticsEndpoint = (import.meta.env.VITE_ANALYTICS_ENDPOINT as string | undefined)?.trim();
if (import.meta.env.PROD && analyticsEndpoint) {
  // A stable pseudonymous id (hashed device key, never the key itself) lets the
  // backend compute cohort retention across sessions — the soft-launch gates.
  const { sink, flush } = createNetworkSink(analyticsEndpoint, { distinctId: stableAnonId(deviceKey()) });
  setSink(sink);
  // A closing/backgrounded tab still reports its last events.
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
}

// Uncaught errors + promise rejections flow through the same sink.
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
    case 'minigameUnlocked':
      track('minigame_unlocked', { id: ev.id });
      break;
    case 'minigameEnd':
      track('minigame_end', { id: ev.id, coins: ev.coins, ember: ev.ember, items: ev.itemCount });
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
// Web self-reports; a Capacitor shell with the Health plugin bound gets real
// HealthKit / Health Connect readings — chosen at runtime, no code change.
const health = pickHealthProvider();
void health.read().then((snap) => {
  if (snap.source === 'healthkit' || snap.source === 'health-connect') game.syncHealth(snap);
});

// ---------- cloud save sync (roadmap Phase B) ----------
// In production the game's own /v1/save Pages Function is the cloud (same
// origin, anonymous device key); in dev there is no Functions runtime, so a
// device-local mirror still guards against a localStorage wipe. Reconciles
// once on launch, then debounced pushes. Failures degrade to "no cloud today".
const provider = import.meta.env.PROD ? new HttpSyncProvider() : new LocalMirrorSyncProvider();
const sync = new SyncController(game, provider);
void sync.start().then((res) => {
  if (res.outcome === 'adopted') {
    toast('Welcome back — your saved village was restored.');
    setTimeout(() => location.reload(), 800);
  } else if (res.outcome === 'conflict' && res.remote) {
    // Two devices diverged: let the player choose; never silently wipe.
    const remote = res.remote;
    void confirmDialog({
      title: 'Two villages found',
      message: 'A saved Emberhollow was found that differs from the one on this device. Which would you like to keep?',
      confirmLabel: 'Keep the saved village',
      cancelLabel: 'Keep this device',
    }).then((keepCloud) => {
      if (keepCloud) void sync.adoptRemote(remote).then((ok) => ok && location.reload());
      else
        void sync.keepLocal(remote).then((ok) => {
          if (!ok) toast('Could not reach the cloud just now — your village is safe on this device.');
        });
    });
  }
});

// ---------- dev helpers ----------
declare global {
  interface Window {
    hearthReset: () => void;
    hearthHealthSim: (steps: number, sleepHours?: number, flights?: number) => void;
    hearthEvents: () => void;
    hearthSeeTown: (orders?: number) => void;
    hearthTestGames: () => void;
    hearthMood: () => unknown;
    hearthSky: (mode?: string) => void;
  }
}
// Tester hooks (hearthSeeTown, hearthReset, …). Always on in dev; in the
// deployed build they're OFF for normal players but a friends-and-family tester
// can opt in by visiting the site once with ?tester (the flag is remembered).
// This is a closed-test convenience, not a launch feature.
const _params = new URLSearchParams(location.search);
if (_params.has('tester')) {
  try {
    localStorage.setItem('hearth:tester', '1');
  } catch {
    /* ignore */
  }
}
const testerMode =
  import.meta.env.DEV ||
  _params.has('tester') ||
  (() => {
    try {
      return localStorage.getItem('hearth:tester') === '1';
    } catch {
      return false;
    }
  })();
if (testerMode) {
  // Unlimited mini-game goes so a tester can try every mechanic freely.
  game.setTesterUnlimited(true);
  window.hearthReset = () => {
    clearSave();
    location.reload();
  };
  // Live reactive-world readout: watch the WorldMood values change as real
  // actions are logged (proves the world is reacting; weather is null here).
  window.hearthMood = () => {
    const s = game.snapshot;
    const m = computeMood({
      weather: null,
      meditatedToday: meditatedToday(s.actions.counts),
      lastCalmDay: s.wellbeing.lastCalmDay,
      today: s.actions.day,
      sleptWell: (s.healthLedger?.sleepGranted ?? 0) > 0,
      counts: s.actions.counts,
      walkedToday: (s.healthLedger?.stepsGranted ?? 0) > 0,
      streak: s.actions.streak,
    });
    console.table(m);
    return m;
  };
  // Preview the composed town: jump the story forward so buildings appear.
  // e.g. hearthSeeTown(12) = end of Chapter 1; hearthSeeTown() = everything.
  window.hearthSeeTown = (orders = 24) => {
    game.devPreviewStory(orders);
    document.querySelector<HTMLButtonElement>('.nav-btn[data-screen="home"]')?.click();
  };
  // One-call setup to test every Village Life game: story complete, town funded,
  // all six games opened (incl. the L2-gated ones), plenty of energy + goes.
  window.hearthTestGames = () => {
    game.devUnlockMinigames();
    document.querySelector<HTMLButtonElement>('.nav-btn[data-screen="home"]')?.click();
    console.info('Village Life ready — tap the well, lighthouse, blacksmith, fisher hut, garden, or library.');
  };
  // Force any time-of-day look for visual inspection: hearthSky('night').
  // hearthSky('real') (or no argument) returns to the real solar clock; a
  // reload always returns to real. Weather is inspected separately via
  // Settings → "Pick your sky" — the two combine.
  window.hearthSky = (mode?: string) => {
    const phases = ['dawn', 'midday', 'dusk', 'night'] as const;
    const named: Record<string, 'sunrise' | 'midday' | 'sunset' | 'night'> = {
      dawn: 'sunrise',
      sunrise: 'sunrise',
      midday: 'midday',
      day: 'midday',
      noon: 'midday',
      dusk: 'sunset',
      sunset: 'sunset',
      night: 'night',
    };
    const pick = mode ? named[mode.toLowerCase()] : undefined;
    if (mode && mode !== 'real' && !pick) {
      console.info(`hearthSky: unknown mode '${mode}'. Use: ${phases.join(' / ')} — or 'real' to follow your sun.`);
      return;
    }
    setPhaseOverride(pick ?? null);
    document.dispatchEvent(new CustomEvent('hearth:sky-updated'));
    document.querySelector<HTMLButtonElement>('.nav-btn[data-screen="home"]')?.click();
    console.info(
      pick
        ? `Sky forced to ${mode?.toUpperCase()} (cast-shadow direction stays honest to your real sun). hearthSky('real') to return.`
        : 'Sky following your real sun again.',
    );
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
}
