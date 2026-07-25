/**
 * Cloud-save sync, both halves:
 *  - the /v1/save Pages Function (auth, validation, revision-gated writes)
 *    exercised against a fake D1
 *  - the client HttpSyncProvider (never throws; degrades to null/false)
 */
import { describe, expect, it } from 'vitest';
import { acceptsWrite, deviceKeyFrom, onRequestGet, onRequestPut, parseEnvelope } from '../functions/v1/save';
import type { D1Like, SyncEnvelope } from '../functions/v1/save';
import { HttpSyncProvider } from '../src/platform/sync-provider';

const KEY = 'aaaaaaaa-bbbb-cccc-dddd-eeeeffff0000';
const env = (rev: number, save = '{"v":1}'): SyncEnvelope => ({ rev, updatedAt: rev * 1000, save });

/** A one-row fake D1 that understands exactly the statements we issue. The
 *  INSERT is an atomic conditional upsert (`... WHERE excluded.rev > saves.rev
 *  RETURNING rev`), so the fake applies it only when the incoming rev wins and
 *  returns the applied rev (or null) — mirroring D1/SQLite. */
function fakeDb(seed: { rev: number; updated_at: number; save: string } | null = null) {
  const state = { row: seed };
  const upsert = (values: unknown[]): { rev: number } | null => {
    const rev = values[1] as number;
    if (state.row && rev <= state.row.rev) return null; // WHERE guard rejects
    state.row = { rev, updated_at: values[2] as number, save: values[3] as string };
    return { rev };
  };
  const db: D1Like = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>(): Promise<T | null> {
              return (sql.startsWith('INSERT') ? upsert(values) : state.row) as T | null;
            },
            async run(): Promise<unknown> {
              if (sql.startsWith('INSERT')) upsert(values);
              return {};
            },
          };
        },
      };
    },
  };
  return { db, state };
}

