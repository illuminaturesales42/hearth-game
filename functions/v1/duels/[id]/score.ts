/**
 * POST /v1/duels/:id/score — submit your run and resolve if both sides are in.
 *
 * The score is client-asserted. That is a deliberate, bounded trade: duels are
 * between two people who agreed to be friends, the stakes are coins only (never
 * energy, never items — see Game.applyDuelResult), the payout still passes the
 * shared 3-wins-a-day cap, and the value is range-checked against what a 6x6
 * board can actually produce. Verifying properly would mean replaying the whole
 * board server-side; that is the upgrade path, not today's cost.
 *
 * Writes are guarded on "not yet submitted", so a resend of the SAME score is a
 * successful no-op and a resend of a different one is a 409 rather than a quiet
 * overwrite.
 */
import {
  CAPS,
  duelView,
  DUEL_RE,
  finaliseDuel,
  isResponse,
  json,
  playerById,
  readJson,
  requirePlayer,
  type Ctx,
  type DuelRow,
} from '../../_lib';

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const now = Date.now();
  const me = await requirePlayer(ctx, now);
  if (isResponse(me)) return me;
  const db = ctx.env.DB;

  const raw = ctx.params?.id;
  const duelId = Array.isArray(raw) ? raw[0] : raw;
  if (!duelId || !DUEL_RE.test(duelId)) return json(422, { error: 'not a duel id' });

  const body = await readJson(ctx.request);
  if (!body) return json(400, { error: 'invalid JSON' });
  const score = typeof body.score === 'number' ? body.score : NaN;
  const moves = typeof body.moves === 'number' ? body.moves : NaN;
  if (!Number.isInteger(score) || score < 0 || score > CAPS.duelMaxScore)
    return json(422, { error: 'score out of range' });
  if (!Number.isInteger(moves) || moves < 0 || moves > CAPS.duelMaxMoves)
    return json(422, { error: 'moves out of range' });

  let duel = await db.prepare('SELECT * FROM duels WHERE duel_id = ?').bind(duelId).first<DuelRow>();
  if (!duel) return json(404, { error: 'no such duel' });
  const iAmChallenger = duel.challenger === me.player_id;
  if (!iAmChallenger && duel.opponent !== me.player_id) return json(403, { error: 'not your duel' });
  if (duel.status !== 'open') return json(410, { error: 'that duel is already settled' });
  if (duel.expires_at <= now) return json(410, { error: 'that duel has expired' });

  const mine = iAmChallenger ? duel.challenger_score : duel.opponent_score;
  if (mine !== null) {
    // Already submitted: identical resend is fine (the network may have eaten
    // our 200), a different number is not.
    if (mine === score) {
      const them = await playerById(db, iAmChallenger ? duel.opponent : duel.challenger);
      return json(200, duelView(duel, me.player_id, them?.name ?? 'A villager'));
    }
    return json(409, { error: 'you have already played this duel' });
  }

  const applied = await db
    .prepare(
      iAmChallenger
        ? 'UPDATE duels SET challenger_score = ?, challenger_moves = ? WHERE duel_id = ? AND status = ? AND challenger_score IS NULL RETURNING duel_id'
        : 'UPDATE duels SET opponent_score = ?, opponent_moves = ? WHERE duel_id = ? AND status = ? AND opponent_score IS NULL RETURNING duel_id',
    )
    .bind(score, moves, duelId, 'open')
    .first<{ duel_id: string }>();
  if (!applied) return json(409, { error: 'you have already played this duel' });

  duel = (await db.prepare('SELECT * FROM duels WHERE duel_id = ?').bind(duelId).first<DuelRow>()) ?? duel;

  if (duel.challenger_score !== null && duel.opponent_score !== null) {
    const c = duel.challenger_score;
    const o = duel.opponent_score;
    const winner = c === o ? 'tie' : c > o ? duel.challenger : duel.opponent;
    duel = await finaliseDuel(db, duel, winner, now);
  }

  const them = await playerById(db, iAmChallenger ? duel.opponent : duel.challenger);
  return json(200, duelView(duel, me.player_id, them?.name ?? 'A villager'));
}
