/**
 * Juice: synthesized SFX (WebAudio, no asset downloads) + haptics.
 * Haptics use Capacitor on device, navigator.vibrate on Android web,
 * and no-op elsewhere. All feedback respects a mute flag.
 */
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

let ctx: AudioContext | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, durMs: number, type: OscillatorType, gainPeak: number, delayMs = 0): void {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + delayMs / 1000;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gainPeak, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000 + 0.02);
}

async function impact(style: ImpactStyle): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) await Haptics.impact({ style });
    else if ('vibrate' in navigator) navigator.vibrate(style === ImpactStyle.Heavy ? 30 : 12);
  } catch {
    /* haptics are garnish, never an error */
  }
}

export const feedback = {
  setMuted(m: boolean): void {
    muted = m;
  },
  /** Merge pop: quick rising blip. The signature sound; keep it under 150ms. */
  merge(level: number): void {
    const base = 320 + level * 60;
    tone(base, 90, 'triangle', 0.18);
    tone(base * 1.5, 120, 'sine', 0.12, 40);
    void impact(ImpactStyle.Light);
  },
  spawn(): void {
    tone(240, 70, 'triangle', 0.1);
  },
  deliver(): void {
    tone(392, 110, 'sine', 0.16);
    tone(494, 110, 'sine', 0.16, 90);
    tone(587, 220, 'sine', 0.18, 180);
    void impact(ImpactStyle.Medium);
  },
  reject(): void {
    tone(140, 110, 'square', 0.05);
    void impact(ImpactStyle.Heavy);
  },
  chapter(): void {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 260, 'sine', 0.14, i * 120));
    void impact(ImpactStyle.Medium);
  },
};
