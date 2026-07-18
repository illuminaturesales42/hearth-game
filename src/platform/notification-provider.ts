/**
 * The daily re-engagement notification — one warm nudge, opt-in, no FOMO. Built
 * on the same shape as pickHealthProvider: a native Capacitor scheduler when the
 * plugin is bound (the only path that reliably fires while the app is CLOSED), a
 * best-effort web path, and a graceful no-op otherwise. Never throws.
 *
 * Copy stays cosy: "The hearth is warm — your New Day awaits." No streaks to
 * lose, no countdowns.
 */
import { isNativePlatform } from './providers';

/** Stable id for our single daily notification (so re-scheduling replaces it). */
export const DAILY_NOTIF_ID = 1;
export const DEFAULT_NOTIF_HOUR = 19; // early evening, when the day's winding down
export const DAILY_NOTIF_BODY = 'The hearth is warm — your New Day awaits.';

export interface NotificationProvider {
  /** Whether this environment can fire a scheduled daily notification at all. */
  readonly canSchedule: boolean;
  requestPermission(): Promise<boolean>;
  scheduleDaily(hour: number, body: string): Promise<void>;
  cancelAll(): Promise<void>;
}

/** Minimal shape of `@capacitor/local-notifications` we use (accessed dynamically). */
interface LocalNotificationsPlugin {
  requestPermissions(): Promise<{ display: string }>;
  schedule(opts: {
    notifications: {
      id: number;
      title: string;
      body: string;
      schedule: { on: { hour: number; minute: number }; repeats: boolean; allowWhileIdle?: boolean };
    }[];
  }): Promise<void>;
  cancel(opts: { notifications: { id: number }[] }): Promise<void>;
}

/** Native: a real repeating daily local notification (fires with the app closed). */
class CapacitorNotificationProvider implements NotificationProvider {
  readonly canSchedule = true;
  constructor(private readonly plugin: LocalNotificationsPlugin) {}
  async requestPermission(): Promise<boolean> {
    try {
      const res = await this.plugin.requestPermissions();
      return res.display === 'granted';
    } catch {
      return false;
    }
  }
  async scheduleDaily(hour: number, body: string): Promise<void> {
    await this.cancelAll();
    await this.plugin.schedule({
      notifications: [
        {
          id: DAILY_NOTIF_ID,
          title: 'Emberhollow',
          body,
          schedule: { on: { hour, minute: 0 }, repeats: true, allowWhileIdle: true },
        },
      ],
    });
  }
  async cancelAll(): Promise<void> {
    try {
      await this.plugin.cancel({ notifications: [{ id: DAILY_NOTIF_ID }] });
    } catch {
      /* nothing scheduled */
    }
  }
}

/**
 * Web: the Notification API can ask permission but cannot schedule a future
 * notification for when the tab is closed — so `canSchedule` is false and
 * scheduling is a no-op. (Real closed-app delivery arrives with the native
 * build; a service-worker push server would be the web alternative.)
 */
class WebNotificationProvider implements NotificationProvider {
  readonly canSchedule = false;
  async requestPermission(): Promise<boolean> {
    try {
      const N = (globalThis as { Notification?: { requestPermission(): Promise<string> } }).Notification;
      if (!N) return false;
      return (await N.requestPermission()) === 'granted';
    } catch {
      return false;
    }
  }
  async scheduleDaily(): Promise<void> {
    /* web cannot schedule a closed-app notification — no-op */
  }
  async cancelAll(): Promise<void> {
    /* nothing scheduled */
  }
}

/** Nothing available (SSR / unsupported). Everything succeeds-as-nothing. */
class NoopNotificationProvider implements NotificationProvider {
  readonly canSchedule = false;
  async requestPermission(): Promise<boolean> {
    return false;
  }
  async scheduleDaily(): Promise<void> {}
  async cancelAll(): Promise<void> {}
}

/** Resolve the notification provider for this environment. Never throws. */
export function pickNotificationProvider(): NotificationProvider {
  try {
    const cap = (globalThis as { Capacitor?: { Plugins?: { LocalNotifications?: LocalNotificationsPlugin } } })
      .Capacitor;
    const plugin = cap?.Plugins?.LocalNotifications;
    if (isNativePlatform() && plugin) return new CapacitorNotificationProvider(plugin);
    if ((globalThis as { Notification?: unknown }).Notification) return new WebNotificationProvider();
  } catch {
    /* fall through */
  }
  return new NoopNotificationProvider();
}

/**
 * Pure: the epoch-ms of the next time a `repeats-daily at <hour>:00` would fire,
 * relative to `now`. Today if that hour hasn't passed, else tomorrow. Exposed
 * for tests (the native plugin owns the real repeating schedule).
 */
export function nextDailyFireAt(hour: number, now: number): number {
  const d = new Date(now);
  const fire = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0, 0);
  if (fire.getTime() <= now) fire.setDate(fire.getDate() + 1);
  return fire.getTime();
}
