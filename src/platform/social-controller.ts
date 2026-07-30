/**
 * Drives the social provider and feeds results into the (pure, synchronous)
 * Game reducers — the same split as sync-controller.ts.
 *
 * Cadence: there are no sockets, no push and no timers. We refresh at launch,
 * when the Villagers screen opens, after any action that changes something
 * server-side, and when the browser comes back online. For a game people open
 * once or twice a day that is the whole delivery mechanism, and it costs
 * nothing while idle (docs/multiplayer-spec.md F4).
 *
 * Failure is always silent degradation: the mirror simply stays as it was and
 * `syncedAt` lets the screen say when it last managed to look. Nothing here can
 * block play (F5).
 */
import type { Game } from '../core/game';
import type { MailboxEntry } from '../core/types';
import { clientKey, type SocialErr, type SocialProvider, type SocialResult } from './social-provider';

/** Letters that carry a reward the player should never have to hunt for. */
const AUTO_CLAIM = new Set(['join_bonus', 'duel_result']);

export class SocialController {
  private busy = false;
  private started = false;

  constructor(
    private game: Game,
    private provider: SocialProvider,
  ) {}

  /** Register with the service, then pull once. Safe to call more than once. */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const me = this.game.avatar;
    const hello = await this.provider.hello({
      name: me.name || 'A villager',
      portrait: me.portrait,
    });
    if (!hello.ok) return; // offline at launch is normal; the next refresh retries
    await this.refresh();
    if (typeof window !== 'undefined') window.addEventListener('online', () => void this.refresh());
  }

  /**
   * Pull a snapshot, flush anything queued offline, and claim the letters that
   * should land by themselves. Concurrent calls collapse into one.
   */
  async refresh(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.flushPendingScores();
      const snap = await this.provider.snapshot();
      if (!snap.ok) return;
      this.game.applySocialSnapshot(snap.value);
      for (const entry of snap.value.inbox) {
        if (AUTO_CLAIM.has(entry.payload.kind)) await this.claim(entry);
      }
    } finally {
      this.busy = false;
    }
  }

  /**
   * Exchange a letter for its contents. The server's conditional UPDATE is the
   * real gate, so this is safe to retry; `alreadyClaimed` means another device
   * (or an earlier attempt) got there first, and the letter is simply filed.
   */
  async claim(entry: MailboxEntry): Promise<SocialResult<unknown>> {
    const res = await this.provider.claim(entry.id);
    if (!res.ok) return res;
    if (res.value.alreadyClaimed || !res.value.payload) {
      this.game.dismissEntry(entry.id);
      return res;
    }
    this.game.applyClaim({ ...entry, payload: res.value.payload });
    return res;
  }

  async createInvite(): Promise<SocialResult<{ url: string; expiresAt: number }>> {
    const res = await this.provider.createInvite();
    if (res.ok) await this.refresh();
    return res;
  }

  async redeemInvite(token: string): Promise<SocialResult<{ friend: { name: string } | null }>> {
    const res = await this.provider.redeemInvite(token);
    if (res.ok) await this.refresh(); // pulls the friend in AND claims the join bonus
    return res;
  }

  async removeFriend(playerId: string): Promise<SocialResult<null>> {
    const res = await this.provider.removeFriend(playerId);
    if (res.ok) await this.refresh();
    return res;
  }

  /** Gift the chain the player's own current task needs — no picker in v1. */
  async sendGift(to: string): Promise<SocialResult<null>> {
    const res = await this.provider.sendGift(to, this.game.currentChain(), 0, clientKey());
    if (res.ok) this.game.noteGifted(to);
    return res;
  }

  async requestHelp(to: string): Promise<SocialResult<null>> {
    const res = await this.provider.requestHelp(to, this.game.currentChain(), clientKey());
    if (res.ok) this.game.noteAsked(to);
    return res;
  }

  async fulfilHelp(entry: MailboxEntry): Promise<SocialResult<null>> {
    const res = await this.provider.fulfilHelp(entry.id);
    if (res.ok) {
      this.game.dismissEntry(entry.id);
      await this.refresh();
    }
    return res;
  }

  async challenge(opponent: string): Promise<SocialResult<{ duelId: string }>> {
    const res = await this.provider.createDuel(opponent);
    if (res.ok) await this.refresh();
    return res;
  }

  /**
   * Submit a finished run. On failure the score is parked in the save and
   * replayed by the next refresh — scores are deterministic and the duel is
   * identified by id, so nothing is lost and nothing can be double-counted.
   */
  async submitScore(duelId: string, score: number, moves: number): Promise<SocialResult<unknown>> {
    const res = await this.provider.submitDuelScore(duelId, score, moves);
    if (!res.ok && recoverable(res.error)) {
      this.game.queueDuelScore(duelId, score, moves);
      return res;
    }
    this.game.clearQueuedScore(duelId);
    if (res.ok) await this.refresh(); // may already carry the result letter
    return res;
  }

  private async flushPendingScores(): Promise<void> {
    const pending = this.game.socialState.pendingScores;
    if (pending.length === 0) return;
    for (const p of pending) {
      const res = await this.provider.submitDuelScore(p.duelId, p.score, p.moves);
      // Anything but a transport failure is final — a 409/410 means the duel
      // moved on without us, and re-sending forever would be pointless.
      if (res.ok || !recoverable(res.error)) this.game.clearQueuedScore(p.duelId);
    }
  }
}

/** Worth retrying later, as opposed to a decision the server has already made. */
function recoverable(err: SocialErr): boolean {
  return err === 'offline' || err === 'server';
}
