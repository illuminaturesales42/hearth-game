/**
 * An in-memory implementation of the social service, used for `pnpm dev`
 * (without wrangler) and as the integration-test rig.
 *
 * This deliberately replaces the old "local simulation": it does not invent
 * friends or mint anything unasked. It is a real, if tiny, SERVER — one world
 * object holding players, invites, friendships, a mailbox and duels, enforcing
 * the same caps and the same idempotency rules as the Pages Functions. Several
 * providers can attach to one world as different players, which is what lets a
 * test drive an honest two-player lifecycle: invite, redeem, gift, help,
 * challenge, resolve.
 *
 * A developer running `pnpm dev` therefore sees an empty village that behaves
 * correctly, rather than a populated one that lies.
 */
import type { ChainId, DuelChallenge, MailboxEntry, MailboxPayload, RemoteFriend } from '../core/types';
import type { SocialSnapshot } from '../core/social';
import { fail, ok, type InviteInfo, type SocialProvider, type SocialResult } from './social-provider';

const DAY = 86_400_000;
const CAPS = {
  friends: 20,
  invitesActive: 5,
  joinBonusEnergy: 15,
  giftsPerPairPerDay: 1,
  helpPerPairPerDay: 1,
  helpItems: 2,
  duelTtlMs: 3 * DAY,
};

interface Rec {
  players: Map<string, { playerId: string; name: string; portrait: string; lastSeen: number }>;
  invites: Map<string, { token: string; from: string; expiresAt: number; redeemedBy: string | null }>;
  friendships: Set<string>;
  mail: {
    id: string;
    to: string;
    from: string;
    kind: string;
    payload: MailboxPayload;
    createdAt: number;
    claimed: boolean;
  }[];
  duels: {
    duelId: string;
    seed: number;
    challenger: string;
    opponent: string;
    status: 'open' | 'resolved' | 'expired';
    cScore: number | null;
    oScore: number | null;
    winner: string | null;
    expiresAt: number;
  }[];
}

const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** The shared world. One per dev session; one per test. */
export class MemorySocialWorld {
  private db: Rec = {
    players: new Map(),
    invites: new Map(),
    friendships: new Set(),
    mail: [],
    duels: [],
  };
  private n = 0;
  /** Injected so tests can drive expiry without waiting. */
  now: () => number = () => Date.now();

  private id(prefix: string): string {
    this.n += 1;
    return `${prefix}${String(this.n).padStart(16, '0').replace(/0/g, 'a')}`;
  }

  register(key: string, profile: { name: string; portrait: string }): string {
    const existing = [...this.db.players.values()].find((p) => p.playerId === keyToId(key));
    const playerId = keyToId(key);
    if (!existing) this.db.players.set(playerId, { playerId, ...profile, lastSeen: this.now() });
    else Object.assign(existing, profile, { lastSeen: this.now() });
    return playerId;
  }

  private friendsOf(me: string): RemoteFriend[] {
    const out: RemoteFriend[] = [];
    for (const k of this.db.friendships) {
      const [a, b] = k.split('|') as [string, string];
      const other = a === me ? b : b === me ? a : null;
      if (!other) continue;
      const p = this.db.players.get(other);
      if (p) out.push({ playerId: p.playerId, name: p.name, portrait: p.portrait, lastSeen: p.lastSeen });
    }
    return out;
  }

  private nameOf(id: string): string {
    return this.db.players.get(id)?.name ?? 'A villager';
  }

  private post(row: { id: string; to: string; from: string; kind: string; payload: MailboxPayload }): void {
    // The derived id is the idempotency guarantee, exactly as in D1.
    if (this.db.mail.some((m) => m.id === row.id)) return;
    this.db.mail.push({ ...row, createdAt: this.now(), claimed: false });
  }

  /** Lazy expiry, mirroring resolveExpiredDuels on the server. */
  private sweep(me: string): void {
    const now = this.now();
    for (const d of this.db.duels) {
      if (d.status !== 'open' || d.expiresAt > now) continue;
      if (d.challenger !== me && d.opponent !== me) continue;
      const cPlayed = d.cScore !== null;
      const oPlayed = d.oScore !== null;
      if (cPlayed !== oPlayed) this.settle(d, cPlayed ? d.challenger : d.opponent);
      else d.status = 'expired';
    }
  }

  private settle(d: Rec['duels'][number], winner: string): void {
    d.status = 'resolved';
    d.winner = winner;
    const letter = (to: string, mine: number | null, theirs: number | null) =>
      this.post({
        id: `dr:${d.duelId}:${to}`,
        to,
        from: to === d.challenger ? d.opponent : d.challenger,
        kind: 'duel_result',
        payload: {
          kind: 'duel_result',
          duelId: d.duelId,
          won: winner !== 'tie' && winner === to,
          tie: winner === 'tie',
          yourScore: mine ?? 0,
          theirScore: theirs ?? 0,
        },
      });
    letter(d.challenger, d.cScore, d.oScore);
    letter(d.opponent, d.oScore, d.cScore);
  }

