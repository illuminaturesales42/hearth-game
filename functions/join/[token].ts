/**
 * GET /join/<token> — the shareable invite link.
 *
 * It only redirects into the app with the token as a query parameter. Doing it
 * server-side means the link works for someone who has never opened Hearth (no
 * service worker, no SPA routing yet), and it gives us a place to attach an
 * Open Graph preview later. Redemption itself needs the recipient's device key,
 * so it happens from inside the app against /v1/invites/redeem — this route is
 * unauthenticated on purpose and grants nothing.
 */
interface Ctx {
  request: Request;
  params?: Record<string, string | string[]>;
}

const TOKEN_RE = /^[A-Za-z0-9_-]{22}$/;

export function onRequestGet(ctx: Ctx): Response {
  const raw = ctx.params?.token;
  const token = Array.isArray(raw) ? raw[0] : raw;
  const origin = new URL(ctx.request.url).origin;
  const target = token && TOKEN_RE.test(token) ? `${origin}/?join=${encodeURIComponent(token)}` : origin;
  return new Response(null, { status: 302, headers: { location: target } });
}
