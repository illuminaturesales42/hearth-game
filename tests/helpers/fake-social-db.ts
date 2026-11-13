/**
 * A multi-table fake D1 for the social endpoints, in the spirit of the one-row
 * fake in tests/cloud-sync.test.ts: it understands exactly the statements we
 * issue, and it enforces the two behaviours the handlers actually lean on —
 *
 *   - PRIMARY KEY collisions on INSERT OR IGNORE are silently dropped (this is
 *     what makes every grant idempotent, so a fake that ignored it would let
 *     broken code pass), and
 *   - conditional UPDATE ... RETURNING yields null when the guard rejects
 *     (the claim gate and the duel-resolve transition both depend on it).
 *
 * Matching is by statement shape rather than a SQL parser: each handler issues
 * a small, fixed set of queries, so a prefix/keyword match is precise enough to
 * be honest and simple enough to read.
 */
import type { D1Bound, D1Like } from '../../functions/v1/_lib';

export interface PlayerRec {
  player_id: string;
  device_key: string;
  name: string;
  portrait: string;
  created_at: number;
  last_seen: number;
}
export interface InviteRec {
  token: string;
  from_player: string;
  created_at: number;
  expires_at: number;
  redeemed_by: string | null;
  redeemed_at: number | null;
}
export interface FriendshipRec {
  a: string;
  b: string;
  created_at: number;
  via_token: string | null;
}
export interface MailRec {
  id: string;
  to_player: string;
  from_player: string;
  kind: string;
  payload: string;
  created_at: number;
  claimed_at: number | null;
}
export interface DuelRec {
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

export interface FakeState {
  players: PlayerRec[];
  invites: InviteRec[];
  friendships: FriendshipRec[];
  mailbox: MailRec[];
  duels: DuelRec[];
}

export function fakeSocialDb(seed: Partial<FakeState> = {}): { db: D1Like; state: FakeState } {
  const state: FakeState = {
    players: seed.players ?? [],
    invites: seed.invites ?? [],
    friendships: seed.friendships ?? [],
    mailbox: seed.mailbox ?? [],
    duels: seed.duels ?? [],
  };

  const exec = (sql: string, v: unknown[]): { rows: unknown[]; one: unknown } => {
    const s = sql.replace(/\s+/g, ' ').trim();
    const rows = run(state, s, v);
    return { rows, one: rows[0] ?? null };
  };

  const db: D1Like = {
    prepare(sql: string): { bind(...values: unknown[]): D1Bound } {
      return {
        bind(...values: unknown[]): D1Bound {
          return {
            async first<T>(): Promise<T | null> {
              return exec(sql, values).one as T | null;
            },
            async all<T>(): Promise<{ results: T[] }> {
              return { results: exec(sql, values).rows as T[] };
            },
            async run(): Promise<unknown> {
              exec(sql, values);
              return {};
            },
          };
        },
      };
    },
    async batch(stmts: D1Bound[]): Promise<unknown> {
      for (const s of stmts) await s.run();
      return {};
    },
  };

  return { db, state };
}

function run(st: FakeState, sql: string, v: unknown[]): unknown[] {
  // ---- players
  if (sql.startsWith('SELECT player_id, device_key') && sql.includes('WHERE device_key = ?'))
    return st.players.filter((p) => p.device_key === v[0]);
  if (sql.startsWith('SELECT player_id, device_key') && sql.includes('WHERE player_id = ?'))
    return st.players.filter((p) => p.player_id === v[0]);
  if (sql.startsWith('INSERT OR IGNORE INTO players')) {
    const [player_id, device_key, name, portrait, created_at, last_seen] = v as [
      string,
      string,
      string,
      string,
      number,
      number,
    ];
    // UNIQUE(device_key) as well as the PK — a second hello must not add a row.
    if (!st.players.some((p) => p.player_id === player_id || p.device_key === device_key))
      st.players.push({ player_id, device_key, name, portrait, created_at, last_seen });
    return [];
  }
  if (sql.startsWith('UPDATE players SET name')) {
    const p = st.players.find((x) => x.player_id === v[3]);
    if (p) Object.assign(p, { name: v[0], portrait: v[1], last_seen: v[2] });
    return [];
  }
  if (sql.startsWith('UPDATE players SET last_seen')) {
    const p = st.players.find((x) => x.player_id === v[1]);
    if (p) p.last_seen = v[0] as number;
    return [];
  }

  // ---- friendships
  if (sql.startsWith('SELECT p.player_id, p.name, p.portrait, p.last_seen FROM friendships')) {
    const me = v[0] as string;
    return st.friendships
      .filter((f) => f.a === me || f.b === me)
      .map((f) => st.players.find((p) => p.player_id === (f.a === me ? f.b : f.a)))
      .filter((p): p is PlayerRec => !!p)
      .map((p) => ({ player_id: p.player_id, name: p.name, portrait: p.portrait, last_seen: p.last_seen }))
      .sort((x, y) => y.last_seen - x.last_seen);
  }
  if (sql.startsWith('SELECT 1 AS ok FROM friendships'))
    return st.friendships.filter((f) => f.a === v[0] && f.b === v[1]).map(() => ({ ok: 1 }));
  if (sql.startsWith('SELECT COUNT(*) AS n FROM friendships'))
    return [{ n: st.friendships.filter((f) => f.a === v[0] || f.b === v[1]).length }];
  if (sql.startsWith('INSERT OR IGNORE INTO friendships')) {
    const [a, b, created_at, via_token] = v as [string, string, number, string | null];
    if (!st.friendships.some((f) => f.a === a && f.b === b)) st.friendships.push({ a, b, created_at, via_token });
    return [];
  }
  if (sql.startsWith('DELETE FROM friendships')) {
    const before = st.friendships.length;
    st.friendships = st.friendships.filter((f) => !(f.a === v[0] && f.b === v[1]));
    return before === st.friendships.length ? [] : [{ a: v[0] }];
  }

  // ---- invites
  if (sql.startsWith('SELECT token, expires_at FROM invites'))
    return st.invites
      .filter((i) => i.from_player === v[0] && i.redeemed_by === null && i.expires_at > (v[1] as number))
      .sort((x, y) => y.created_at - x.created_at)
      .slice(0, 1);
  if (sql.startsWith('SELECT COUNT(*) AS n FROM invites') && sql.includes('redeemed_by IS NULL'))
    return [
      {
        n: st.invites.filter((i) => i.from_player === v[0] && i.redeemed_by === null && i.expires_at > (v[1] as number))
          .length,
      },
    ];
  if (sql.startsWith('SELECT COUNT(*) AS n FROM invites'))
    return [{ n: st.invites.filter((i) => i.from_player === v[0] && i.created_at > (v[1] as number)).length }];
  if (sql.startsWith('SELECT * FROM invites')) return st.invites.filter((i) => i.token === v[0]);
  if (sql.startsWith('INSERT INTO invites')) {
    const [token, from_player, created_at, expires_at] = v as [string, string, number, number];
    st.invites.push({ token, from_player, created_at, expires_at, redeemed_by: null, redeemed_at: null });
    return [];
  }
  // The redemption gate: only the first claimant of a token gets a row back.
  if (sql.startsWith('UPDATE invites SET redeemed_by')) {
    const inv = st.invites.find((i) => i.token === v[2] && i.redeemed_by === null);
    if (!inv) return [];
    inv.redeemed_by = v[0] as string;
    inv.redeemed_at = v[1] as number;
    return [{ token: inv.token }];
  }

  // ---- mailbox
  if (sql.startsWith('SELECT id, to_player') && sql.includes('claimed_at IS NULL ORDER BY'))
    return st.mailbox
      .filter((m) => m.to_player === v[0] && m.claimed_at === null)
      .sort((x, y) => x.created_at - y.created_at);
  if (sql.startsWith('SELECT * FROM mailbox WHERE id = ?')) return st.mailbox.filter((m) => m.id === v[0]);
  if (sql.startsWith('SELECT COUNT(*) AS n FROM mailbox') && sql.includes('to_player = ? AND claimed_at IS NULL'))
    return [{ n: st.mailbox.filter((m) => m.to_player === v[0] && m.claimed_at === null).length }];
  if (sql.startsWith('SELECT COUNT(*) AS n FROM mailbox') && sql.includes('to_player = ? AND kind = ?'))
    return [
      {
        n: st.mailbox.filter(
          (m) => m.from_player === v[0] && m.to_player === v[1] && m.kind === v[2] && m.created_at > (v[3] as number),
        ).length,
      },
    ];
  if (sql.startsWith('SELECT COUNT(*) AS n FROM mailbox'))
    return [
      {
        n: st.mailbox.filter((m) => m.from_player === v[0] && m.kind === v[1] && m.created_at > (v[2] as number))
          .length,
      },
    ];
  if (sql.startsWith('INSERT OR IGNORE INTO mailbox')) {
    const [id, to_player, from_player, kind, payload, created_at] = v as [
      string,
      string,
      string,
      string,
      string,
      number,
    ];
    // The PK collision IS the idempotency guarantee — dropping it silently is
    // exactly what D1 does, and what every retry path here relies on.
    if (!st.mailbox.some((m) => m.id === id))
      st.mailbox.push({ id, to_player, from_player, kind, payload, created_at, claimed_at: null });
    return [];
  }
  // The grant gate: claim once, and only your own letter.
  if (sql.startsWith('UPDATE mailbox SET claimed_at')) {
    const m = st.mailbox.find((x) => x.id === v[1] && x.to_player === v[2] && x.claimed_at === null);
    if (!m) return [];
    m.claimed_at = v[0] as number;
    return [{ payload: m.payload, kind: m.kind, from_player: m.from_player }];
  }

  // ---- duels
  if (sql.startsWith('SELECT * FROM duels WHERE duel_id = ?')) return st.duels.filter((d) => d.duel_id === v[0]);
  if (sql.startsWith('SELECT * FROM duels WHERE status = ?'))
    return st.duels.filter(
      (d) => d.status === v[0] && d.expires_at <= (v[1] as number) && (d.challenger === v[2] || d.opponent === v[3]),
    );
  if (sql.startsWith('SELECT * FROM duels WHERE (challenger = ? OR opponent = ?)'))
    return st.duels
      .filter(
        (d) =>
          (d.challenger === v[0] || d.opponent === v[1]) &&
          (d.status === v[2] || (d.resolved_at ?? 0) > (v[3] as number)),
      )
      .sort((x, y) => y.created_at - x.created_at)
      .slice(0, 20);
  // Both duel counts bind status FIRST, so the player ids start at v[1].
  if (sql.startsWith('SELECT COUNT(*) AS n FROM duels') && sql.includes('challenger = ? AND opponent = ?'))
    return [
      {
        n: st.duels.filter(
          (d) =>
            d.status === v[0] &&
            ((d.challenger === v[1] && d.opponent === v[2]) || (d.challenger === v[3] && d.opponent === v[4])),
        ).length,
      },
    ];
  if (sql.startsWith('SELECT COUNT(*) AS n FROM duels'))
    return [{ n: st.duels.filter((d) => d.status === v[0] && (d.challenger === v[1] || d.opponent === v[2])).length }];
  if (sql.startsWith('INSERT INTO duels')) {
    const [duel_id, mode, seed, challenger, opponent, created_at, expires_at] = v as [
      string,
      string,
      number,
      string,
      string,
      number,
      number,
    ];
    st.duels.push({
      duel_id,
      mode,
      seed,
      challenger,
      opponent,
      status: 'open',
      challenger_score: null,
      challenger_moves: null,
      opponent_score: null,
      opponent_moves: null,
      winner: null,
      created_at,
      expires_at,
      resolved_at: null,
    });
    return [];
  }
  // Score writes are guarded on "not yet submitted" so a resend cannot change
  // a score; the handler turns the empty return into a same-value 200 or a 409.
  if (sql.startsWith('UPDATE duels SET challenger_score')) {
    const d = st.duels.find((x) => x.duel_id === v[2] && x.status === 'open' && x.challenger_score === null);
    if (!d) return [];
    d.challenger_score = v[0] as number;
    d.challenger_moves = v[1] as number;
    return [{ duel_id: d.duel_id }];
  }
  if (sql.startsWith('UPDATE duels SET opponent_score')) {
    const d = st.duels.find((x) => x.duel_id === v[2] && x.status === 'open' && x.opponent_score === null);
    if (!d) return [];
    d.opponent_score = v[0] as number;
    d.opponent_moves = v[1] as number;
    return [{ duel_id: d.duel_id }];
  }
  if (sql.startsWith('UPDATE duels SET status = ?, winner')) {
    const d = st.duels.find((x) => x.duel_id === v[3] && x.status === v[4]);
    if (!d) return [];
    d.status = v[0] as string;
    d.winner = v[1] as string;
    d.resolved_at = v[2] as number;
    return [{ duel_id: d.duel_id }];
  }
  if (sql.startsWith('UPDATE duels SET status = ?, resolved_at')) {
    const d = st.duels.find((x) => x.duel_id === v[2] && x.status === v[3]);
    if (!d) return [];
    d.status = v[0] as string;
    d.resolved_at = v[1] as number;
    return [{ duel_id: d.duel_id }];
  }

  throw new Error(`fake-social-db: unhandled SQL: ${sql}`);
}

/** Request builder for handler tests. */
export function socialReq(method: string, path: string, opts: { body?: unknown; key?: string | null } = {}): Request {
  const key = opts.key === undefined ? 'aaaaaaaa-bbbb-cccc-dddd-eeeeffff0000' : opts.key;
  return new Request(`https://hearth.test${path}`, {
    method,
    headers: key ? { authorization: `Bearer ${key}` } : {},
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

export function player(id: string, key: string, name = id): PlayerRec {
  return { player_id: id, device_key: key, name, portrait: 'c01', created_at: 1000, last_seen: 1000 };
}
