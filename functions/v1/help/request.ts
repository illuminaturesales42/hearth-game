/**
 * POST /v1/help/request — ask a friend for a hand with your current task.
 *
 * This replaces the simulation, where "asking" fabricated items on your own
 * device and attributed them to a friend who had never been contacted. Now the
 * ask is a letter in THEIR mailbox; nothing arrives until they choose to answer
 * it (see help/fulfil).
 */
import {
  areFriends,
  CAPS,
  DAY_MS,
  isChain,
  isResponse,
  json,
  MAILBOX_RE,
  mailExists,
  PLAYER_RE,
  readJson,
  requirePlayer,
  sendMail,
  sentSince,
  sentToSince,
  unclaimedCount,
  type Ctx,
} from '../_lib';

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const now = Date.now();
  const me = await requirePlayer(ctx, now);
  if (isResponse(me)) return me;
  const db = ctx.env.DB;

  const body = await readJson(ctx.request);
  if (!body) return json(400, { error: 'invalid JSON' });
  const to = typeof body.to === 'string' ? body.to : '';
  const chain = body.chain;
  const clientKey = typeof body.clientKey === 'string' ? body.clientKey : '';

  if (!PLAYER_RE.test(to)) return json(422, { error: 'not a player id' });
  if (!isChain(chain)) return json(422, { error: 'unknown chain' });
  if (!MAILBOX_RE.test(clientKey)) return json(422, { error: 'missing clientKey' });
  if (to === me.player_id) return json(409, { error: 'you cannot ask yourself' });
  if (!(await areFriends(db, me.player_id, to))) return json(403, { error: 'not friends' });

  // Checked before the caps, for the same reason as gifts: a retry must not
  // be refused by the limit its own first attempt consumed.
  const id = `hr:${clientKey}`;
  if (await mailExists(db, id)) return json(200, { ok: true });

  const since = now - DAY_MS;
  if ((await sentSince(db, me.player_id, 'help_request', since)) >= CAPS.helpPerDay)
    return json(429, { error: 'you have asked enough of the village today', cap: CAPS.helpPerDay });
  if ((await sentToSince(db, me.player_id, to, 'help_request', since)) >= CAPS.helpPerPairPerDay)
    return json(429, { error: 'you have already asked them today' });
  if ((await unclaimedCount(db, to)) >= CAPS.inboxMax) return json(429, { error: 'their inbox is full' });

  await sendMail(db, {
    id,
    to,
    from: me.player_id,
    kind: 'help_request',
    payload: { kind: 'help_request', chain },
    now,
  });
  return json(200, { ok: true });
}
