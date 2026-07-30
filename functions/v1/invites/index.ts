/**
 * POST /v1/invites — mint a share link.
 *
 * Creating the invite is the inviter's consent; redeeming it is the other
 * side's (docs/multiplayer-spec.md F2 — both sides must agree). The token is
 * 128 bits of real randomness so a link cannot be guessed, expires after a
 * week, and is single-use.
 */
import { CAPS, inviteUrl, isResponse, json, mintToken, requirePlayer, type Ctx } from '../_lib';

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const now = Date.now();
  const me = await requirePlayer(ctx, now);
  if (isResponse(me)) return me;
  const db = ctx.env.DB;

  const active = await db
    .prepare('SELECT COUNT(*) AS n FROM invites WHERE from_player = ? AND redeemed_by IS NULL AND expires_at > ?')
    .bind(me.player_id, now)
    .first<{ n: number }>();
  if ((active?.n ?? 0) >= CAPS.invitesActive)
    return json(429, { error: 'too many open invites', cap: CAPS.invitesActive });

  const today = await db
    .prepare('SELECT COUNT(*) AS n FROM invites WHERE from_player = ? AND created_at > ?')
    .bind(me.player_id, now - 86_400_000)
    .first<{ n: number }>();
  if ((today?.n ?? 0) >= CAPS.invitesPerDay)
    return json(429, { error: 'invite limit reached for today', cap: CAPS.invitesPerDay });

  const token = mintToken();
  const expiresAt = now + CAPS.inviteTtlMs;
  await db
    .prepare('INSERT INTO invites (token, from_player, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(token, me.player_id, now, expiresAt)
    .run();

  // The URL is derived from the request origin, so it is correct on
  // hearth-5q8.pages.dev today and on any custom domain later with no code change.
  return json(200, { token, url: inviteUrl(ctx.request, token), expiresAt });
}
