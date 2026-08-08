import { describe, expect, it } from 'vitest';
import { EnvironmentDamper, damp, dampAngleDeg, type DampedChannels } from '../src/core/environment-damper';

const zero: DampedChannels = {
  cloudCover: 0,
  windKph: 0,
  windDeg: 0,
  precip: 0,
  fog: 0,
  thunderRisk: 0,
  wetness: 0,
  snowDepth: 0,
};

describe('damp — exponential easing', () => {
  it('converges toward the target and never overshoots', () => {
    let v = 0;
    for (let i = 0; i < 300; i++) v = damp(v, 1, 12, 1);
    expect(v).toBeGreaterThan(0.999);
    expect(v).toBeLessThanOrEqual(1);
  });

  it('is frame-rate independent (one 10s step ≈ ten 1s steps)', () => {
    const big = damp(0, 1, 30, 10);
    let small = 0;
    for (let i = 0; i < 10; i++) small = damp(small, 1, 30, 1);
    expect(big).toBeCloseTo(small, 10);
  });

  it('τ ≤ 0 snaps; dt ≤ 0 holds', () => {
    expect(damp(0, 1, 0, 1)).toBe(1);
    expect(damp(0.4, 1, 30, 0)).toBe(0.4);
  });
});

describe('dampAngleDeg — shortest arc', () => {
  it('crosses 0° the short way (350° → 10° increases)', () => {
    const v = dampAngleDeg(350, 10, 30, 5);
    expect(v).toBeGreaterThan(350 - 360 + 0.01); // moved forward…
    const norm = ((v - 350 + 540) % 360) - 180;
    expect(norm).toBeGreaterThan(0); // …in the +20° direction, not −340°
    expect(norm).toBeLessThan(20);
  });

  it('stays normalized to [0, 360)', () => {
    let v = 355;
    for (let i = 0; i < 50; i++) v = dampAngleDeg(v, 15, 10, 1);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(360);
    // settles at the target
    expect(Math.min(Math.abs(v - 15), 360 - Math.abs(v - 15))).toBeLessThan(1);
  });
});

describe('EnvironmentDamper — weather breathes', () => {
  it('first advance adopts the target whole (no fade-up from a void)', () => {
    const d = new EnvironmentDamper();
    const out = d.advance({ ...zero, cloudCover: 0.8, precip: 0.5 }, 1);
    expect(out.cloudCover).toBe(0.8);
    expect(out.precip).toBe(0.5);
  });

  it('rain arrives faster than it leaves (asymmetric τ)', () => {
    const d = new EnvironmentDamper();
    d.advance(zero, 1);
    const arriving = d.advance({ ...zero, precip: 1 }, 5).precip; // τ=12 in
    const d2 = new EnvironmentDamper();
    d2.advance({ ...zero, precip: 1 }, 1);
    const leaving = 1 - d2.advance(zero, 5).precip; // τ=25 out
    expect(arriving).toBeGreaterThan(leaving);
  });

  it('thunder threat rises fast, relaxes slowly', () => {
    const d = new EnvironmentDamper();
    d.advance(zero, 1);
    const up = d.advance({ ...zero, thunderRisk: 1 }, 4).thunderRisk;
    expect(up).toBeGreaterThan(0.35); // τ=8 up: ~39% in 4s
    const d2 = new EnvironmentDamper();
    d2.advance({ ...zero, thunderRisk: 1 }, 1);
    const down = d2.advance(zero, 4).thunderRisk;
    expect(down).toBeGreaterThan(0.9); // τ=60 down: barely moved in 4s
  });

  it('cloud cover takes about a minute to swing', () => {
    const d = new EnvironmentDamper();
    d.advance(zero, 1);
    const after30 = d.advance({ ...zero, cloudCover: 1 }, 30).cloudCover;
    expect(after30).toBeGreaterThan(0.3);
    expect(after30).toBeLessThan(0.7); // τ=60 → ~39% at 30s
  });

  it('snap jumps every channel (reduce-motion / scrubber path)', () => {
    const d = new EnvironmentDamper();
    d.advance(zero, 1);
    const out = d.snap({ ...zero, fog: 1, windDeg: 270 });
    expect(out.fog).toBe(1);
    expect(out.windDeg).toBe(270);
    expect(d.value()?.fog).toBe(1);
  });

  it('returns copies — callers cannot mutate internal state', () => {
    const d = new EnvironmentDamper();
    const out = d.advance({ ...zero, fog: 0.5 }, 1);
    out.fog = 99;
    expect(d.value()?.fog).toBe(0.5);
  });
});
