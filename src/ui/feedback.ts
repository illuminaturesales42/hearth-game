/**
 * Juice: synthesized SFX (WebAudio, no asset downloads) + haptics.
 * Haptics use Capacitor on device, navigator.vibrate on Android web,
 * and no-op elsewhere. All feedback respects a mute flag.
 */
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

let ctx: AudioContext | null = null;
let muted = false;
let sfxVol = 1;
let musicVol = 0.7;

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
  if (!ac || sfxVol <= 0) return;
  const t0 = ac.currentTime + delayMs / 1000;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gainPeak * sfxVol, t0 + 0.012);
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

let drone: { osc1: OscillatorNode; osc2: OscillatorNode; gain: GainNode } | null = null;

export const feedback = {
  setMuted(m: boolean): void {
    muted = m;
  },
  /** Volume prefs from Settings (0..1 each). Music covers ambient/drone layers. */
  setVolumes(v: { sfx?: number; music?: number }): void {
    if (typeof v.sfx === 'number') sfxVol = Math.max(0, Math.min(1, v.sfx));
    if (typeof v.music === 'number') {
      musicVol = Math.max(0, Math.min(1, v.music));
      if (drone) {
        const ac = audio();
        if (ac) drone.gain.gain.linearRampToValueAtTime(0.06 * musicVol, ac.currentTime + 0.3);
      }
    }
  },
  /** Soft low ambient pad for meditation sessions. Idempotent on/off. */
  ambient(on: boolean): void {
    const ac = audio();
    if (on) {
      if (drone || !ac) return;
      const gain = ac.createGain();
      gain.gain.setValueAtTime(0, ac.currentTime);
      gain.gain.linearRampToValueAtTime(0.06 * musicVol, ac.currentTime + 2);
      const osc1 = ac.createOscillator();
      const osc2 = ac.createOscillator();
      osc1.type = 'sine';
      osc2.type = 'sine';
      osc1.frequency.value = 110;
      osc2.frequency.value = 110 * 1.5 + 0.4; // gentle detune/beat
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ac.destination);
      osc1.start();
      osc2.start();
      drone = { osc1, osc2, gain };
    } else if (drone && ac) {
      const d = drone;
      drone = null;
      d.gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.8);
      setTimeout(() => {
        d.osc1.stop();
        d.osc2.stop();
      }, 900);
    }
  },
  /** Soft bell to mark a breath phase. */
  chime(freq = 528): void {
    tone(freq, 420, 'sine', 0.08);
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
