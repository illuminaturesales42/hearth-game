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

/**
 * Ambient score: three synth layers that join as Emberhollow is restored
 * (stage 0 = lone warm pad; stage 2 adds a fifth; stage 4 adds a high shimmer).
 * Stands in for licensed stems post-MVP; same API either way.
 */
interface MusicLayer {
  gain: GainNode;
  target: number;
}
let music: { master: GainNode; layers: MusicLayer[] } | null = null;

function buildMusic(ac: AudioContext): void {
  const master = ac.createGain();
  master.gain.value = 0.0001;
  master.connect(ac.destination);
  const defs = [
    { freqs: [110, 110.7], type: 'sine' as OscillatorType, vol: 0.05 }, // hearth pad
    { freqs: [165, 165.5], type: 'sine' as OscillatorType, vol: 0.028 }, // fifth, joins at stage 2
    { freqs: [330, 331], type: 'triangle' as OscillatorType, vol: 0.012 }, // shimmer, stage 4
  ];
  const layers: MusicLayer[] = defs.map((d) => {
    const gain = ac.createGain();
    gain.gain.value = 0.0001;
    gain.connect(master);
    for (const f of d.freqs) {
      const osc = ac.createOscillator();
      osc.type = d.type;
      osc.frequency.value = f;
      osc.connect(gain);
      osc.start();
    }
    return { gain, target: d.vol };
  });
  // slow breath on the master so the pad never feels static
  const lfo = ac.createOscillator();
  const lfoGain = ac.createGain();
  lfo.frequency.value = 0.05;
  lfoGain.gain.value = 0.012;
  lfo.connect(lfoGain).connect(master.gain);
  lfo.start();
  music = { master, layers };
}

/**
 * Ambient stems: quiet looping layers keyed to the world's mood (see
 * core/stem-levels.ts for the pure derivation). Same conventions as the music
 * graph — sources start once, gains idle at 0.0001, levels move only by ramps.
 * calmPad sits at 220/329.6 Hz, deliberately clear of the meditation drone
 * (110/165.4) and the music pad layers (110/165), so nothing beats or clashes;
 * it is also ducked to silence while the drone itself plays.
 */
type StemName = 'calmPad' | 'rain' | 'chatter' | 'wind' | 'surf' | 'birds' | 'crickets' | 'frogs' | 'roofRain' | 'fireplace';
const STEM_NAMES: readonly StemName[] = [
  'calmPad',
  'rain',
  'chatter',
  'wind',
  'surf',
  'birds',
  'crickets',
  'frogs',
  'roofRain',
  'fireplace',
];
interface Stem {
  gain: GainNode;
  /** ceiling for this stem at level 1 (before musicVol) — deliberately quiet */
  target: number;
}
let stems: Record<StemName, Stem> | null = null;
/** last requested level per stem (0..1), so volume changes + drone ducking can re-apply */
const stemLevel: Record<StemName, number> = {
  calmPad: 0,
  rain: 0,
  chatter: 0,
  wind: 0,
  surf: 0,
  birds: 0,
  crickets: 0,
  frogs: 0,
  roofRain: 0,
  fireplace: 0,
};

