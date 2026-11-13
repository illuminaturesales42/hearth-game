/**
 * Social state — the LOCAL MIRROR of a server-owned graph.
 *
 * This module used to be a simulation: it invented friends from a name list,
 * minted energy when you pressed "they joined", and fabricated gift items on
 * your own device while attributing them to someone who had never been
 * contacted. All of that is gone. Nothing here creates value; the server writes
 * letters, the client claims them, and these functions only fold the results
 * into state.
 *
 * Pure transitions, as before — the orchestrator (Game) wires energy and board
 * effects, and the transport lives in src/platform/social-provider.ts.
 */
import type { DuelChallenge, MailboxEntry, RemoteFriend, SocialState } from './types';

/** Per-pair cooldowns the server enforces; mirrored locally to grey the buttons out. */
export const ASK_COOLDOWN_MS = 86_400_000;
export const GIFT_COOLDOWN_MS = 86_400_000;

export interface SocialSnapshot {
  playerId: string;
  friends: readonly RemoteFriend[];
  inbox: readonly MailboxEntry[];
  duels: readonly DuelChallenge[];
  invite: { url: string; expiresAt: number } | null;
  syncedAt: number;
}

/** A village with nobody in it yet — the honest starting state. */
export function emptySocial(): SocialState {
  return {
    playerId: null,
    friends: [],
    inbox: [],
    duels: [],
    inviteUrl: null,
    inviteExpiresAt: null,
    syncedAt: 0,
    askedPair: {},
    giftedPair: {},
    pendingScores: [],
  };
}

/**
 * Adopt a server snapshot. The server wins on everything it owns; the two
 * cooldown mirrors and the offline score queue are local bookkeeping and
 * survive, because they describe requests we made rather than facts the server
 * has told us.
 */
export function adoptSnapshot(state: SocialState, snap: SocialSnapshot): SocialState {
  return {
    ...state,
    playerId: snap.playerId,
    friends: snap.friends,
    inbox: snap.inbox,
    duels: snap.duels,
    inviteUrl: snap.invite?.url ?? null,
    inviteExpiresAt: snap.invite?.expiresAt ?? null,
    syncedAt: snap.syncedAt,
  };
}

/** Drop a claimed letter from the mirror. The grant itself happens in Game. */
export function removeEntry(state: SocialState, id: string): SocialState {
  return { ...state, inbox: state.inbox.filter((e) => e.id !== id) };
}

export function findEntry(state: SocialState, id: string): MailboxEntry | undefined {
  return state.inbox.find((e) => e.id === id);
}

/**
 * Absence means "never asked", which is always allowed — deliberately checked
 * rather than defaulting the timestamp to 0, because `now - 0 >= COOLDOWN` is
 * only accidentally true for real clock values and reads as "on cooldown" for
 * any small `now`.
 */
export function canAskPair(state: SocialState, friendId: string, now: number): boolean {
  const last = state.askedPair[friendId];
  return last === undefined || now - last >= ASK_COOLDOWN_MS;
}

export function canGiftPair(state: SocialState, friendId: string, now: number): boolean {
  const last = state.giftedPair[friendId];
  return last === undefined || now - last >= GIFT_COOLDOWN_MS;
}

export function markAsked(state: SocialState, friendId: string, now: number): SocialState {
  return { ...state, askedPair: { ...state.askedPair, [friendId]: now } };
}

export function markGifted(state: SocialState, friendId: string, now: number): SocialState {
  return { ...state, giftedPair: { ...state.giftedPair, [friendId]: now } };
}

/**
 * Park a finished run that could not be submitted. Scores are deterministic and
 * the duel is identified by id, so replaying the queue later is safe — and the
 * server refuses a second, different score for the same duel anyway.
 */
export function queueScore(state: SocialState, entry: { duelId: string; score: number; moves: number }): SocialState {
  if (state.pendingScores.some((p) => p.duelId === entry.duelId)) return state;
  return { ...state, pendingScores: [...state.pendingScores, entry] };
}

export function unqueueScore(state: SocialState, duelId: string): SocialState {
  return { ...state, pendingScores: state.pendingScores.filter((p) => p.duelId !== duelId) };
}

/** Open duels waiting on this player to take their turn at the board. */
export function duelsToPlay(state: SocialState): DuelChallenge[] {
  return state.duels.filter((d) => d.status === 'open' && d.myScore === null);
}

export function friendCount(state: SocialState): number {
  return state.friends.length;
}
