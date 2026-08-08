/**
 * The transition engine (Living Weather spec §4.2) — weather breathes, it never
 * snaps. Raw refreshes (weather every ~30 min, solar every ~60 s) set TARGETS;
 * this damper advances CURRENT values toward them with per-channel time
 * constants, so rain fades in over ~12 s, leaves over ~25 s, fog rolls over
 * ~90 s, and a returning tab eases rather than jumps.
 *
 * Pure + deterministic: `dt` is injected; no Date.now, no DOM. Exponential
 * damping is frame-rate independent: current += (target−current)·(1−e^(−dt/τ)).
 */

/** One exponential-damping step. τ ≤ 0 snaps to the target. */
export function damp(current: number, target: number, tauSec: number, dtSec: number): number {
  if (tauSec <= 0 || dtSec <= 0) return tauSec <= 0 ? target : current;
  return current + (target - current) * (1 - Math.exp(-dtSec / tauSec));
}

/** Damp an angle in degrees along the SHORTEST arc (350°→10° goes +20°, not −340°). */
export function dampAngleDeg(current: number, target: number, tauSec: number, dtSec: number): number {
  let delta = ((target - current) % 360) + 0;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const next = damp(0, delta, tauSec, dtSec) + current;
  return ((next % 360) + 360) % 360;
}

/** The channels the renderer/audio consume damped, with their targets. */
export interface DampedChannels {
  /** 0..1 cloud layer density */
  cloudCover: number;
  /** wind speed, kph */
  windKph: number;
  /** wind direction, meteorological degrees */
  windDeg: number;
  /** 0..1 precipitation intensity */
  precip: number;
  /** 0..1 fog/mist density */
  fog: number;
  /** 0..1 thunder likelihood */
  thunderRisk: number;
  /** 0..1 wet-ground sheen */
  wetness: number;
  /** 0..1 lying snow */
  snowDepth: number;
}

/** Per-channel time constants, seconds (spec §4.2 table). Asymmetric where the
 *  feel demands it: rain ARRIVES faster than it leaves (drips linger), thunder
 *  threat rises fast and relaxes slowly. */
const TAU = {
  cloudCover: 60,
  windKph: 30,
  windDeg: 30,
  precipIn: 12,
  precipOut: 25,
  fog: 90,
  thunderIn: 8,
  thunderOut: 60,
  ground: 120, // wetness/snow — the world dries slowly
} as const;

export class EnvironmentDamper {
  private state: DampedChannels | null = null;

  /** Advance toward `target` by `dtSec`. First call adopts the target whole. */
  advance(target: DampedChannels, dtSec: number): DampedChannels {
    const s = this.state;
    if (!s) {
      this.state = { ...target };
      return { ...target };
    }
    const next: DampedChannels = {
      cloudCover: damp(s.cloudCover, target.cloudCover, TAU.cloudCover, dtSec),
      windKph: damp(s.windKph, target.windKph, TAU.windKph, dtSec),
      windDeg: dampAngleDeg(s.windDeg, target.windDeg, TAU.windDeg, dtSec),
      precip: damp(s.precip, target.precip, target.precip > s.precip ? TAU.precipIn : TAU.precipOut, dtSec),
      fog: damp(s.fog, target.fog, TAU.fog, dtSec),
      thunderRisk: damp(
        s.thunderRisk,
        target.thunderRisk,
        target.thunderRisk > s.thunderRisk ? TAU.thunderIn : TAU.thunderOut,
        dtSec,
      ),
      wetness: damp(s.wetness, target.wetness, TAU.ground, dtSec),
      snowDepth: damp(s.snowDepth, target.snowDepth, TAU.ground, dtSec),
    };
    this.state = next;
    return { ...next };
  }

  /** Jump straight to the target — first frame, reduce-motion, or the scrubber. */
  snap(target: DampedChannels): DampedChannels {
    this.state = { ...target };
    return { ...target };
  }

  value(): DampedChannels | null {
    return this.state ? { ...this.state } : null;
  }
}