function noiseBuffer(ac: AudioContext, seconds = 2): AudioBuffer {
  const buf = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function buildStems(ac: AudioContext): void {
  const make = (target: number): Stem => {
    const gain = ac.createGain();
    gain.gain.value = 0.0001;
    gain.connect(ac.destination);
    return { gain, target };
  };
  // calm pad — two soft sines a clear register above the drone/music cluster
  const calmPad = make(0.02);
  for (const f of [220, 329.6]) {
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = f;
    osc.connect(calmPad.gain);
    osc.start();
  }
  // rain — looped white noise through a warm lowpass (cosy, never hissy)
  const rain = make(0.03);
  const rainSrc = ac.createBufferSource();
  rainSrc.buffer = noiseBuffer(ac);
  rainSrc.loop = true;
  const rainLp = ac.createBiquadFilter();
  rainLp.type = 'lowpass';
  rainLp.frequency.value = 1200;
  rainSrc.connect(rainLp).connect(rain.gain);
  rainSrc.start();
  // chatter — faint band-passed shimmer with a slow swell, distant-bustle feel
  const chatter = make(0.012);
  const chSrc = ac.createBufferSource();
  chSrc.buffer = noiseBuffer(ac);
  chSrc.loop = true;
  const chBp = ac.createBiquadFilter();
  chBp.type = 'bandpass';
  chBp.frequency.value = 700;
  chBp.Q.value = 2.2;
  const chSwell = ac.createGain();
  chSwell.gain.value = 0.7;
  const chLfo = ac.createOscillator();
  const chLfoGain = ac.createGain();
  chLfo.frequency.value = 0.13;
  chLfoGain.gain.value = 0.3;
  chLfo.connect(chLfoGain).connect(chSwell.gain);
  chLfo.start();
  chSrc.connect(chBp).connect(chSwell).connect(chatter.gain);
  chSrc.start();
  // wind — airy band of noise with slow gusts (an LFO swelling the level)
  const wind = make(0.02);
  const wSrc = ac.createBufferSource();
  wSrc.buffer = noiseBuffer(ac);
  wSrc.loop = true;
  const wHp = ac.createBiquadFilter();
  wHp.type = 'highpass';
  wHp.frequency.value = 380;
  const wLp = ac.createBiquadFilter();
  wLp.type = 'lowpass';
  wLp.frequency.value = 1800;
  const wSwell = ac.createGain();
  wSwell.gain.value = 0.7;
  const wLfo = ac.createOscillator();
  const wLfoGain = ac.createGain();
  wLfo.frequency.value = 0.08; // long, slow gusts
  wLfoGain.gain.value = 0.35;
  wLfo.connect(wLfoGain).connect(wSwell.gain);
  wLfo.start();
  wSrc.connect(wHp).connect(wLp).connect(wSwell).connect(wind.gain);
  wSrc.start();
  // surf — deep, slow wave sets (low noise with a ~0.1Hz swell)
  const surf = make(0.026);
  const sSrc = ac.createBufferSource();
  sSrc.buffer = noiseBuffer(ac);
  sSrc.loop = true;
  const sLp = ac.createBiquadFilter();
  sLp.type = 'lowpass';
  sLp.frequency.value = 420;
  const sSwell = ac.createGain();
  sSwell.gain.value = 0.6;
  const sLfo = ac.createOscillator();
  const sLfoGain = ac.createGain();
  sLfo.frequency.value = 0.1; // wave rhythm
  sLfoGain.gain.value = 0.4;
  sLfo.connect(sLfoGain).connect(sSwell.gain);
  sLfo.start();
  sSrc.connect(sLp).connect(sSwell).connect(surf.gain);
  sSrc.start();
  // birds — a bright morning shimmer (high band of noise, quick warble)
  const birds = make(0.01);
  const bSrc = ac.createBufferSource();
  bSrc.buffer = noiseBuffer(ac);
  bSrc.loop = true;
  const bBp = ac.createBiquadFilter();
  bBp.type = 'bandpass';
  bBp.frequency.value = 3600;
  bBp.Q.value = 3;
  const bTrem = ac.createGain();
  bTrem.gain.value = 0.5;
  const bLfo = ac.createOscillator();
  const bLfoGain = ac.createGain();
  bLfo.frequency.value = 6; // chirpy warble
  bLfoGain.gain.value = 0.45;
  bLfo.connect(bLfoGain).connect(bTrem.gain);
  bLfo.start();
  bSrc.connect(bBp).connect(bTrem).connect(birds.gain);
  bSrc.start();
  // crickets — a fine high pulse, the night's quiet bed
  const crickets = make(0.009);
  const cSrc = ac.createBufferSource();
  cSrc.buffer = noiseBuffer(ac);
  cSrc.loop = true;
  const cBp = ac.createBiquadFilter();
  cBp.type = 'bandpass';
  cBp.frequency.value = 5200;
  cBp.Q.value = 6;
  const cTrem = ac.createGain();
  cTrem.gain.value = 0.5;
  const cLfo = ac.createOscillator();
  const cLfoGain = ac.createGain();
  cLfo.frequency.value = 11; // rapid cricket pulse
  cLfoGain.gain.value = 0.5;
  cLfo.connect(cLfoGain).connect(cTrem.gain);
  cLfo.start();
  cSrc.connect(cBp).connect(cTrem).connect(crickets.gain);
  cSrc.start();
  // frogs — a pulsed mid-band croak: band-passed noise gated by a slow, deep
  // tremolo so it reads as a chorus answering the wet ground, not a texture
  const frogs = make(0.012);
  const fSrc = ac.createBufferSource();
  fSrc.buffer = noiseBuffer(ac);
  fSrc.loop = true;
  const fBp = ac.createBiquadFilter();
  fBp.type = 'bandpass';
  fBp.frequency.value = 950;
  fBp.Q.value = 5;
  const fTrem = ac.createGain();
  fTrem.gain.value = 0.35;
  const fLfo = ac.createOscillator();
  const fLfoGain = ac.createGain();
  fLfo.frequency.value = 2.3; // croak grouping
  fLfoGain.gain.value = 0.6; // deep gating — near-silent between croaks
  fLfo.connect(fLfoGain).connect(fTrem.gain);
  fLfo.start();
  fSrc.connect(fBp).connect(fTrem).connect(frogs.gain);
  fSrc.start();
  // roof rain — a brighter, faster patter band layered over the low rain bed
  const roofRain = make(0.018);
  const rrSrc = ac.createBufferSource();
  rrSrc.buffer = noiseBuffer(ac);
  rrSrc.loop = true;
  const rrBp = ac.createBiquadFilter();
  rrBp.type = 'bandpass';
  rrBp.frequency.value = 2600;
  rrBp.Q.value = 1.4;
  const rrTrem = ac.createGain();
  rrTrem.gain.value = 0.65;
  const rrLfo = ac.createOscillator();
  const rrLfoGain = ac.createGain();
  rrLfo.frequency.value = 9; // busy drip rhythm
  rrLfoGain.gain.value = 0.3;
  rrLfo.connect(rrLfoGain).connect(rrTrem.gain);
  rrLfo.start();
  rrSrc.connect(rrBp).connect(rrTrem).connect(roofRain.gain);
  rrSrc.start();
  // fireplace — warm low crackle: lowpassed noise with a quick uneven flicker
  const fireplace = make(0.016);
  const fpSrc = ac.createBufferSource();
  fpSrc.buffer = noiseBuffer(ac);
  fpSrc.loop = true;
  const fpLp = ac.createBiquadFilter();
  fpLp.type = 'lowpass';
  fpLp.frequency.value = 520;
  const fpTrem = ac.createGain();
  fpTrem.gain.value = 0.5;
  const fpLfo = ac.createOscillator();
  const fpLfoGain = ac.createGain();
  fpLfo.frequency.value = 7.3; // flame flicker
  fpLfoGain.gain.value = 0.45;
  fpLfo.connect(fpLfoGain).connect(fpTrem.gain);
  fpLfo.start();
  fpSrc.connect(fpLp).connect(fpTrem).connect(fireplace.gain);
  fpSrc.start();
  stems = { calmPad, rain, chatter, wind, surf, birds, crickets, frogs, roofRain, fireplace };
}

/**
 * A soft, DISTANT thunder roll — a filtered noise burst that sweeps low and
 * decays, started a beat after the caller's lightning flash so it reads as far
 * off (cozy, never a sharp crack). No-op without an audio context or when muted.
 */
function rollThunder(): void {
  const ac = audio();
  if (!ac || muted) return;
  const t0 = ac.currentTime + 0.8 + Math.random() * 0.6; // distance delay
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 3);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(420, t0);
  lp.frequency.exponentialRampToValueAtTime(80, t0 + 1.8); // rumble settling low
  const g = ac.createGain();
  const peak = 0.05 * musicVol; // deliberately quiet
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t0 + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
  src.connect(lp).connect(g).connect(ac.destination);
  src.start(t0);
  src.stop(t0 + 2.6);
}

