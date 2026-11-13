/**
 * GET /v1/social — the one read the client polls. Returns everything the
 * Villagers screen renders: friends (with the face + last-seen the spec allows),
 * the caller's live invite, unclaimed mailbox, and their duels.
 *
 * There are no sockets and no push (docs/multiplayer-spec.md F4): the client
 * calls this at launch, when the Villagers screen opens, after a mutating
 * action, and when the browser comes back online. That cadence is the whole
 * delivery mechanism, which suits a cosy game and costs nothing when idle.
 *
 * This handler also sweeps the caller's expired duels — lazy expiry instead of
 * a cron, so a duel nobody finishes still resolves the moment either player
 * looks at the game again.
 */
import {
  duelView,
  inviteUrl,
  isResponse,
  json,
  playerById,
  requirePlayer,
  resolveExpiredDuels,
  type Ctx,
  type DuelRow,
  type MailRow,
  type PlayerRow,
} from './_lib';

interface FriendRow {
  player_id: string;
  name: string;
  portrait: string;
  last_seen: number;
}

interface InviteRow {
  token: string;
  expires_at: number;
}

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const now = Date.now();
  const me = await requirePlayer(ctx, now);
  if (isResponse(me)) return me;
  const db = ctx.env.DB;

  await resolveExpiredDuels(db, me.player_id, now);

  // One join rather than a friendship read plus N player reads.
  const { results: friends } = await db
    .prepare(
      'SELECT p.player_id, p.name, p.portrait, p.last_seen FROM friendships f ' +
        'JOIN players p ON p.player_id = CASE WHEN f.a = ? THEN f.b ELSE f.a END ' +
        'WHERE f.a = ? OR f.b = ? ORDER BY p.last_seen DESC',
    )
    .bind(me.player_id, me.player_id, me.player_id)
    .all<FriendRow>();

  const invite = await db
    .prepare(
      'SELECT token, expires_at FROM invites WHERE from_player = ? AND redeemed_by IS NULL AND expires_at > ? ' +
        'ORDER BY created_at DESC LIMIT 1',
    )
    .bind(me.player_id, now)
    .first<InviteRow>();

  const { results: mail } = await db
    .prepare(
      'SELECT id, to_player, from_player, kind, payload, created_at, claimed_at FROM mailbox ' +
        'WHERE to_player = ? AND claimed_at IS NULL ORDER BY created_at ASC',
    )
    .bind(me.player_id)
    .all<MailRow>();

  // Open duels plus anything resolved recently enough that the player has not
  // seen the result card yet — the mailbox letter is the grant, this is the UI.
  const { results: duels } = await db
    .prepare(
      'SELECT * FROM duels WHERE (challenger = ? OR opponent = ?) AND (status = ? OR resolved_at > ?) ' +
        'ORDER BY created_at DESC LIMIT 20',
    )
    .bind(me.player_id, me.player_id, 'open', now - 7 * 86_400_000)
    .all<DuelRow>();

  const names = await nameLookup(ctx, me, friends, mail, duels);

  return json(200, {
    playerId: me.player_id,
    name: me.name,
    friends: friends.map((f) => ({
      playerId: f.player_id,
      name: f.name,
      portrait: f.portrait,
      lastSeen: f.last_seen,
    })),
    invite: invite
      ? { token: invite.token, url: inviteUrl(ctx.request, invite.token), expiresAt: invite.expires_at }
      : null,
    mailbox: mail.map((m) => ({
      id: m.id,
      from: m.from_player,
      fromName: names.get(m.from_player) ?? 'A villager',
      createdAt: m.created_at,
      payload: safeParse(m.payload),
    })),
    duels: duels.map((d) => {
      const other = d.challenger === me.player_id ? d.opponent : d.challenger;
      return duelView(d, me.player_id, names.get(other) ?? 'A villager');
    }),
    syncedAt: now,
  });
}

/**
 * Names for everyone referenced by the payload. Friends carry their own; a
 * mailbox sender or duel opponent may not be a friend any more (they can be
 * removed while a letter is still unclaimed), so those get looked up.
 */
async function nameLookup(
  ctx: Ctx,
  me: PlayerRow,
  friends: FriendRow[],
  mail: MailRow[],
  duels: DuelRow[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  for (const f of friends) names.set(f.player_id, f.name);
  const missing = new Set<string>();
  for (const m of mail) if (!names.has(m.from_player) && m.from_player !== me.player_id) missing.add(m.from_player);
  for (const d of duels) {
    const other = d.challenger === me.player_id ? d.opponent : d.challenger;
    if (!names.has(other)) missing.add(other);
  }
  for (const id of missing) {
    const row = await playerById(ctx.env.DB, id);
    if (row) names.set(id, row.name);
  }
  return names;
}

/** Payloads are server-written, but a corrupt row must not 500 the whole poll. */
function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
