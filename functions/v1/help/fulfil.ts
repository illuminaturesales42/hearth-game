/**
 * POST /v1/help/fulfil — answer a friend's request for a hand.
 *
 * The requester named the chain when they asked, so the answer needs no input
 * beyond "yes": the server reads the original letter and mints CAPS.helpItems
 * level-0 items back to them. Costless to the giver, same as gifts.
 *
 * `hf:<requestMailboxId>` ties the reply to the request, so one ask can be
 * answered exactly once no matter how many times the button is pressed.
 */
import {
  CAPS,
  isChain,
  isResponse,
  json,
  MAILBOX_RE,
  readJson,
  requirePlayer,
  sendMail,
  unclaimedCount,
  type Ctx,
  type MailRow,
} from '../_lib';

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const now = Date.now();
  const me = await requirePlayer(ctx, now);
  if (isResponse(me)) return me;
  const db = ctx.env.DB;

  const body = await readJson(ctx.request);
  if (!body) return json(400, { error: 'invalid JSON' });
  const mailboxId = typeof body.mailboxId === 'string' ? body.mailboxId : '';
  if (!MAILBOX_RE.test(mailboxId)) return json(422, { error: 'not a mailbox id' });

  const row = await db.prepare('SELECT * FROM mailbox WHERE id = ?').bind(mailboxId).first<MailRow>();
  if (!row || row.kind !== 'help_request') return json(404, { error: 'no such request' });
  if (row.to_player !== me.player_id) return json(403, { error: 'not your letter' });

  let chain: unknown = null;
  try {
    chain = (JSON.parse(row.payload) as { chain?: unknown }).chain;
  } catch {
    chain = null;
  }
  if (!isChain(chain)) return json(422, { error: 'request has no usable chain' });

  if ((await unclaimedCount(db, row.from_player)) >= CAPS.inboxMax) return json(429, { error: 'their inbox is full' });

  await sendMail(db, {
    id: `hf:${row.id}`,
    to: row.from_player,
    from: me.player_id,
    kind: 'help_fulfil',
    payload: { kind: 'help_fulfil', chain, count: CAPS.helpItems },
    now,
  });

  // Mark the request answered so it leaves the helper's inbox. Not a grant, so
  // it uses the same claim column purely as "handled".
  await db
    .prepare(
      'UPDATE mailbox SET claimed_at = ? WHERE id = ? AND to_player = ? AND claimed_at IS NULL RETURNING payload',
    )
    .bind(now, row.id, me.player_id)
    .first<{ payload: string }>();

  return json(200, { ok: true });
}
