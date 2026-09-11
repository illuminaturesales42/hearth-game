/**
 * POST /v1/gifts — send a friend an item.
 *
 * Giving costs the sender nothing (the design decision: generosity should never
 * feel like a tax, and it keeps the fiction warm), so the abuse surface is
 * volume, not theft. That is handled by caps rather than by an inventory the
 * server cannot verify — the save blob is opaque to it, so "the sender really
 * owned this" would be a client assertion dressed up as a rule.
 *
 * The item is minted by the SERVER into the recipient's mailbox, never asserted
 * by the receiving client, and never energy.
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
} from './_lib';

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const now = Date.now();
  const me = await requirePlayer(ctx, now);
  if (isResponse(me)) return me;
  const db = ctx.env.DB;

  const body = await readJson(ctx.request);
  if (!body) return json(400, { error: 'invalid JSON' });
  const to = typeof body.to === 'string' ? body.to : '';
  const chain = body.chain;
  const level = typeof body.level === 'number' ? body.level : 0;
  const clientKey = typeof body.clientKey === 'string' ? body.clientKey : '';

  if (!PLAYER_RE.test(to)) return json(422, { error: 'not a player id' });
  if (!isChain(chain)) return json(422, { error: 'unknown chain' });
  if (!Number.isInteger(level) || level < 0 || level > CAPS.giftMaxLevel)
    return json(422, { error: `gifts are level 0-${CAPS.giftMaxLevel}` });
  if (!MAILBOX_RE.test(clientKey)) return json(422, { error: 'missing clientKey' });
  if (to === me.player_id) return json(409, { error: 'you cannot gift yourself' });
  if (!(await areFriends(db, me.player_id, to))) return json(403, { error: 'not friends' });

  // Idempotency is checked ahead of the caps: a retry of a send that already
  // landed must succeed, not trip the per-pair limit its own first attempt
  // consumed. `g:<clientKey>` makes the two indistinguishable to the caller.
  const id = `g:${clientKey}`;
  if (await mailExists(db, id)) return json(200, { ok: true });

  const since = now - DAY_MS;
  if ((await sentSince(db, me.player_id, 'gift', since)) >= CAPS.giftsPerDay)
    return json(429, { error: 'the gift pouch is empty for today', cap: CAPS.giftsPerDay });
  if ((await sentToSince(db, me.player_id, to, 'gift', since)) >= CAPS.giftsPerPairPerDay)
    return json(429, { error: 'you have already sent them something today' });
  if ((await unclaimedCount(db, to)) >= CAPS.inboxMax) return json(429, { error: 'their inbox is full' });

  // The PRIMARY KEY is the backstop for the race the check above cannot cover:
  // two simultaneous retries both pass mailExists, and only one INSERT lands.
  await sendMail(db, {
    id,
    to,
    from: me.player_id,
    kind: 'gift',
    payload: { kind: 'gift', chain, level },
    now,
  });
  return json(200, { ok: true });
}
