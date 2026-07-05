/**
 * Analytics facade. M1: console + in-memory buffer (inspect via
 * window.hearthEvents). M2: swap `sink` for Firebase Analytics.
 * Taxonomy lives in docs/analytics.md. HARD RULE: no health values are
 * ever sent, only the derived energy amounts.
 */

type Props = Record<string, string | number | boolean>;

export interface AnalyticsEvent {
  name: string;
  props: Props;
  at: number;
}

const buffer: AnalyticsEvent[] = [];

let sink: (ev: AnalyticsEvent) => void = (ev) => {
  if (import.meta.env.DEV) console.debug('[analytics]', ev.name, ev.props);
};

export function setSink(fn: (ev: AnalyticsEvent) => void): void {
  sink = fn;
}

export function track(name: string, props: Props = {}): void {
  const ev: AnalyticsEvent = { name, props, at: Date.now() };
  buffer.push(ev);
  if (buffer.length > 500) buffer.shift();
  sink(ev);
}

export function recentEvents(): readonly AnalyticsEvent[] {
  return buffer;
}