  snapshot(me: string): SocialSnapshot {
    this.sweep(me);
    const now = this.now();
    const invite = [...this.db.invites.values()].find((i) => i.from === me && !i.redeemedBy && i.expiresAt > now);
    return {
      playerId: me,
      friends: this.friendsOf(me),
      inbox: this.db.mail
        .filter((m) => m.to === me && !m.claimed)
        .map<MailboxEntry>((m) => ({
          id: m.id,
          from: m.from,
          fromName: this.nameOf(m.from),
          createdAt: m.createdAt,
          payload: m.payload,
        })),
      duels: this.db.duels
        .filter((d) => (d.challenger === me || d.opponent === me) && d.status !== 'expired')
        .map((d) => this.view(d, me)),
      invite: invite ? { url: `https://hearth.local/join/${invite.token}`, expiresAt: invite.expiresAt } : null,
      syncedAt: now,
    };
  }

  private view(d: Rec['duels'][number], me: string): DuelChallenge {
    const mine = d.challenger === me;
    const other = mine ? d.opponent : d.challenger;
    const resolved = d.status === 'resolved';
    return {
      duelId: d.duelId,
      mode: 'async_score',
      seed: d.seed,
      opponentId: other,
      opponentName: this.nameOf(other),
      status: d.status,
      myScore: (mine ? d.cScore : d.oScore) ?? null,
      theirScore: resolved ? ((mine ? d.oScore : d.cScore) ?? null) : null,
      winner: !resolved ? null : d.winner === 'tie' ? 'tie' : d.winner === me ? 'me' : 'them',
      expiresAt: d.expiresAt,
    };
  }

  createInvite(me: string): SocialResult<InviteInfo> {
    const now = this.now();
    const active = [...this.db.invites.values()].filter((i) => i.from === me && !i.redeemedBy && i.expiresAt > now);
    if (active.length >= CAPS.invitesActive) return fail('capped');
    const token = this.id('t').padEnd(22, 'x').slice(0, 22);
    const expiresAt = now + 7 * DAY;
    this.db.invites.set(token, { token, from: me, expiresAt, redeemedBy: null });
    return ok({ token, url: `https://hearth.local/join/${token}`, expiresAt });
  }

  redeem(me: string, token: string): SocialResult<{ friend: RemoteFriend | null }> {
    const inv = this.db.invites.get(token);
    if (!inv) return fail('invalid');
    if (inv.redeemedBy || inv.expiresAt <= this.now()) return fail('expired');
    if (inv.from === me) return fail('conflict');
    const key = pair(inv.from, me);
    if (this.db.friendships.has(key)) return fail('conflict');
    if (this.friendsOf(me).length >= CAPS.friends) return fail('capped');
    inv.redeemedBy = me;
    this.db.friendships.add(key);
    const [a, b] = key.split('|') as [string, string];
    for (const to of [me, inv.from])
      this.post({
        id: `jb:${a}:${b}:${to}`,
        to,
        from: to === me ? inv.from : me,
        kind: 'join_bonus',
        payload: { kind: 'join_bonus', energy: CAPS.joinBonusEnergy },
      });
    const p = this.db.players.get(inv.from);
    return ok({
      friend: p ? { playerId: p.playerId, name: p.name, portrait: p.portrait, lastSeen: p.lastSeen } : null,
    });
  }

  removeFriend(me: string, other: string): SocialResult<null> {
    return this.db.friendships.delete(pair(me, other)) ? ok(null) : fail('invalid');
  }

  private sentToday(from: string, to: string, kind: string): number {
    const since = this.now() - DAY;
    return this.db.mail.filter((m) => m.from === from && m.to === to && m.kind === kind && m.createdAt > since).length;
  }

  gift(me: string, to: string, chain: ChainId, level: number, key: string): SocialResult<null> {
    if (!this.db.friendships.has(pair(me, to))) return fail('auth');
    if (this.db.mail.some((m) => m.id === `g:${key}`)) return ok(null); // retry
    if (this.sentToday(me, to, 'gift') >= CAPS.giftsPerPairPerDay) return fail('capped');
    this.post({
      id: `g:${key}`,
      to,
      from: me,
      kind: 'gift',
      payload: { kind: 'gift', chain, level },
    });
    return ok(null);
  }

  askHelp(me: string, to: string, chain: ChainId, key: string): SocialResult<null> {
    if (!this.db.friendships.has(pair(me, to))) return fail('auth');
    if (this.db.mail.some((m) => m.id === `hr:${key}`)) return ok(null);
    if (this.sentToday(me, to, 'help_request') >= CAPS.helpPerPairPerDay) return fail('capped');
    this.post({ id: `hr:${key}`, to, from: me, kind: 'help_request', payload: { kind: 'help_request', chain } });
    return ok(null);
  }

  fulfilHelp(me: string, mailboxId: string): SocialResult<null> {
    const row = this.db.mail.find((m) => m.id === mailboxId && m.kind === 'help_request');
    if (!row) return fail('invalid');
    if (row.to !== me) return fail('auth');
    const chain: ChainId = row.payload.kind === 'help_request' ? row.payload.chain : 'wood';
    this.post({
      id: `hf:${row.id}`,
      to: row.from,
      from: me,
      kind: 'help_fulfil',
      payload: { kind: 'help_fulfil', chain, count: CAPS.helpItems },
    });
    row.claimed = true;
    return ok(null);
  }

