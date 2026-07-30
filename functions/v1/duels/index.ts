/**
 * POST /v1/duels — challenge a friend to a Bonfire Duel.
 *
 * The async model: the server mints ONE seed, both players deal the identical
 * board from it with createDuel(seed), each plays it alone whenever they like,
 * and the higher score wins. No sockets, no presence, no both-online
 * requirement — which is the only shape that works for a game people open once
 * a day (docs/multiplayer-spec.md F4).
 *
 * `mode` is stored rather than assumed so a live variant can slot in behind the
 * same challenge/resolve plumbing later.
 */
import {
  areFriends,
  CAPS,
  duelView,
  isResponse,
  json,
  mintId,
  mintSeed,
  PLAYER_RE,
  playerById,
  readJson,
  requirePlayer,
  sendMail,
  type Ctx,
  type DuelRow,
} from '../_lib';

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const now = Date.now();
  const me = await requirePlayer(ctx, now);
  if (isResponse(me)) return me;
  const db = ctx.env.DB;

  const body = await readJson(ctx.request);
  if (!body) return json(400, { error: 'invalid JSON' });
  const opponent = typeof body.opponent === 'string' ? body.opponent : '';
  const mode = body.mode === 'async_score' || body.mode === undefined ? 'async_score' : '';
  if (!PLAYER_RE.test(opponent)) return json(422, { error: 'not a player id' });
  if (!mode) return json(422, { error: 'unknown duel mode' });
  if (opponent === me.player_id) return json(409, { error: 'you cannot duel yourself' });
  if (!(await areFriends(db, me.player_id, opponent))) return json(403, { error: 'not friends' });

  const pairOpen = await db
    .prepare(
      'SELECT COUNT(*) AS n FROM duels WHERE status = ? AND ((challenger = ? AND opponent = ?) OR (challenger = ? AND opponent = ?))',
    )
    .bind('open', me.player_id, opponent, opponent, me.player_id)
    .first<{ n: number }>();
  if ((pairOpen?.n ?? 0) >= CAPS.duelsOpenPerPair)
    return json(429, { error: 'you already have a duel going with them' });

  const mineOpen = await db
    .prepare('SELECT COUNT(*) AS n FROM duels WHERE status = ? AND (challenger = ? OR opponent = ?)')
    .bind('open', me.player_id, me.player_id)
    .first<{ n: number }>();
  if ((mineOpen?.n ?? 0) >= CAPS.duelsOpenPerPlayer)
    return json(429, { error: 'too many duels on the go', cap: CAPS.duelsOpenPerPlayer });

  const duelId = mintId('d_');
  const seed = mintSeed();
  const expiresAt = now + CAPS.duelTtlMs;
  await db
    .prepare(
      'INSERT INTO duels (duel_id, mode, seed, challenger, opponent, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(duelId, mode, seed, me.player_id, opponent, now, expiresAt)
    .run();

  // The challenge letter is how the opponent finds out — there is no push, so
  // it surfaces on their next snapshot poll.
  await sendMail(db, {
    id: `dc:${duelId}`,
    to: opponent,
    from: me.player_id,
    kind: 'duel_challenge',
    payload: { kind: 'duel_challenge', duelId },
    now,
  });

  const row = await db.prepare('SELECT * FROM duels WHERE duel_id = ?').bind(duelId).first<DuelRow>();
  const them = await playerById(db, opponent);
  return json(200, row ? duelView(row, me.player_id, them?.name ?? 'A villager') : { duelId });
}
