/**
 * POST /v1/player — "hello". Registers this device key as a player on first
 * call and refreshes the display name/portrait snapshot on every later one.
 *
 * The snapshot exists so a friend list can render faces without any cross-player
 * read of another save. Name and portrait are the ONLY things about a player
 * that another player ever sees (docs/multiplayer-spec.md F1) — no email, no
 * location, and never the device key, which stays a bearer secret.
 */
import { CAPS, cleanName, deviceKeyFrom, json, mintId, playerByDeviceKey, readJson, type Ctx } from './_lib';

export async function onRequestPost(ctx: Ctx): Promise<Response> {
  const key = deviceKeyFrom(ctx.request.headers.get('authorization'));
  if (!key) return json(401, { error: 'missing or malformed device key' });

  const body = await readJson(ctx.request);
  if (!body) return json(400, { error: 'invalid JSON' });
  const name = cleanName(body.name);
  const portrait = cleanName(body.portrait, CAPS.portraitMaxLen);
  const now = Date.now();

  const existing = await playerByDeviceKey(ctx.env.DB, key);
  if (existing) {
    await ctx.env.DB.prepare('UPDATE players SET name = ?, portrait = ?, last_seen = ? WHERE player_id = ?')
      .bind(name, portrait, now, existing.player_id)
      .run();
    return json(200, { playerId: existing.player_id, name, portrait });
  }

  // First contact. The UNIQUE index on device_key is the real guard: two
  // simultaneous hellos from one device race here, and the loser's INSERT is
  // ignored, so we re-read rather than trusting our own mint.
  const playerId = mintId('p_');
  await ctx.env.DB.prepare(
    'INSERT OR IGNORE INTO players (player_id, device_key, name, portrait, created_at, last_seen) ' +
      'VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(playerId, key, name, portrait, now, now)
    .run();

  const row = await playerByDeviceKey(ctx.env.DB, key);
  if (!row) return json(500, { error: 'could not register' });
  return json(200, { playerId: row.player_id, name: row.name, portrait: row.portrait });
}
