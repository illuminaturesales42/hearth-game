import { describe, expect, it } from 'vitest';
import { MemorySyncProvider, resolveSync } from '../src/platform/sync-provider';
import type { SyncEnvelope } from '../src/platform/sync-provider';

const env = (rev: number, updatedAt: number, save = '{}'): SyncEnvelope => ({ rev, updatedAt, save });

describe('resolveSync — who wins', () => {
  it('present side beats absent side', () => {
    expect(resolveSync(env(1, 100), null)).toBe('local');
    expect(resolveSync(null, env(1, 100))).toBe('remote');
    expect(resolveSync(null, null)).toBe('local');
  });

  it('higher revision wins', () => {
    expect(resolveSync(env(1, 999), env(2, 100))).toBe('remote');
    expect(resolveSync(env(3, 100), env(2, 999))).toBe('local');
  });

  it('equal revision falls back to later write', () => {
    expect(resolveSync(env(5, 100), env(5, 200))).toBe('remote');
    expect(resolveSync(env(5, 300), env(5, 200))).toBe('local');
  });

  it('fully identical is a no-op', () => {
    expect(resolveSync(env(5, 200), env(5, 200))).toBe('same');
  });
});

describe('MemorySyncProvider round-trip', () => {
  it('pull returns what was pushed', async () => {
    const p = new MemorySyncProvider();
    expect(await p.pull()).toBeNull();
    const e = env(1, 100, '{"version":12}');
    expect(await p.push(e)).toBe(true);
    expect(await p.pull()).toEqual(e);
  });

  it('later push overwrites', async () => {
    const p = new MemorySyncProvider(env(1, 100));
    await p.push(env(2, 200, '{"v":2}'));
    const got = await p.pull();
    expect(got?.rev).toBe(2);
  });
});
