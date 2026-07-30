/**
 * POST /v1/mailbox/:id/claim — the grant gate.
 *
 * Everything of value in the social system passes through this one handler, and
 * it is a single conditional UPDATE: `WHERE claimed_at IS NULL` means the first
 * request wins and every later one gets `alreadyClaimed`. That is what lets the
 * client retry freely on a flaky connection without ever double-granting, and
 * it is why the client can be trusted with none of this logic.
 *
 * Returns 200 either way — a repeat claim is a successful no-op, not an error.
 */
import { isResponse, json, MAILBOX_RE, requirePlayer, type Ctx } from '../../_lib';

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const now = Date.now();
  const me = await requirePlayer(ctx, now);
  if (isResponse(me)) return me;

  const raw = ctx.params?.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  if (!id || !MAILBOX_RE.test(id)) return json(422, { error: 'not a mailbox id' });

  const claimed = await ctx.env.DB.prepare(
    'UPDATE mailbox SET claimed_at = ? WHERE id = ? AND to_player = ? AND claimed_at IS NULL RETURNING payload',
  )
    .bind(now, id, me.player_id)
    .first<{ payload: string }>();

  if (!claimed) {
    // Either it was already claimed, or it is not addressed to this player. Tell
    // those apart so a genuinely wrong id is still a 404.
    const exists = await ctx.env.DB.prepare('SELECT * FROM mailbox WHERE id = ?')
      .bind(id)
      .first<{ to_player: string }>();
    if (!exists || exists.to_player !== me.player_id) return json(404, { error: 'no such letter' });
    return json(200, { alreadyClaimed: true });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(claimed.payload);
  } catch {
    payload = null;
  }
  return json(200, { payload });
}