  claim(me: string, id: string): SocialResult<{ payload: MailboxPayload | null; alreadyClaimed: boolean }> {
    const row = this.db.mail.find((m) => m.id === id);
    if (!row || row.to !== me) return fail('invalid');
    if (row.claimed) return ok({ payload: null, alreadyClaimed: true });
    row.claimed = true;
    return ok({ payload: row.payload, alreadyClaimed: false });
  }

  createDuel(me: string, opponent: string): SocialResult<DuelChallenge> {
    if (!this.db.friendships.has(pair(me, opponent))) return fail('auth');
    if (
      this.db.duels.some(
        (d) =>
          d.status === 'open' &&
          ((d.challenger === me && d.opponent === opponent) || (d.challenger === opponent && d.opponent === me)),
      )
    )
      return fail('capped');
    const duelId = this.id('d_');
    const d: Rec['duels'][number] = {
      duelId,
      seed: 1 + ((this.n * 2654435761) % 2_147_483_646),
      challenger: me,
      opponent,
      status: 'open',
      cScore: null,
      oScore: null,
      winner: null,
      expiresAt: this.now() + CAPS.duelTtlMs,
    };
    this.db.duels.push(d);
    this.post({
      id: `dc:${duelId}`,
      to: opponent,
      from: me,
      kind: 'duel_challenge',
      payload: { kind: 'duel_challenge', duelId },
    });
    return ok(this.view(d, me));
  }

  submitScore(me: string, duelId: string, score: number): SocialResult<DuelChallenge> {
    const d = this.db.duels.find((x) => x.duelId === duelId);
    if (!d) return fail('invalid');
    const mine = d.challenger === me;
    if (!mine && d.opponent !== me) return fail('auth');
    if (d.status !== 'open') return fail('expired');
    const existing = mine ? d.cScore : d.oScore;
    if (existing !== null) return existing === score ? ok(this.view(d, me)) : fail('conflict');
    if (mine) d.cScore = score;
    else d.oScore = score;
    if (d.cScore !== null && d.oScore !== null)
      this.settle(d, d.cScore === d.oScore ? 'tie' : d.cScore > d.oScore ? d.challenger : d.opponent);
    return ok(this.view(d, me));
  }
}

/** Device keys map to stable ids so a reload keeps the same identity in dev. */
function keyToId(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (Math.imul(h, 31) + key.charCodeAt(i)) | 0;
  const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
  let out = '';
  let v = Math.abs(h) || 1;
  for (let i = 0; i < 16; i++) {
    out += alphabet[v & 31];
    v = (Math.imul(v, 1664525) + 1013904223) >>> 0;
  }
  return `p_${out}`;
}

/** One player's view of a MemorySocialWorld. */
export class MemorySocialProvider implements SocialProvider {
  readonly name = 'memory';
  private me = '';

  constructor(
    private world: MemorySocialWorld,
    private key: string = 'dev-device-key-0000',
  ) {}

  async hello(profile: { name: string; portrait: string }): Promise<SocialResult<{ playerId: string }>> {
    this.me = this.world.register(this.key, profile);
    return ok({ playerId: this.me });
  }
  async snapshot(): Promise<SocialResult<SocialSnapshot>> {
    return this.me ? ok(this.world.snapshot(this.me)) : fail('auth');
  }
  async createInvite(): Promise<SocialResult<InviteInfo>> {
    return this.world.createInvite(this.me);
  }
  async redeemInvite(token: string): Promise<SocialResult<{ friend: RemoteFriend | null }>> {
    return this.world.redeem(this.me, token);
  }
  async removeFriend(playerId: string): Promise<SocialResult<null>> {
    return this.world.removeFriend(this.me, playerId);
  }
  async sendGift(to: string, chain: string, level: number, key: string): Promise<SocialResult<null>> {
    return this.world.gift(this.me, to, chain as ChainId, level, key);
  }
  async requestHelp(to: string, chain: string, key: string): Promise<SocialResult<null>> {
    return this.world.askHelp(this.me, to, chain as ChainId, key);
  }
  async fulfilHelp(mailboxId: string): Promise<SocialResult<null>> {
    return this.world.fulfilHelp(this.me, mailboxId);
  }
  async claim(mailboxId: string): Promise<SocialResult<{ payload: MailboxPayload | null; alreadyClaimed: boolean }>> {
    return this.world.claim(this.me, mailboxId);
  }
  async createDuel(opponent: string): Promise<SocialResult<DuelChallenge>> {
    return this.world.createDuel(this.me, opponent);
  }
  async submitDuelScore(duelId: string, score: number, moves = 0): Promise<SocialResult<DuelChallenge>> {
    // `moves` is a sanity bound the real service range-checks; the memory world
    // keeps the same signature so callers behave identically against either.
    void moves;
    return this.world.submitScore(this.me, duelId, score);
  }
}
