/**
 * SyncController — the launch reconcile that decides which village survives
 * when a player has two devices. The invariant under test everywhere: a local
 * save is NEVER overwritten unless start() returned 'adopted' or the player
 * explicitly chose adoptRemote(). (The "never silently wipe a village" pillar.)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { clearSave, exportSave, saveState } from '../src/core/save';
import { SyncController } from '../src/platform/sync-controller';
import { MemorySyncProvider } from '../src/platform/sync-provider';
import type { SyncEnvelope } from '../src/platform/sync-provider';

const T0 = new Date('2026-07-07T13:00:00').getTime();
const REV_KEY = 'hearth:sync-rev';
const BASE_KEY = 'hearth:sync-base';
const SAVE_KEY = 'hearth:save';

// vitest node env has no localStorage: provide a minimal in-memory shim.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

/** A valid exported save string with a recognisable coin balance. */
function makeSave(coins: number): string {
  clearSave(); // Game's constructor loads any existing save — start truly fresh
  const g = new Game(T0);
  if (coins > 0) g.finishDuel(true, [], coins); // banks coins (multiplier may add a little)
  saveState(g.snapshot);
  const s = exportSave();
  if (!s) throw new Error('exportSave returned null in test setup');
  return s;
}

function coinsOf(save: string | null): number {
  return save ? (JSON.parse(save) as { coins: number }).coins : -1;
}

const env = (rev: number, updatedAt: number, save: string): SyncEnvelope => ({ rev, updatedAt, save });

describe('SyncController.start() — the reconcile decision matrix', () => {
  it('no local, no remote → noop, nothing pushed or imported', async () => {
    const provider = new MemorySyncProvider();
    const g = new Game(T0);
    const c = new SyncController(g, provider, () => T0);
    const res = await c.start();
    expect(res.outcome).toBe('noop');
    expect(await provider.pull()).toBeNull(); // nothing seeded
  });

  it('remote exists, no local save → adopted (fresh device pulls the cloud village)', async () => {
    const remoteSave = makeSave(500);
    store.clear(); // wipe local so exportSave() is null, keeping the remote string
    const provider = new MemorySyncProvider(env(3, 100, remoteSave));
    const g = new Game(T0);
    // Game's constructor may have saved fresh state? It does not saveState — but be explicit:
    store.delete(SAVE_KEY);
    const c = new SyncController(g, provider, () => T0);
    const res = await c.start();
    expect(res.outcome).toBe('adopted');
    expect(coinsOf(exportSave())).toBe(coinsOf(remoteSave)); // local now IS the cloud save
    expect(store.get(REV_KEY)).toBe('3');
  });

  it('remote newer + local at baseline → adopted', async () => {
    makeSave(0); // local save on disk at rev 0 (baseline)
    const remoteSave = makeSave(500);
    // restore the local low-coin save as the on-disk one
    const localSave = makeSave(0);
    expect(coinsOf(localSave)).toBe(0);
    const provider = new MemorySyncProvider(env(7, 200, remoteSave));
    const g = new Game(T0);
    const c = new SyncController(g, provider, () => T0); // baseline = readRev() = 0
    const res = await c.start();
    expect(res.outcome).toBe('adopted');
    expect(coinsOf(exportSave())).toBe(coinsOf(remoteSave));
  });

  it('conflict is reachable at real launch: rev > persisted baseline, no post-construction mutation (regression)', async () => {
    // Reproduces the actual launch flow the old code got wrong: a device that
    // synced at rev 5, then made local edits (rev → 7) whose pushes never
    // reached the cloud, relaunches to find a newer remote. baselineRev is read
    // from the persisted BASE_KEY at construction — NOT bumped by the test after
    // construction — so localAdvanced (7 > 5) is genuinely true.
    const localSave = makeSave(0);
    const remoteSave = makeSave(500);
    store.set(SAVE_KEY, localSave);
    store.set(REV_KEY, '7'); // local advanced to rev 7
    store.set(BASE_KEY, '5'); // ...but last CONFIRMED cloud sync was rev 5
    const provider = new MemorySyncProvider(env(10, 300, remoteSave));
    const g = new Game(T0);
    const c = new SyncController(g, provider, () => T0); // baseline = readBase() = 5
    const res = await c.start(); // no artificial rev mutation here
    expect(res.outcome).toBe('conflict');
    expect(res.remote?.rev).toBe(10);
    expect(coinsOf(exportSave())).toBe(coinsOf(localSave)); // village untouched
  });

  it('a confirmed push advances the persisted baseline so a later equal remote is not a false conflict', async () => {
    // After pushNow succeeds, base === rev, so the next launch against the same
    // (now-remote) rev must NOT read as a conflict.
    makeSave(0);
    store.set(REV_KEY, '3');
    const provider = new MemorySyncProvider();
    const g = new Game(T0);
    const c = new SyncController(g, provider, () => T0);
    await c.pushNow(); // rev → 4, push ok → base 4
    expect(store.get(BASE_KEY)).toBe('4');
    // relaunch: remote is exactly what we pushed (rev 4), local unchanged (rev 4)
    const remote = await provider.pull();
    const c2 = new SyncController(g, provider, () => T0); // baseline = 4
    const res = await c2.start();
    expect(res.outcome).not.toBe('conflict');
    expect(remote?.rev).toBe(4);
  });

  it('remote newer + local ADVANCED since baseline → conflict, local untouched (the pillar case)', async () => {
    const localSave = makeSave(0);
    const remoteSave = makeSave(500);
    // put the local save back on disk and mark local rev as advanced past baseline
    store.set(SAVE_KEY, localSave);
    const provider = new MemorySyncProvider(env(10, 300, remoteSave));
    const g = new Game(T0);
    const c = new SyncController(g, provider, () => T0); // baseline = 0 at construction
    store.set(REV_KEY, '5'); // local progressed since last sync
    const res = await c.start();
    expect(res.outcome).toBe('conflict');
    expect(res.remote?.rev).toBe(10);
    // NOTHING was clobbered: the on-disk save is still the local one
    expect(coinsOf(exportSave())).toBe(coinsOf(localSave));
  });

  it('local newer than remote → pushed (cloud seeded from local)', async () => {
    const localSave = makeSave(300);
    store.set(REV_KEY, '9');
    const provider = new MemorySyncProvider(env(2, 50, makeSave(0)));
    store.set(SAVE_KEY, localSave); // ensure local save is the 300-coin one
    const g = new Game(T0);
    const c = new SyncController(g, provider, () => T0);
    const res = await c.start();
    expect(res.outcome).toBe('pushed');
    const cloud = await provider.pull();
    expect(coinsOf(cloud?.save ?? null)).toBe(coinsOf(localSave)); // cloud now holds local
    expect(coinsOf(exportSave())).toBe(coinsOf(localSave)); // local untouched
  });
});

