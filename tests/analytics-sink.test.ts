import { describe, expect, it } from 'vitest';
import { createNetworkSink, stripHealthValues, type WireEvent } from '../src/platform/analytics-sink';
import type { AnalyticsEvent } from '../src/analytics';

describe('stripHealthValues', () => {
  it('drops raw health readings but keeps derived-energy + normal props', () => {
    const out = stripHealthValues({
      stepsToday: 8421, // raw — must be dropped
      sleepHoursLastNight: 7.5, // raw — must be dropped
      heartRate: 62, // raw — must be dropped
      fromSteps: 6, // derived energy — keep
      energy: 12, // keep
      chain: 'wood', // keep
    });
    expect(out).toEqual({ fromSteps: 6, energy: 12, chain: 'wood' });
    expect(out).not.toHaveProperty('stepsToday');
    expect(out).not.toHaveProperty('sleepHoursLastNight');
    expect(out).not.toHaveProperty('heartRate');
  });

  it('matches raw keys case-insensitively and drops non-primitive values', () => {
    const out = stripHealthValues({
      Steps: 100,
      SLEEP: 8,
      // @ts-expect-error — intentionally non-primitive to prove it is dropped
      obj: { a: 1 },
      ok: true,
    });
    expect(out).toEqual({ ok: true });
  });
});

describe('createNetworkSink', () => {
  const ev = (name: string, props: AnalyticsEvent['props'] = {}): AnalyticsEvent => ({ name, props, at: 1000 });

  it('batches events and sends sanitized payloads', () => {
    const sent: WireEvent[][] = [];
    const { sink } = createNetworkSink('/x', { batchSize: 2, session: 't', send: (_e, b) => sent.push(b) });
    sink(ev('merge', { chain: 'wood', stepsToday: 999 }));
    expect(sent).toHaveLength(0); // still batching
    sink(ev('spawn'));
    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(2);
    expect(sent[0]![0]).toEqual({ name: 'merge', props: { chain: 'wood' }, at: 1000, session: 't' });
  });

  it('flush() sends a partial batch and clears the queue', () => {
    const sent: WireEvent[][] = [];
    const { sink, flush } = createNetworkSink('/x', { batchSize: 10, session: 't', send: (_e, b) => sent.push(b) });
    sink(ev('session_start'));
    flush();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(1);
    flush(); // nothing queued — no empty send
    expect(sent).toHaveLength(1);
  });
});
