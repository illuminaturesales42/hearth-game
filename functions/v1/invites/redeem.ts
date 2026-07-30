/**
 * POST /v1/invites/redeem — the moment two people actually become friends.
 *
 * This is the only place energy enters the game from the social system, and it
 * enters as two mailbox letters rather than a balance change: the server writes
 * `jb:<a>:<b>:<recipient>` for each side, and each client claims its own once.
 * Because the id is derived from the pair, re-redeeming, retrying, or even
 * un-friending and re-friending can never mint a second bonus.
 */
import {
  CAPS,
  friendCount,
  isResponse,
  json,
  mailStmt,
  pairKey,
  readJson,
  requirePlayer,
  runBatch,
  TOKEN_RE,
  type Ctx,
} from '../_lib';

interface InviteRow {
  token: string;
  from_player: string;
  created_at: number;
  expires_at: number;
  redeemed_by: string | null;
}

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const now = Date.now();
  const me = await requirePlayer(ctx, now);
  if (isResponse(me)) return me;
  const db = ctx.env.DB;

  const body = await readJson(ctx.request);
  if (!body) return json(400, { error: 'invalid JSON' });
  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (!TOKEN_RE.test(token)) return json(422, { error: 'not an invite token' });

  const invite = await db.prepare('SELECT * FROM invites WHERE token = ?').bind(token).first<InviteRow>();
  if (!invite) return json(404, { error: 'unknown invite' });
  if (invite.redeemed_by) return json(410, { error: 'invite already used' });
  if (invite.expires_at <= now) return json(410, { error: 'invite expired' });
  if (invite.from_player === me.player_id) return json(409, { error: 'that is your own invite' });

  const [a, b] = pairKey(invite.from_player, me.player_id);
  const already = await db
    .prepare('SELECT 1 AS ok FROM friendships WHERE a = ? AND b = ?')
    .bind(a, b)
    .first<{ ok: number }>();
  if (already) return json(409, { error: 'already friends' });

  if ((await friendCount(db, me.player_id)) >= CAPS.friends)
    return json(429, { error: 'your village is full', cap: CAPS.friends });
  if ((await friendCount(db, invite.from_player)) >= CAPS.friends)
    return json(429, { error: 'their village is full', cap: CAPS.friends });

  // Claim the token first and treat the guarded UPDATE as the race winner: if
  // two people open the same link at once, only one gets a row back.
  const claimed = await db
    .prepare(
      'UPDATE invites SET redeemed_by = ?, redeemed_at = ? WHERE token = ? AND redeemed_by IS NULL RETURNING token',
    )
    .bind(me.player_id, now, token)
    .first<{ token: string }>();
  if (!claimed) return json(410, { error: 'invite already used' });

  const bonus = (to: string, from: string) =>
    mailStmt(db, {
      id: `jb:${a}:${b}:${to}`,
      to,
      from,
      kind: 'join_bonus',
      payload: { kind: 'join_bonus', energy: CAPS.joinBonusEnergy },
      now,
    });

  await runBatch(db, [
    db
      .prepare('INSERT OR IGNORE INTO friendships (a, b, created_at, via_token) VALUES (?, ?, ?, ?)')
      .bind(a, b, now, token),
    bonus(me.player_id, invite.from_player),
    bonus(invite.from_player, me.player_id),
  ]);

  const them = await db
    .prepare('SELECT player_id, device_key, name, portrait, created_at, last_seen FROM players WHERE player_id = ?')
    .bind(invite.from_player)
    .first<{ player_id: string; name: string; portrait: string; last_seen: number }>();

  return json(200, {
    friend: them
      ? { playerId: them.player_id, name: them.name, portrait: them.portrait, lastSeen: them.last_seen }
      : null,
  });
}
