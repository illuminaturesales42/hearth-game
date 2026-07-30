/**
 * GET /v1/duels/:id — poll one duel.
 *
 * The results screen uses this to refresh a single challenge without pulling
 * the whole social snapshot. Expiry is swept first, so opening a duel whose
 * deadline passed while the app was closed settles it there and then.
 */
import {
  duelView,
  DUEL_RE,
  isResponse,
  json,
  playerById,
  requirePlayer,
  resolveExpiredDuels,
  type Ctx,
  type DuelRow,
} from '../../_lib';

export async function onRequestGet(ctx: Ctx): Promise<Response> {
  const now = Date.now();
  const me = await requirePlayer(ctx, now);
  if (isResponse(me)) return me;
  const db = ctx.env.DB;

  const raw = ctx.params?.id;
  const duelId = Array.isArray(raw) ? raw[0] : raw;
  if (!duelId || !DUEL_RE.test(duelId)) return json(422, { error: 'not a duel id' });

  await resolveExpiredDuels(db, me.player_id, now);

  const duel = await db.prepare('SELECT * FROM duels WHERE duel_id = ?').bind(duelId).first<DuelRow>();
  if (!duel) return json(404, { error: 'no such duel' });
  const iAmChallenger = duel.challenger === me.player_id;
  if (!iAmChallenger && duel.opponent !== me.player_id) return json(403, { error: 'not your duel' });

  const them = await playerById(db, iAmChallenger ? duel.opponent : duel.challenger);
  return json(200, duelView(duel, me.player_id, them?.name ?? 'A villager'));
}