/**
 * The village bell marking the hour — two soft struck tones from across the
 * rooftops (Living Weather spec §7). Struck partials with a long decay, quiet
 * and distant; the caller owns the schedule (daytime hours only, never in a
 * storm). No-op without an audio context or when muted.
 */
function bellHour(): void {
  const ac = audio();
  if (!ac || muted) return;
  const strike = (at: number) => {
    // a bell is an inharmonic stack — hum, prime and a minor-third partial
    for (const [f, amp] of [
      [392, 1],
      [587, 0.45],
      [988, 0.2],
    ] as const) {
      const osc = ac.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f;
      const g = ac.createGain();
      const peak = 0.028 * amp * musicVol; // distant, never insistent
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 2.8);
      osc.connect(g).connect(ac.destination);
      osc.start(at);
      osc.stop(at + 3);
    }
  };
  const t0 = ac.currentTime + 0.05;
  strike(t0);
  strike(t0 + 1.4);
}

/** Ramp a stem's gain to its effective level (respects musicVol + drone ducking). */
function applyStem(name: StemName, rampSec: number): void {
  if (!stems || !ctx) return;
  // While the meditation drone plays, the calm pad steps aside entirely.
  const ducked = name === 'calmPad' && drone !== null;
  const level = ducked ? 0 : stemLevel[name];
  const s = stems[name];
  s.gain.gain.linearRampToValueAtTime(Math.max(0.0001, level * s.target * musicVol), ctx.currentTime + rampSec);
}

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
      if (music && ctx) music.master.gain.linearRampToValueAtTime(Math.max(0.0001, musicVol), ctx.currentTime + 0.3);
      // the settings slider updates live ambience too
      if (stems) STEM_NAMES.forEach((n) => applyStem(n, 0.3));
    }
  },
  /**
   * Set an ambient stem's level (0..1). Builds the stem graph lazily — needs an
   * existing AudioContext (i.e. after the first user gesture, same rule as
   * startMusic). Levels come from core/stem-levels.ts, keyed to the world mood.
   */
  setStem(name: StemName, level: number): void {
    stemLevel[name] = Math.max(0, Math.min(1, level));
    const ac = audio();
    if (!ac) return;
    if (!stems) buildStems(ac);
    applyStem(name, 2.5);
  },
  /** A soft distant thunder roll, phase-locked by the caller to a lightning flash. */
  thunder(): void {
    rollThunder();
  },
  /** The village bell marking the hour — the caller owns the schedule. */
  bell(): void {
    bellHour();
  },
  /** Fade every ambient stem out (leaving the map, etc.). Levels are forgotten. */
  stopStems(): void {
    STEM_NAMES.forEach((n) => {
      stemLevel[n] = 0;
      applyStem(n, 1.2);
    });
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
      applyStem('calmPad', 1); // the calm pad steps aside for the session drone
    } else if (drone && ac) {
      const d = drone;
      drone = null;
      d.gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.8);
      setTimeout(() => {
        d.osc1.stop();
        d.osc2.stop();
      }, 900);
      applyStem('calmPad', 3); // and eases back in afterwards
    }
  },
  /** Soft bell to mark a breath phase. */
  chime(freq = 528): void {
    tone(freq, 420, 'sine', 0.08);
  },
  /**
   * A rising pentatonic ladder for combo streaks — every step up the streak is
   * a step up the scale, so a run *sounds* like it's climbing. Steps past the
   * ladder's top loop the octave musically (never harsh). Always in key.
   */
  comboChime(step: number): void {
    // A-major pentatonic from A4 — warm, folk, in key with the ambient score
    const LADDER = [440, 494, 554, 659, 740, 880, 988, 1108];
    const i = Math.max(0, step);
    const f = LADDER[i % LADDER.length]! * (i >= LADDER.length ? 1 : 1);
    tone(f, 160, 'triangle', 0.12);
    tone(f * 2, 120, 'sine', 0.05, 30); // a soft octave shimmer on top
  },
  /** The tally tick — a tiny rising blip per counted step (pitch climbs outside). */
  tick(freq: number): void {
    tone(freq, 60, 'triangle', 0.07);
  },
  /** Start (idempotent) the ambient score at the given town stage. Needs a user gesture. */
  startMusic(stage: number): void {
    const ac = audio();
    if (!ac) return;
    if (!music) buildMusic(ac);
    this.setMusicStage(stage);
    music!.master.gain.linearRampToValueAtTime(Math.max(0.0001, musicVol), ac.currentTime + 4);
  },
  /** Crossfade layers as the village is restored (0, 2, 4 thresholds). */
  setMusicStage(stage: number): void {
    const ac = ctx;
    if (!music || !ac) return;
    const on = [true, stage >= 2, stage >= 4];
    music.layers.forEach((l, i) => {
      l.gain.gain.linearRampToValueAtTime(on[i] ? l.target : 0.0001, ac.currentTime + 3);
    });
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
