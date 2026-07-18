import { describe, expect, it } from 'vitest';
import {
  nextDailyFireAt,
  pickNotificationProvider,
  DAILY_NOTIF_ID,
  DEFAULT_NOTIF_HOUR,
} from '../src/platform/notification-provider';

describe('daily notification scheduling (pure)', () => {
  it('fires today when the hour is still ahead', () => {
    const now = new Date(2026, 6, 18, 9, 0, 0).getTime(); // 09:00
    const fire = new Date(nextDailyFireAt(19, now));
    expect(fire.getDate()).toBe(18);
    expect(fire.getHours()).toBe(19);
    expect(fire.getMinutes()).toBe(0);
  });

  it('rolls to tomorrow when the hour has already passed', () => {
    const now = new Date(2026, 6, 18, 21, 0, 0).getTime(); // 21:00, past 19:00
    const fire = new Date(nextDailyFireAt(19, now));
    expect(fire.getDate()).toBe(19); // tomorrow
    expect(fire.getHours()).toBe(19);
  });

  it('at exactly the hour, rolls to tomorrow (never fires in the past)', () => {
    const now = new Date(2026, 6, 18, 19, 0, 0).getTime();
    expect(new Date(nextDailyFireAt(19, now)).getDate()).toBe(19);
  });

  it('the default hour is a sane evening slot', () => {
    expect(DEFAULT_NOTIF_HOUR).toBeGreaterThanOrEqual(17);
    expect(DEFAULT_NOTIF_HOUR).toBeLessThanOrEqual(21);
    expect(DAILY_NOTIF_ID).toBe(1);
  });

  it('picks a provider that never throws and reports whether it can schedule', async () => {
    const p = pickNotificationProvider(); // jsdom: web or no-op, canSchedule false
    expect(typeof p.canSchedule).toBe('boolean');
    // all methods resolve without throwing even with no permission/plugin
    await expect(p.scheduleDaily(19, 'test')).resolves.toBeUndefined();
    await expect(p.cancelAll()).resolves.toBeUndefined();
    expect([true, false]).toContain(await p.requestPermission());
  });
});
