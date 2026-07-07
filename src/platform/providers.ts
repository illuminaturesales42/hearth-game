/**
 * Runtime platform wiring (roadmap Phase B). Picks the right health provider
 * for the environment so the native wrap is a config swap, not a code change:
 * the web build self-reports; a Capacitor build with the health plugin bound
 * gets HealthKit / Health Connect.
 *
 * The Capacitor plugin is resolved dynamically and defensively — this file is
 * imported by the web build too, where no such global exists.
 */
import { CapacitorHealthProvider, SelfReportProvider } from '../health/health-provider';
import type { HealthProvider } from '../health/health-provider';

interface HealthPlugin {
  requestAuthorization(opts: { read: string[] }): Promise<{ granted: boolean }>;
  isAvailable(): Promise<{ available: boolean }>;
  queryAggregated(opts: { dataType: string; bucket: string }): Promise<{ value: number; sourceApp?: string }>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: { Health?: HealthPlugin };
}

/** True when running inside a Capacitor native shell. */
export function isNativePlatform(): boolean {
  const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
  return !!cap?.isNativePlatform?.();
}

/**
 * The health provider for this environment. Native + a bound Health plugin →
 * the real sensors; anything else → self-report buttons. Never throws.
 */
export function pickHealthProvider(): HealthProvider {
  try {
    const cap = (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
    const plugin = cap?.Plugins?.Health;
    if (isNativePlatform() && plugin) return new CapacitorHealthProvider(plugin);
  } catch {
    /* fall through to self-report */
  }
  return new SelfReportProvider();
}
