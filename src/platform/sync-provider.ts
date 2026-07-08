/**
 * Cloud-save sync seam (roadmap Phase B — "non-negotiable" once phones are
 * in testers' hands: iOS evicts web storage after 7 quiet days).
 *
 * The game already produces a portable save string (exportSave/importSave);
 * that string IS the sync payload. This module defines the provider seam so
 * the native/account-backed implementation is a drop-in, plus two providers
 * usable today: a device-local mirror (proves the round-trip, survives a
 * localStorage key wipe) and an in-memory one for tests.
 *
 * Conflict policy lives in resolveSync() as a pure function so it can be
 * tested exhaustively — the hard part of any sync is who-wins, not transport.
 */

export interface SyncEnvelope {
  /** Monotonic revision; higher wins. */
  rev: number;
  /** epoch ms of the write; tiebreaker when revs collide across devices. */
  updatedAt: number;
  /** The exported save JSON. */
  save: string;
}

export interface SyncProvider {
  readonly name: string;
  /** Fetch the remote envelope, or null if none / unreachable. Never throws. */
  pull(): Promise<SyncEnvelope | null>;
  /** Store the envelope. Returns success; never throws. */
  push(env: SyncEnvelope): Promise<boolean>;
}

export type SyncWinner = 'local' | 'remote' | 'same';

/**
 * Decide which side wins. Higher rev wins; on equal rev the later write wins;
 * fully-equal is 'same' (no-op). A missing side loses to any present side.
 */
export function resolveSync(local: SyncEnvelope | null, remote: SyncEnvelope | null): SyncWinner {
  if (!remote) return 'local';
  if (!local) return 'remote';
  if (remote.rev > local.rev) return 'remote';
  if (remote.rev < local.rev) return 'local';
  if (remote.updatedAt > local.updatedAt) return 'remote';
  if (remote.updatedAt < local.updatedAt) return 'local';
  return 'same';
}

/** No cloud yet: mirror to a second localStorage key on the same device. */
export class LocalMirrorSyncProvider implements SyncProvider {
  readonly name = 'device-mirror';
  private static KEY = 'hearth:cloud-mirror';

  async pull(): Promise<SyncEnvelope | null> {
    try {
      const raw = localStorage.getItem(LocalMirrorSyncProvider.KEY);
      return raw ? (JSON.parse(raw) as SyncEnvelope) : null;
    } catch {
      return null;
    }
  }

  async push(env: SyncEnvelope): Promise<boolean> {
    try {
      localStorage.setItem(LocalMirrorSyncProvider.KEY, JSON.stringify(env));
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * The real cloud: the game's own /v1/save Pages Function (same origin), keyed
 * by an anonymous device key generated once and kept in localStorage. Never
 * throws — any network/HTTP failure degrades to "no cloud today" and the
 * SyncController simply reconciles on a later launch.
 */
export class HttpSyncProvider implements SyncProvider {
  readonly name = 'cloud';

  constructor(
    private base: string = '',
    private key: string = deviceKey(),
    private fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {}

  async pull(): Promise<SyncEnvelope | null> {
    try {
      const res = await this.fetchFn(`${this.base}/v1/save`, {
        headers: { authorization: `Bearer ${this.key}` },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as Partial<SyncEnvelope>;
      if (typeof body.rev !== 'number' || typeof body.updatedAt !== 'number' || typeof body.save !== 'string') return null;
      return { rev: body.rev, updatedAt: body.updatedAt, save: body.save };
    } catch {
      return null;
    }
  }

  async push(env: SyncEnvelope): Promise<boolean> {
    try {
      const res = await this.fetchFn(`${this.base}/v1/save`, {
        method: 'PUT',
        headers: { authorization: `Bearer ${this.key}`, 'content-type': 'application/json' },
        body: JSON.stringify(env),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

const DEVICE_KEY = 'hearth:device-key';

/** The anonymous key that IS the player's cloud slot; minted once per device. */
export function deviceKey(): string {
  try {
    const existing = localStorage.getItem(DEVICE_KEY);
    if (existing) return existing;
    const fresh = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    return 'ephemeral-no-storage-0000';
  }
}

/** In-memory provider for tests (and a template for the real HTTP one). */
export class MemorySyncProvider implements SyncProvider {
  readonly name = 'memory';
  private store: SyncEnvelope | null = null;
  constructor(seed: SyncEnvelope | null = null) {
    this.store = seed;
  }
  async pull(): Promise<SyncEnvelope | null> {
    return this.store;
  }
  async push(env: SyncEnvelope): Promise<boolean> {
    this.store = env;
    return true;
  }
}
