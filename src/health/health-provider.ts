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
  /** Flights of stairs climbed today (local day). */
  flightsToday: number;
  /** Hours slept in the main sleep session ending this morning; null if unknown. */
  sleepHoursLastNight: number | null;
  /**
   * Which app the sleep reading came from, when the platform exposes it
   * (HealthKit/Health Connect aggregate Apple Watch, Oura, Whoop, Samsung
   * Health, Sleep Cycle, etc.). Shown in the UI as "via <app>".
   */
  sleepSourceApp?: string;
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
    return { stepsToday: 0, flightsToday: 0, sleepHoursLastNight: null, source: 'self-report' };
  }
}

/**
 * Native provider skeleton. Implementation notes for the native spike:
 * - iOS: HKQuantityType stepCount + flightsClimbed (cumulative today),
 *   HKCategoryType sleepAnalysis (sum asleep segments in the 18:00-noon window;
 *   HealthKit already merges Apple Watch, Oura, Whoop, Sleep Cycle, etc.).
 *   Info.plist NSHealthShareUsageDescription = "Hearth turns your steps, stairs
 *   and sleep into game energy. Health data never leaves your device."
 * - Android: Health Connect READ_STEPS + READ_FLOORS_CLIMBED + READ_SLEEP;
 *   aggregate StepsRecord / FloorsClimbedRecord for the local day and the main
 *   SleepSessionRecord (Health Connect merges Samsung Health, Google Fit, etc.).
 * - Both: read-only, on-device conversion, no health data in analytics. Ever.
 */
export class CapacitorHealthProvider implements HealthProvider {
  constructor(
    private plugin: {
      requestAuthorization(opts: { read: string[] }): Promise<{ granted: boolean }>;
      isAvailable(): Promise<{ available: boolean }>;
      queryAggregated(opts: { dataType: string; bucket: string }): Promise<{ value: number; sourceApp?: string }>;
    },
  ) {}

  async requestPermission(): Promise<boolean> {
    try {
      const res = await this.plugin.requestAuthorization({ read: ['steps', 'stairs', 'sleep'] });
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

  private async safeQuery(dataType: string): Promise<{ value: number; sourceApp?: string }> {
    try {
      return await this.plugin.queryAggregated({ dataType, bucket: 'day' });
    } catch {
      return { value: 0 };
    }
  }

  async read(): Promise<HealthSnapshot> {
    try {
      const [steps, flights, sleep] = await Promise.all([
        this.safeQuery('steps'),
        this.safeQuery('stairs'),
        this.safeQuery('sleep'),
      ]);
      const platform = /android/i.test(navigator.userAgent) ? 'health-connect' : 'healthkit';
      const snap: HealthSnapshot = {
        stepsToday: Math.max(0, Math.floor(steps.value)),
        flightsToday: Math.max(0, Math.floor(flights.value)),
        sleepHoursLastNight: sleep.value > 0 ? sleep.value : null,
        source: platform,
      };
      if (sleep.sourceApp) snap.sleepSourceApp = sleep.sourceApp;
      return snap;
    } catch {
      return { stepsToday: 0, flightsToday: 0, sleepHoursLastNight: null, source: 'unavailable' };
    }
  }
}
