/**
 * Social transport seam, mirroring sync-provider.ts.
 *
 * Two rules shape this file:
 *
 *  1. **Never throw.** Every method returns a SocialResult; a dead network is a
 *     value, not an exception. The village simply looks the way it did at the
 *     last successful poll, and play continues (spec F5 — the game must be
 *     fully playable offline).
 *  2. **Grant nothing.** The provider moves bytes. Energy and items arrive only
 *     as claimed mailbox letters, so there is no method here that could invent
 *     one even if it wanted to.
 */
import type { DuelChallenge, MailboxEntry, MailboxPayload, RemoteFriend } from '../core/types';
import type { SocialSnapshot } from '../core/social';
import { deviceKey } from './sync-provider';

export type SocialErr =
  /** Unreachable — no network, or the request never completed. */
  | 'offline'
  /** The device key is missing or unknown to the service. */
  | 'auth'
  /** The server rejected the shape of the request. */
  | 'invalid'
  /** A rate limit or a cap; the copy layer turns this into something warm. */
  | 'capped'
  /** Already done, or in conflict with something that already happened. */
  | 'conflict'
  /** Gone: an expired invite, a settled duel. */
  | 'expired'
  | 'server';

export type SocialResult<T> = { ok: true; value: T } | { ok: false; error: SocialErr };

export const ok = <T>(value: T): SocialResult<T> => ({ ok: true, value });
export const fail = <T>(error: SocialErr): SocialResult<T> => ({ ok: false, error });

export interface InviteInfo {
  token: string;
  url: string;
  expiresAt: number;
}

export interface SocialProvider {
  readonly name: string;
  /** Register or refresh this device's player record. Must precede everything else. */
  hello(profile: { name: string; portrait: string }): Promise<SocialResult<{ playerId: string }>>;
  snapshot(): Promise<SocialResult<SocialSnapshot>>;
  createInvite(): Promise<SocialResult<InviteInfo>>;
  redeemInvite(token: string): Promise<SocialResult<{ friend: RemoteFriend | null }>>;
  removeFriend(playerId: string): Promise<SocialResult<null>>;
  sendGift(to: string, chain: string, level: number, clientKey: string): Promise<SocialResult<null>>;
  requestHelp(to: string, chain: string, clientKey: string): Promise<SocialResult<null>>;
  fulfilHelp(mailboxId: string): Promise<SocialResult<null>>;
  claim(mailboxId: string): Promise<SocialResult<{ payload: MailboxPayload | null; alreadyClaimed: boolean }>>;
  createDuel(opponent: string): Promise<SocialResult<DuelChallenge>>;
  submitDuelScore(duelId: string, score: number, moves: number): Promise<SocialResult<DuelChallenge>>;
}

/** HTTP status → the error vocabulary above. */
function errFor(status: number): SocialErr {
  if (status === 401 || status === 403) return 'auth';
  if (status === 409) return 'conflict';
  if (status === 410) return 'expired';
  if (status === 422 || status === 400) return 'invalid';
  if (status === 429) return 'capped';
  return 'server';
}

/** A random idempotency key, so a retried send is recognised as the same send. */
export function clientKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k${Math.floor(Math.random() * 1e12).toString(36)}`;
  }
}

/**
 * The real service: the game's own /v1/* Pages Functions, same origin, keyed by
 * the same anonymous device key the cloud save already uses.
 */
export class HttpSocialProvider implements SocialProvider {
  readonly name = 'cloud';

  constructor(
    private base: string = '',
    private key: string = deviceKey(),
    private fetchFn: typeof fetch = (...a) => fetch(...a),
  ) {}

  private async call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<SocialResult<T>> {
    try {
      const res = await this.fetchFn(`${this.base}${path}`, {
        method: init.method ?? 'GET',
        headers: {
          authorization: `Bearer ${this.key}`,
          ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
        },
        ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
      });
      if (!res.ok) return fail(errFor(res.status));
      const body = (await res.json()) as T;
      return ok(body);
    } catch {
      return fail('offline');
    }
  }

  hello(profile: { name: string; portrait: string }): Promise<SocialResult<{ playerId: string }>> {
    return this.call('/v1/player', { method: 'POST', body: profile });
  }

  async snapshot(): Promise<SocialResult<SocialSnapshot>> {
    const res = await this.call<{
      playerId: string;
      friends: RemoteFriend[];
      inbox?: MailboxEntry[];
      mailbox?: MailboxEntry[];
      duels: DuelChallenge[];
      invite: InviteInfo | null;
      syncedAt: number;
    }>('/v1/social');
    if (!res.ok) return res;
    const v = res.value;
    if (typeof v.playerId !== 'string' || !Array.isArray(v.friends)) return fail('server');
    return ok({
      playerId: v.playerId,
      friends: v.friends,
      inbox: v.mailbox ?? v.inbox ?? [],
      duels: Array.isArray(v.duels) ? v.duels : [],
      invite: v.invite ? { url: v.invite.url, expiresAt: v.invite.expiresAt } : null,
      syncedAt: typeof v.syncedAt === 'number' ? v.syncedAt : Date.now(),
    });
  }

  createInvite(): Promise<SocialResult<InviteInfo>> {
    return this.call('/v1/invites', { method: 'POST', body: {} });
  }

  redeemInvite(token: string): Promise<SocialResult<{ friend: RemoteFriend | null }>> {
    return this.call('/v1/invites/redeem', { method: 'POST', body: { token } });
  }

  async removeFriend(playerId: string): Promise<SocialResult<null>> {
    const res = await this.call<unknown>(`/v1/friends/${encodeURIComponent(playerId)}`, {
      method: 'DELETE',
    });
    return res.ok ? ok(null) : res;
  }

  async sendGift(to: string, chain: string, level: number, key: string): Promise<SocialResult<null>> {
    const res = await this.call<unknown>('/v1/gifts', {
      method: 'POST',
      body: { to, chain, level, clientKey: key },
    });
    return res.ok ? ok(null) : res;
  }

  async requestHelp(to: string, chain: string, key: string): Promise<SocialResult<null>> {
    const res = await this.call<unknown>('/v1/help/request', {
      method: 'POST',
      body: { to, chain, clientKey: key },
    });
    return res.ok ? ok(null) : res;
  }

  async fulfilHelp(mailboxId: string): Promise<SocialResult<null>> {
    const res = await this.call<unknown>('/v1/help/fulfil', { method: 'POST', body: { mailboxId } });
    return res.ok ? ok(null) : res;
  }

  async claim(mailboxId: string): Promise<SocialResult<{ payload: MailboxPayload | null; alreadyClaimed: boolean }>> {
    const res = await this.call<{ payload?: MailboxPayload; alreadyClaimed?: boolean }>(
      `/v1/mailbox/${encodeURIComponent(mailboxId)}/claim`,
      { method: 'POST', body: {} },
    );
    if (!res.ok) return res;
    return ok({
      payload: res.value.payload ?? null,
      alreadyClaimed: res.value.alreadyClaimed === true,
    });
  }

  createDuel(opponent: string): Promise<SocialResult<DuelChallenge>> {
    return this.call('/v1/duels', { method: 'POST', body: { opponent, mode: 'async_score' } });
  }

  submitDuelScore(duelId: string, score: number, moves: number): Promise<SocialResult<DuelChallenge>> {
    return this.call(`/v1/duels/${encodeURIComponent(duelId)}/score`, {
      method: 'POST',
      body: { score, moves },
    });
  }
}
