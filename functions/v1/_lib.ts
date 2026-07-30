/**
 * Shared plumbing for the social endpoints: auth, validation, the caps table,
 * and small repository functions over D1. Underscore-prefixed so Pages treats
 * it as a module rather than a route.
 *
 * The design rule from docs/multiplayer-spec.md: energy is never mintable
 * client-side. Nothing of value moves without a `mailbox` row the SERVER wrote,
 * which the client then claims exactly once. Every mailbox id is a deterministic
 * idempotency key, so a retried request collides on the PRIMARY KEY instead of
 * granting twice.
 *
 * Rate limits count domain rows over a rolling 24h window rather than keeping
 * counters. At Hearth's scale (friend cap 20) these are single-digit-row index
 * scans, and rows-as-truth cannot drift out of step with what actually happened.
 * The window is rolling, not the client's 4am local day — timezone-proof.
 */

// ---------------------------------------------------------------- structural D1

/** Structural slice of the D1 API we use — lets tests run on a plain fake. */
export interface D1Stmt {
  bind(...values: unknown[]): D1Bound;
}
export interface D1Bound {
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface D1Like {
  prepare(sql: string): D1Stmt;
  /** D1 batches are transactional — used where a multi-row write must be atomic. */
  batch?(stmts: D1Bound[]): Promise<unknown>;
}

export interface Env {
  DB: D1Like;
}

/** Structural slice of the Pages Function context (no workers-types dep). */
export interface Ctx {
  request: Request;
  env: Env;
  params?: Record<string, string | string[]>;
}

// ---------------------------------------------------------------- constants

const KEY_RE = /^[A-Za-z0-9_-]{16,80}$/;
export const PLAYER_RE = /^p_[a-z2-7]{16}$/;
export const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;
export const MAILBOX_RE = /^[A-Za-z0-9_:.-]{1,120}$/;
export const DUEL_RE = /^d_[a-z2-7]{16}$/;

/** Max request body. Every social payload is tiny; this is pure abuse defence. */
export const MAX_BODY_BYTES = 4096;
export const DAY_MS = 86_400_000;

/**
 * Every server-enforced limit in one table. These are the *only* faucets in the
 * game, so they are worth reading as a set.
 */
export const CAPS = {
  /** Friends per player. Also the ceiling on how much mailbox a stranger can aim at you. */
  friends: 20,
  /** Open (unredeemed, unexpired) invites, and invites minted per rolling day. */
  invitesActive: 5,
  invitesPerDay: 10,
  inviteTtlMs: 7 * DAY_MS,
  /** The ONE energy grant in the system: paid to both sides, once per friendship. */
  joinBonusEnergy: 15,
  /** Gifts: free to send, capped on volume. Items only — never energy. */
  giftsPerDay: 5,
  giftsPerPairPerDay: 1,
  giftMaxLevel: 2,
  /** Asking a friend for a hand. */
  helpPerDay: 5,
  helpPerPairPerDay: 1,
  /** Items the server mints when a friend answers a help request. */
  helpItems: 2,
  /** Unclaimed mailbox entries a player can be holding before senders get a 429. */
  inboxMax: 50,
  /** Duels: one live challenge per pair keeps the fiction honest. */
  duelsOpenPerPair: 1,
  duelsOpenPerPlayer: 5,
  duelTtlMs: 3 * DAY_MS,
  /** Score sanity bounds. A 6x6 board yields at most 35 merges. */
  duelMaxScore: 1000,
  duelMaxMoves: 35,
  nameMaxLen: 24,
  portraitMaxLen: 64,
} as const;

/**
 * Chains the server will mint. Mirrors ChainId in src/core/types.ts; a test
 * asserts the two stay in step, because a drifted list would let a client ask
 * for an item the game cannot render.
 */
export const CHAIN_IDS = [
  'wood',
  'harvest',
  'hearthfire',
  'keepsake',
  'stone',
  'clay',
  'seeds',
  'flowers',
  'water',
  'copper',
  'fish',
  'seaweed',
  'honey',
  'herbs',
  'wool',
  'books',
  'music',
  'homestead',
  'greenhouse',
  'smithy',
  'apothecary',
] as const;

export type MailKind = 'gift' | 'help_request' | 'help_fulfil' | 'join_bonus' | 'duel_challenge' | 'duel_result';

// ---------------------------------------------------------------- helpers

export function json(status: number, body: unknown): Response {
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

/** Read + size-guard a JSON body. Returns undefined for absent/!valid JSON. */
export async function readJson(request: Request): Promise<Record<string, unknown> | undefined> {
  let text: string;
  try {
    text = await request.text();
  } catch {
    return undefined;
  }
  if (text.length === 0) return {};
  if (text.length > MAX_BODY_BYTES) return undefined;
  try {
    const body: unknown = JSON.parse(text);
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Base32 from real randomness — ids players may see. 16 characters is 80 bits,
 * which both PLAYER_RE and DUEL_RE expect: one byte in, one character out.
 */
export function mintId(prefix: string): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = '';
  for (const b of bytes) out += alphabet[b & 31]!;
  return `${prefix}${out}`;
}

/** 128 bits, base64url, no padding — an invite token that resists guessing. */
export function mintToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Seeds must be positive 31-bit — createDuel()'s LCG treats 0 as 1. */
export function mintSeed(): number {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return ((bytes[0] ?? 1) % 2_147_483_646) + 1;
}

/** Strip control characters and clamp — display names render on other players' screens. */
export function cleanName(raw: unknown, max: number = CAPS.nameMaxLen): string {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

export function isChain(v: unknown): boolean {
  return typeof v === 'string' && (CHAIN_IDS as readonly string[]).includes(v);
}

/** Friendships are stored with a < b so a pair has exactly one row. */
export function pairKey(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

/**
 * Share links are built from the request's own origin, so they are right on
 * hearth-5q8.pages.dev today and on any custom domain later without a code
 * change. (The old hard-coded hearth.game link pointed at a domain nobody owns.)
 */
export function inviteUrl(request: Request, token: string): string {
  return `${new URL(request.url).origin}/join/${token}`;
}

// ---------------------------------------------------------------- rows

export interface PlayerRow {
  player_id: string;
  device_key: string;
  name: string;
  portrait: string;
  created_at: number;
  last_seen: number;
}

export interface MailRow {
  id: string;
  to_player: string;
  from_player: string;
  kind: string;
  payload: string;
  created_at: number;
  claimed_at: number | null;
}

export interface DuelRow {
  duel_id: string;
  mode: string;
  seed: number;
  challenger: string;
  opponent: string;
  status: string;
  challenger_score: number | null;
  challenger_moves: number | null;
  opponent_score: number | null;
  opponent_moves: number | null;
  winner: string | null;
  created_at: number;
  expires_at: number;
  resolved_at: number | null;
}

// ---------------------------------------------------------------- repository

/** Bumping last_seen on every read would be a write per poll; 5 min is plenty. */
const LAST_SEEN_COALESCE_MS = 5 * 60_000;

export async function playerByDeviceKey(db: D1Like, key: string): Promise<PlayerRow | null> {
  return db
    .prepare('SELECT player_id, device_key, name, portrait, created_at, last_seen FROM players WHERE device_key = ?')
    .bind(key)
    .first<PlayerRow>();
}

export async function playerById(db: D1Like, id: string): Promise<PlayerRow | null> {
  return db
    .prepare('SELECT player_id, device_key, name, portrait, created_at, last_seen FROM players WHERE player_id = ?')
    .bind(id)
    .first<PlayerRow>();
}

/**
 * The gate every social endpoint opens with: a valid bearer key that maps to a
 * registered player. Returns the row, or a Response to hand straight back.
 */
export async function requirePlayer(ctx: Ctx, now = Date.now()): Promise<PlayerRow | Response> {
  const key = deviceKeyFrom(ctx.request.headers.get('authorization'));
  if (!key) return json(401, { error: 'missing or malformed device key' });
  const player = await playerByDeviceKey(ctx.env.DB, key);
  if (!player) return json(403, { error: 'unregistered player' });
  if (now - player.last_seen > LAST_SEEN_COALESCE_MS) {
    await ctx.env.DB.prepare('UPDATE players SET last_seen = ? WHERE player_id = ?').bind(now, player.player_id).run();
    player.last_seen = now;
  }
  return player;
}

export function isResponse(v: unknown): v is Response {
  return v instanceof Response;
}

export async function areFriends(db: D1Like, x: string, y: string): Promise<boolean> {
  const [a, b] = pairKey(x, y);
  const row = await db
    .prepare('SELECT 1 AS ok FROM friendships WHERE a = ? AND b = ?')
    .bind(a, b)
    .first<{ ok: number }>();
  return !!row;
}

export async function friendCount(db: D1Like, id: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM friendships WHERE a = ? OR b = ?')
    .bind(id, id)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Rolling-window count of mailbox rows this player has SENT of one kind. */
export async function sentSince(db: D1Like, from: string, kind: MailKind, since: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM mailbox WHERE from_player = ? AND kind = ? AND created_at > ?')
    .bind(from, kind, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/** Same, narrowed to one recipient — the per-pair limit. */
export async function sentToSince(
  db: D1Like,
  from: string,
  to: string,
  kind: MailKind,
  since: number,
): Promise<number> {
  const row = await db
    .prepare(
      'SELECT COUNT(*) AS n FROM mailbox WHERE from_player = ? AND to_player = ? AND kind = ? AND created_at > ?',
    )
    .bind(from, to, kind, since)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Has this exact letter already been written? Callers check BEFORE their rate
 * limits, because a retry of an accepted send must succeed rather than trip the
 * cap its own first attempt just consumed.
 */
export async function mailExists(db: D1Like, id: string): Promise<boolean> {
  const row = await db.prepare('SELECT * FROM mailbox WHERE id = ?').bind(id).first<{ id: string }>();
  return !!row;
}

export async function unclaimedCount(db: D1Like, to: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM mailbox WHERE to_player = ? AND claimed_at IS NULL')
    .bind(to)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/**
 * Write a mailbox row. `INSERT OR IGNORE` makes the deterministic id do the
 * de-duplication: a retried send is a silent no-op rather than a second grant.
 */
export function mailStmt(
  db: D1Like,
  row: { id: string; to: string; from: string; kind: MailKind; payload: unknown; now: number },
): D1Bound {
  return db
    .prepare(
      'INSERT OR IGNORE INTO mailbox (id, to_player, from_player, kind, payload, created_at, claimed_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, NULL)',
    )
    .bind(row.id, row.to, row.from, row.kind, JSON.stringify(row.payload), row.now);
}

export async function sendMail(
  db: D1Like,
  row: { id: string; to: string; from: string; kind: MailKind; payload: unknown; now: number },
): Promise<void> {
  await mailStmt(db, row).run();
}

/** Run several statements atomically where D1 supports it, else in order. */
export async function runBatch(db: D1Like, stmts: D1Bound[]): Promise<void> {
  if (db.batch) {
    await db.batch(stmts);
    return;
  }
  for (const s of stmts) await s.run();
}

// ---------------------------------------------------------------- duels

/**
 * Lazy expiry: rather than a cron, any read sweeps the caller's stale duels.
 * A duel where exactly one side played is a forfeit win for that side (they
 * showed up); a duel nobody played simply expires with no result mail.
 */
export async function resolveExpiredDuels(db: D1Like, playerId: string, now: number): Promise<void> {
  const { results } = await db
    .prepare('SELECT * FROM duels WHERE status = ? AND expires_at <= ? AND (challenger = ? OR opponent = ?)')
    .bind('open', now, playerId, playerId)
    .all<DuelRow>();
  for (const d of results) {
    const cPlayed = d.challenger_score !== null;
    const oPlayed = d.opponent_score !== null;
    if (cPlayed !== oPlayed) {
      const winner = cPlayed ? d.challenger : d.opponent;
      await finaliseDuel(db, d, winner, now);
    } else {
      await db
        .prepare('UPDATE duels SET status = ?, resolved_at = ? WHERE duel_id = ? AND status = ?')
        .bind('expired', now, d.duel_id, 'open')
        .run();
    }
  }
}

/**
 * Close a duel and post both result letters. The status guard makes this safe
 * to call from two racing requests: only one transition to 'resolved' lands,
 * and the mailbox ids (dr:<duel>:<player>) absorb any duplicate letters.
 */
export async function finaliseDuel(db: D1Like, d: DuelRow, winner: string | 'tie', now: number): Promise<DuelRow> {
  const applied = await db
    .prepare(
      'UPDATE duels SET status = ?, winner = ?, resolved_at = ? WHERE duel_id = ? AND status = ? RETURNING duel_id',
    )
    .bind('resolved', winner, now, d.duel_id, 'open')
    .first<{ duel_id: string }>();

  const cScore = d.challenger_score ?? 0;
  const oScore = d.opponent_score ?? 0;
  if (applied) {
    const letter = (to: string, mine: number, theirs: number) =>
      mailStmt(db, {
        id: `dr:${d.duel_id}:${to}`,
        to,
        from: to === d.challenger ? d.opponent : d.challenger,
        kind: 'duel_result',
        payload: {
          kind: 'duel_result',
          duelId: d.duel_id,
          won: winner !== 'tie' && winner === to,
          tie: winner === 'tie',
          yourScore: mine,
          theirScore: theirs,
        },
        now,
      });
    await runBatch(db, [letter(d.challenger, cScore, oScore), letter(d.opponent, oScore, cScore)]);
  }
  return { ...d, status: 'resolved', winner, resolved_at: now };
}

/** The client-facing duel shape: never leaks the opponent's score while open. */
export function duelView(d: DuelRow, me: string, opponentName: string) {
  const iAmChallenger = d.challenger === me;
  const myScore = iAmChallenger ? d.challenger_score : d.opponent_score;
  const theirScore = iAmChallenger ? d.opponent_score : d.challenger_score;
  const resolved = d.status === 'resolved';
  return {
    duelId: d.duel_id,
    mode: d.mode,
    seed: d.seed,
    opponentId: iAmChallenger ? d.opponent : d.challenger,
    opponentName,
    status: d.status,
    myScore: myScore ?? null,
    // Hidden until resolution — otherwise the second player can aim at a target.
    theirScore: resolved ? (theirScore ?? null) : null,
    winner: !resolved ? null : d.winner === 'tie' ? 'tie' : d.winner === me ? 'me' : 'them',
    expiresAt: d.expires_at,
  };
}
