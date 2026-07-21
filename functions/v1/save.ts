/**
 * Hearth cloud-save sync API (roadmap Phase B — "non-negotiable" before phone
 * testers: iOS evicts web storage after 7 quiet days). Served as a Pages
 * Function on the game's own domain, so there is no CORS story and no extra
 * deploy pipeline — every `wrangler pages deploy` ships site + API together.
 *
 * One envelope per device key, revision-gated writes:
 *   GET /v1/save  -> the caller's envelope        (404 if none yet)
 *   PUT /v1/save  -> store envelope if rev newer  (409 + current if stale)
 *
 * Auth is an anonymous bearer device key the client generates once and keeps
 * in localStorage — the key IS the account for the test fleet; real accounts
 * later become a login that returns the same key. No personal data lives
 * here: the payload is the player's own export JSON (game state only, never
 * health data — Apple 5.1.3 stays easy to honour).
 *
 * Conflict policy mirrors src/platform/sync-provider.ts resolveSync(): the
 * server refuses only STALE writes (rev <= stored); who-wins reconciliation
 * happens client-side at launch, where the player can be asked.
 */

export interface SyncEnvelope {
  rev: number;
  updatedAt: number;
  save: string;
}

/** Structural slice of the D1 API we use — lets tests run on a plain fake. */
export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      first<T = unknown>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
}

interface Env {
  DB: D1Like;
}

/** Structural slice of the Pages Function context (no workers-types dep). */
interface Ctx {
  request: Request;
  env: Env;
}

const KEY_RE = /^[A-Za-z0-9_-]{16,80}$/;
const MAX_SAVE_BYTES = 131_072; // export JSON is a few KB today; 128KB is ample headroom

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Pull the bearer device key, or null when absent/malformed. */
export function deviceKeyFrom(auth: string | null): string | null {
  if (!auth?.startsWith('Bearer ')) return null;
  const key = auth.slice(7).trim();
  return KEY_RE.test(key) ? key : null;
}

/** Validate an incoming envelope; returns null when it isn't one. */
export function parseEnvelope(body: unknown): SyncEnvelope | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  if (typeof b.rev !== 'number' || !Number.isInteger(b.rev) || b.rev < 1) return null;
  if (typeof b.updatedAt !== 'number' || !Number.isFinite(b.updatedAt)) return null;
  if (typeof b.save !== 'string' || b.save.length === 0 || b.save.length > MAX_SAVE_BYTES) return null;
  return { rev: b.rev, updatedAt: b.updatedAt, save: b.save };
}

/**
 * The write gate, pure: accept strictly-newer revisions only. Equal or older
 * revs are stale (another device already wrote) — the client reconciles.
 */
export function acceptsWrite(stored: SyncEnvelope | null, incoming: SyncEnvelope): boolean {
  return !stored || incoming.rev > stored.rev;
}

interface SaveRow {
  rev: number;
  updated_at: number;
  save: string;
}

async function readEnvelope(db: D1Like, key: string): Promise<SyncEnvelope | null> {
  const row = await db
    .prepare('SELECT rev, updated_at, save FROM saves WHERE device_key = ?')
    .bind(key)
    .first<SaveRow>();
  return row ? { rev: row.rev, updatedAt: row.updated_at, save: row.save } : null;
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const key = deviceKeyFrom(ctx.request.headers.get('authorization'));
  if (!key) return json(401, { error: 'missing or malformed device key' });
  const stored = await readEnvelope(ctx.env.DB, key);
  return stored ? json(200, stored) : json(404, { error: 'no save yet' });
}

export async function onRequestPut(ctx: Ctx): Promise<Response> {
  const key = deviceKeyFrom(ctx.request.headers.get('authorization'));
  if (!key) return json(401, { error: 'missing or malformed device key' });

  let body: unknown;
  try {
    body = await ctx.request.json();
  } catch {
    return json(400, { error: 'invalid JSON' });
  }
  const incoming = parseEnvelope(body);
  if (!incoming) return json(400, { error: 'not a sync envelope' });

  // Fast path: report the common stale case with the current envelope so the
  // client can reconcile. (The read is advisory — the write below is the gate.)
  const stored = await readEnvelope(ctx.env.DB, key);
  if (!acceptsWrite(stored, incoming)) return json(409, stored);

  // The gate is the write itself: `WHERE excluded.rev > saves.rev` makes the
  // rev check atomic, so two concurrent PUTs can't both pass a prior read and
  // let the later (lower-rev) one clobber the newer save. RETURNING is null
  // when the guard rejects the update — i.e. we lost the race.
  const applied = await ctx.env.DB.prepare(
    'INSERT INTO saves (device_key, rev, updated_at, save) VALUES (?, ?, ?, ?) ' +
      'ON CONFLICT(device_key) DO UPDATE SET rev = excluded.rev, updated_at = excluded.updated_at, save = excluded.save ' +
      'WHERE excluded.rev > saves.rev ' +
      'RETURNING rev',
  )
    .bind(key, incoming.rev, incoming.updatedAt, incoming.save)
    .first<{ rev: number }>();

  if (!applied) {
    const current = await readEnvelope(ctx.env.DB, key); // a racing write won
    return json(409, current);
  }
  return json(200, { ok: true, rev: incoming.rev });
}