const req = (method: string, body?: unknown, auth: string | null = `Bearer ${KEY}`) =>
  new Request('https://hearth.test/v1/save', {
    method,
    headers: auth ? { authorization: auth } : {},
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

describe('save API — pure gates', () => {
  it('deviceKeyFrom accepts a UUID bearer and rejects junk', () => {
    expect(deviceKeyFrom(`Bearer ${KEY}`)).toBe(KEY);
    expect(deviceKeyFrom('Bearer short')).toBeNull();
    expect(deviceKeyFrom('Basic abc')).toBeNull();
    expect(deviceKeyFrom(null)).toBeNull();
    expect(deviceKeyFrom('Bearer ../../etc/passwd')).toBeNull();
  });

  it('parseEnvelope validates shape and bounds', () => {
    expect(parseEnvelope(env(3))).toEqual(env(3));
    expect(parseEnvelope({ rev: 0, updatedAt: 1, save: 'x' })).toBeNull();
    expect(parseEnvelope({ rev: 1.5, updatedAt: 1, save: 'x' })).toBeNull();
    expect(parseEnvelope({ rev: 1, updatedAt: 1, save: '' })).toBeNull();
    expect(parseEnvelope({ rev: 1, updatedAt: 1, save: 'x'.repeat(300_001) })).toBeNull();
    expect(parseEnvelope('nope')).toBeNull();
  });

  it('acceptsWrite takes only strictly newer revisions', () => {
    expect(acceptsWrite(null, env(1))).toBe(true);
    expect(acceptsWrite(env(2), env(3))).toBe(true);
    expect(acceptsWrite(env(3), env(3))).toBe(false);
    expect(acceptsWrite(env(4), env(3))).toBe(false);
  });
});

describe('save API — request handlers', () => {
  it('GET without auth is 401; with no row is 404; with a row returns it', async () => {
    const { db, state } = fakeDb();
    expect((await onRequestGet({ request: req('GET', undefined, null), env: { DB: db } })).status).toBe(401);
    expect((await onRequestGet({ request: req('GET'), env: { DB: db } })).status).toBe(404);
    state.row = { rev: 5, updated_at: 5000, save: '{"v":5}' };
    const res = await onRequestGet({ request: req('GET'), env: { DB: db } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rev: 5, updatedAt: 5000, save: '{"v":5}' });
  });

  it('PUT stores a first save, then refuses stale revisions with 409 + current', async () => {
    const { db, state } = fakeDb();
    const first = await onRequestPut({ request: req('PUT', env(1)), env: { DB: db } });
    expect(first.status).toBe(200);
    expect(state.row?.rev).toBe(1);

    const newer = await onRequestPut({ request: req('PUT', env(4)), env: { DB: db } });
    expect(newer.status).toBe(200);
    expect(state.row?.rev).toBe(4);

    const stale = await onRequestPut({ request: req('PUT', env(3)), env: { DB: db } });
    expect(stale.status).toBe(409);
    expect(((await stale.json()) as SyncEnvelope).rev).toBe(4);
    expect(state.row?.rev).toBe(4); // untouched
  });

  it('the write guard rejects a stale rev even if the pre-read was optimistic (TOCTOU)', async () => {
    // Race: the SELECT sees rev 4, but the row actually advanced to rev 10 by
    // the time the conditional INSERT runs. Our rev-5 write passes the
    // acceptsWrite pre-check yet must still be rejected by the atomic WHERE.
    const raced = { rev: 10 };
    const db: D1Like = {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          async first<T>(): Promise<T | null> {
            if (sql.startsWith('INSERT')) {
              const rev = values[1] as number;
              return (rev > raced.rev ? { rev } : null) as T | null; // WHERE excluded.rev > saves.rev
            }
            return { rev: 4, updated_at: 4000, save: '{"v":4}' } as T | null; // the optimistic read
          },
          async run(): Promise<unknown> {
            return {};
          },
        }),
      }),
    };
    const res = await onRequestPut({ request: req('PUT', env(5)), env: { DB: db } });
    expect(res.status).toBe(409); // the atomic guard caught the lost-race write
  });

  it('PUT rejects malformed bodies', async () => {
    const { db } = fakeDb();
    expect((await onRequestPut({ request: req('PUT', { nope: true }), env: { DB: db } })).status).toBe(400);
    const badJson = new Request('https://hearth.test/v1/save', {
      method: 'PUT',
      headers: { authorization: `Bearer ${KEY}` },
      body: '{not json',
    });
    expect((await onRequestPut({ request: badJson, env: { DB: db } })).status).toBe(400);
  });
});

describe('HttpSyncProvider — degrades, never throws', () => {
  const okJson = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('pull returns the envelope on 200 and null on 404 / bad shape / network error', async () => {
    const good = new HttpSyncProvider('', KEY, async () => okJson(env(7)));
    expect(await good.pull()).toEqual(env(7));

    const missing = new HttpSyncProvider('', KEY, async () => okJson({ error: 'no save yet' }, 404));
    expect(await missing.pull()).toBeNull();

    const malformed = new HttpSyncProvider('', KEY, async () => okJson({ rev: 'x' }));
    expect(await malformed.pull()).toBeNull();

    const down = new HttpSyncProvider('', KEY, async () => {
      throw new Error('offline');
    });
    expect(await down.pull()).toBeNull();
  });

  it('push reports ok on 200, false on 409 and on network error', async () => {
    const calls: { url: string; method?: string; auth?: string }[] = [];
    const good = new HttpSyncProvider('https://x', KEY, async (input, init) => {
      calls.push({
        url: String(input),
        ...(init?.method !== undefined ? { method: init.method } : {}),
        ...(init?.headers ? { auth: (init.headers as Record<string, string>).authorization } : {}),
      });
      return okJson({ ok: true });
    });
    expect(await good.push(env(2))).toBe(true);
    expect(calls[0]).toEqual({ url: 'https://x/v1/save', method: 'PUT', auth: `Bearer ${KEY}` });

    const stale = new HttpSyncProvider('', KEY, async () => okJson(env(9), 409));
    expect(await stale.push(env(2))).toBe(false);

    const down = new HttpSyncProvider('', KEY, async () => {
      throw new Error('offline');
    });
    expect(await down.push(env(2))).toBe(false);
  });
});