describe('SyncController — explicit conflict answers + push', () => {
  it('adoptRemote imports the cloud save and adopts its rev', async () => {
    makeSave(0);
    const remoteSave = makeSave(750);
    store.set(SAVE_KEY, makeSave(0));
    const g = new Game(T0);
    const c = new SyncController(g, new MemorySyncProvider(), () => T0);
    const ok = await c.adoptRemote(env(12, 400, remoteSave));
    expect(ok).toBe(true);
    expect(coinsOf(exportSave())).toBe(coinsOf(remoteSave));
    expect(store.get(REV_KEY)).toBe('12');
  });

  it('adoptRemote refuses a corrupt remote save and leaves local intact', async () => {
    const localSave = makeSave(200);
    const g = new Game(T0);
    const c = new SyncController(g, new MemorySyncProvider(), () => T0);
    const ok = await c.adoptRemote(env(12, 400, '{"version":15}')); // fails the sanitizer
    expect(ok).toBe(false);
    expect(coinsOf(exportSave())).toBe(coinsOf(localSave));
    expect(store.get(REV_KEY)).toBeUndefined(); // rev not adopted either
  });

  it('keepLocal bumps the rev past BOTH sides and pushes local to the cloud', async () => {
    const remoteSave = makeSave(0); // build the remote string FIRST —
    const localSave = makeSave(400); // — the last makeSave is what's on disk
    store.set(REV_KEY, '4');
    const provider = new MemorySyncProvider();
    const g = new Game(T0);
    const c = new SyncController(g, provider, () => T0);
    const ok = await c.keepLocal(env(9, 500, remoteSave));
    expect(ok).toBe(true);
    // rev must clear the remote's 9 (server rejects non-strictly-newer writes)
    expect(Number(store.get(REV_KEY))).toBe(10);
    const cloud = await provider.pull();
    expect(cloud?.rev).toBe(10);
    expect(coinsOf(cloud?.save ?? null)).toBe(coinsOf(localSave));
  });

  it('pushNow increments the rev and ships the current save', async () => {
    const localSave = makeSave(100);
    store.set(REV_KEY, '6');
    const provider = new MemorySyncProvider();
    const g = new Game(T0);
    const c = new SyncController(g, provider, () => T0);
    await c.pushNow();
    expect(Number(store.get(REV_KEY))).toBe(7);
    const cloud = await provider.pull();
    expect(cloud?.rev).toBe(7);
    expect(coinsOf(cloud?.save ?? null)).toBe(coinsOf(localSave));
  });
});
