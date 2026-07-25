/**
 * Network analytics sink (roadmap Phase C: instrument retention with a real
 * backend). Drops into the existing analytics facade via `setSink()` — the
 * game keeps calling `track()`; this is only where the events go.
 *
 * Privacy is enforced HERE as belt-and-braces, on top of the taxonomy rule
 * (docs/analytics.md: only derived energy is ever emitted, never raw health):
 * `stripHealthValues` removes any prop that could carry a raw health reading
 * (step counts, sleep hours, heart rate) before an event leaves the device.
 * Derived-energy props like `fromSteps` (energy earned from steps) are game
 * values, not health data, and are intentionally kept.
 *
 * Transport is a batched beacon: cheap, fire-and-forget, and it flushes on
 * page hide so a closing tab still reports. Vendor SDKs (PostHog/Sentry) can
 * replace `createNetworkSink` behind the same `AnalyticsEvent` contract.
 */
import type { AnalyticsEvent } from '../analytics';

type Props = Record<string, string | number | boolean>;

/**
 * Prop keys that must never leave the device — raw health readings. Matched
 * case-insensitively against the exact key name. Derived-energy keys (fromSteps,
 * fromStairs, fromSleep) are deliberately NOT here: they carry game energy.
 */
const RAW_HEALTH_KEYS = new Set(
  [
    'steps',
    'stepsToday',
    'flights',
    'flightsToday',
    'stairs',
    'sleep',
    'sleepHours',
    'sleepHoursLastNight',
    'heartRate',
    'restingHeartRate',
    'hrv',
    'bpm',
    'weight',
    'weightKg',
  ].map((k) => k.toLowerCase()),
);

/** Remove any raw-health-looking prop and any non-primitive value. */
export function stripHealthValues(props: Props): Props {
  const out: Props = {};
  for (const [key, value] of Object.entries(props)) {
    if (RAW_HEALTH_KEYS.has(key.toLowerCase())) continue;
    const t = typeof value;
    if (t === 'string' || t === 'number' || t === 'boolean') out[key] = value;
  }
  return out;
}

/** A sanitized event as it goes over the wire (session-scoped, no PII). */
export interface WireEvent {
  name: string;
  props: Props;
  at: number;
  session: string;
  /** Stable pseudonymous device id — present only when configured. Lets the
   *  backend compute cohort retention (D1/D7/D30) across sessions. Never the
   *  raw device key (see stableAnonId). */
  distinct?: string;
}

/**
 * A stable, one-way pseudonymous id derived from a seed (the device key). It is
 * deliberately NOT the raw device key — that key is the cloud-save credential,
 * and it must never reach a third-party analytics backend. Two mixed 32-bit
 * FNV-style hashes give ~64 bits, stable per device, non-reversible.
 */
export function stableAnonId(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x85ebca77) >>> 0;
  }
  return 'd-' + h1.toString(36) + h2.toString(36);
}

export interface NetworkSinkOptions {
  /** Flush once this many events are queued. */
  batchSize?: number;
  /** Anonymous per-load session id. */
  session?: string;
  /** Stable pseudonymous device id (from stableAnonId) for cohort retention. */
  distinctId?: string;
  /** Transport seam (defaults to sendBeacon → fetch). Injectable for tests. */
  send?: (endpoint: string, batch: WireEvent[]) => void;
}

function defaultSend(endpoint: string, batch: WireEvent[]): void {
  const body = JSON.stringify({ events: batch });
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
      if (ok) return;
    }
    void fetch(endpoint, {
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Analytics must never break the game.
  }
}

/**
 * Build a sink that batches sanitized events to `endpoint`. Returns both the
 * sink function (pass to `setSink`) and a `flush()` for page-hide wiring.
 */
export function createNetworkSink(endpoint: string, opts: NetworkSinkOptions = {}) {
  const batchSize = opts.batchSize ?? 12;
  const session = opts.session ?? 's-' + Math.random().toString(36).slice(2, 10);
  const distinctId = opts.distinctId;
  const send = opts.send ?? defaultSend;
  let queue: WireEvent[] = [];

  const flush = (): void => {
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];
    send(endpoint, batch);
  };

  const sink = (ev: AnalyticsEvent): void => {
    const wire: WireEvent = { name: ev.name, props: stripHealthValues(ev.props), at: ev.at, session };
    if (distinctId) wire.distinct = distinctId; // omit the key entirely when unconfigured
    queue.push(wire);
    if (queue.length >= batchSize) flush();
  };

  return { sink, flush };
}
