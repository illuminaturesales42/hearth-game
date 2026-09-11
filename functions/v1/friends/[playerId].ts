/**
 * DELETE /v1/friends/:playerId — remove a friend.
 *
 * One row means one friendship, so a single delete severs it in both
 * directions; there is no half-friend state to reconcile. Unclaimed letters
 * from the removed friend are deliberately left alone — a gift already sent
 * was a real act of kindness, and quietly deleting it would be the ruder bug.
 */
import { isResponse, json, pairKey, PLAYER_RE, requirePlayer, type Ctx } from '../_lib';

export async function onRequestDelete(ctx: Ctx): Promise<Response> {
  const me = await requirePlayer(ctx);
  if (isResponse(me)) return me;

  const raw = ctx.params?.playerId;
  const other = Array.isArray(raw) ? raw[0] : raw;
  if (!other || !PLAYER_RE.test(other)) return json(422, { error: 'not a player id' });

  const [a, b] = pairKey(me.player_id, other);
  const gone = await ctx.env.DB.prepare('DELETE FROM friendships WHERE a = ? AND b = ? RETURNING a')
    .bind(a, b)
    .first<{ a: string }>();
  if (!gone) return json(404, { error: 'not friends' });
  return json(200, { ok: true });
}
