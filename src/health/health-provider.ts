/**
 * Health data abstraction. The game only ever sees HealthSnapshot;
 * platform plugins live behind this interface.
 *
 * Providers:
 *  - SelfReportProvider: M1 web / permission-denied fallback (life quest buttons)
 *  - CapacitorHealthProvider: HealthKit (iOS) / Health Connect (Android)
 *    via @capacitor-community/health or capacitor-health; wired when the
 *    native shells are added in Xcode/Android Studio.
 */

export interface HealthSnapshot {
  /** Steps counted so far today (local day). */
  stepsToday: number;
  /** Hours slept in the main sleep session ending this morning; null if unknown. */
  sleepHoursLastNight: number | null;
  /** Data origin, surfaced in the UI for honesty. */
  source: 'healthkit' | 'health-connect' | 'self-report' | 'unavailable';
}

export interface HealthProvider {
  /** Ask for read permission. Resolves granted state; never throws to UI. */
  requestPermission(): Promise<boolean>;
  isAvailable(): Promise<boolean>;
  read(): Promise<HealthSnapshot>;
}

/** Fallback provider: no sensors, quests are self-reported buttons. */
export class SelfReportProvider implements HealthProvider {
  async requestPermission(): Promise<boolean> {
    return false;
  }
  async isAvailable(): Promise<boolean> {
    return false;
  }
  async read(): Promise<HealthSnapshot> {
    return { stepsToday: 0, sleepHoursLastNight: null, source: 'self-report' };
  }
}

/**
 * Native provider skeleton. Implementation notes for the native spike:
 * - iOS: HKQuantityType stepCount (cumulative today), HKCategoryType sleepAnalysis
 *   (sum asleep segments in the 18:00-noon window). Info.plist:
 *   NSHealthShareUsageDescription = "Hearth converts your steps and sleep into
 *   game energy. Health data never leaves your device."
 * - Android: Health Connect READ_STEPS + READ_SLEEP; aggregate StepsRecord for
 *   local day, SleepSessionRecord duration.
 * - Both: read-only, on-device conversion, no health data in analytics. Ever.
 */
export class CapacitorHealthProvider implements HealthProvider {
  constructor(private plugin: {
    requestAuthorization(opts: { read: string[] }): Promise<{ granted: boolean }>;
    isAvailable(): Promise<{ available: boolean }>;
    queryAggregated(opts: { dataType: string; bucket: string }): Promise<{ value: number }>;
  }) {}

  async requestPermission(): Promise<boolean> {
    try {
      const res = await this.plugin.requestAuthorization({ read: ['steps', 'sleep'] });
      return res.granted;
    } catch {
      return false;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      return (await this.plugin.isAvailable()).available;
    } catch {
      return false;
    }
  }

  async read(): Promise<HealthSnapshot> {
    try {
      const steps = await this.plugin.queryAggregated({ dataType: 'steps', bucket: 'day' });
      let sleep: number | null = null;
      try {
        const s = await this.plugin.queryAggregated({ dataType: 'sleep', bucket: 'day' });
        sleep = s.value > 0 ? s.value : null;
      } catch {
        sleep = null;
      }
      const platform = /android/i.test(navigator.userAgent) ? 'health-connect' : 'healthkit';
      return { stepsToday: Math.max(0, Math.floor(steps.value)), sleepHoursLastNight: sleep, source: platform };
    } catch {
      return { stepsToday: 0, sleepHoursLastNight: null, source: 'unavailable' };
    }
  }
}
