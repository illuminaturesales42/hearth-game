/**
 * The social layer, client side: the pure reducers, the Game grants that only a
 * claimed letter can trigger, and a full two-player lifecycle against the
 * in-memory world.
 *
 * The old version of this file tested a simulation — that inviting minted a
 * friend, that "they joined" minted energy. Those behaviours are gone by
 * design, so the tests that replace them assert the opposite: that nothing of
 * value appears without a letter the server wrote.
 */
import { describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import {
  ASK_COOLDOWN_MS,
  adoptSnapshot,
  canAskPair,
  emptySocial,
  markAsked,
  queueScore,
  removeEntry,
  unqueueScore,
  type SocialSnapshot,
} from '../src/core/social';
import type { MailboxEntry, RemoteFriend } from '../src/core/types';
import { MemorySocialProvider, MemorySocialWorld } from '../src/platform/social-memory';

const FRIEND: RemoteFriend = { playerId: 'p_a', name: 'Bo', portrait: 'c01', lastSeen: 5000 };

const snap = (over: Partial<SocialSnapshot> = {}): SocialSnapshot => ({
  playerId: 'p_me',
  friends: [FRIEND],
  inbox: [],
  duels: [],
  invite: null,
  syncedAt: 9000,
  ...over,
});

const letter = (id: string, payload: MailboxEntry['payload']): MailboxEntry => ({
  id,
  from: 'p_a',
  fromName: 'Bo',
  createdAt: 1,
  payload,
});

/** A fixed clock, matching the other Game tests. loadState() no-ops under node. */
function fresh(): Game {
  return new Game(1000);
}

describe('social reducers', () => {
  it('starts empty — no invented friends, no invented gifts', () => {
    const s = emptySocial();
    expect(s.friends).toEqual([]);
    expect(s.inbox).toEqual([]);
    expect(s.playerId).toBeNull();
    expect(s.syncedAt).toBe(0);
  });

  it('adopting a snapshot takes the server view but keeps local bookkeeping', () => {
    const asked = markAsked(emptySocial(), 'p_a', 1000);
    const queued = queueScore(asked, { duelId: 'd_1', score: 40, moves: 8 });
    const next = adoptSnapshot(queued, snap({ invite: { url: 'https://x/join/t', expiresAt: 7 } }));
    expect(next.friends).toEqual([FRIEND]);
    expect(next.playerId).toBe('p_me');
    expect(next.inviteUrl).toBe('https://x/join/t');
    // Local-only: the server never told us these, so a poll must not erase them.
    expect(next.askedPair['p_a']).toBe(1000);
    expect(next.pendingScores).toHaveLength(1);
  });

  it('mirrors the per-pair ask cooldown', () => {
    const s = markAsked(emptySocial(), 'p_a', 1_000_000);
    expect(canAskPair(s, 'p_a', 1_000_000 + 60_000)).toBe(false);
    expect(canAskPair(s, 'p_a', 1_000_000 + ASK_COOLDOWN_MS)).toBe(true);
    expect(canAskPair(s, 'p_other', 1_000_000)).toBe(true);
  });

  it('queues a score once and clears it on demand', () => {
    let s = queueScore(emptySocial(), { duelId: 'd_1', score: 10, moves: 2 });
    s = queueScore(s, { duelId: 'd_1', score: 99, moves: 9 }); // same duel: ignored
    expect(s.pendingScores).toEqual([{ duelId: 'd_1', score: 10, moves: 2 }]);
    expect(unqueueScore(s, 'd_1').pendingScores).toHaveLength(0);
  });

  it('removeEntry drops exactly one letter', () => {
    const s = { ...emptySocial(), inbox: [letter('a', { kind: 'join_bonus', energy: 15 })] };
    expect(removeEntry(s, 'a').inbox).toHaveLength(0);
    expect(removeEntry(s, 'nope').inbox).toHaveLength(1);
  });
});

describe('Game — value arrives only by claiming a letter', () => {
  it('a snapshot full of friends grants nothing on its own', () => {
    const game = fresh();
    const before = game.snapshot.energy.current;
    game.applySocialSnapshot(snap());
    expect(game.socialState.friends).toHaveLength(1);
    expect(game.snapshot.energy.current).toBe(before); // no energy from merely seeing a friend
  });

  it('claiming a join bonus is the one path energy takes', () => {
    const game = fresh();
    const before = game.snapshot.energy.current;
    game.applyClaim(letter('jb:1', { kind: 'join_bonus', energy: 15 }));
    expect(game.snapshot.energy.current).toBe(before + 15);
    expect(game.socialState.inbox).toHaveLength(0);
  });

  it('a gift lands on the board; a help fulfil lands as many items as it says', () => {
    const game = fresh();
    game.applyClaim(letter('g:1', { kind: 'gift', chain: 'wood', level: 1 }));
    const items = game.snapshot.board.cells.filter((c) => c.kind === 'item');
    expect(items.some((c) => c.kind === 'item' && c.item.chain === 'wood' && c.item.level === 1)).toBe(true);

    const count = items.length;
    game.applyClaim(letter('hf:1', { kind: 'help_fulfil', chain: 'stone', count: 2 }));
    const after = game.snapshot.board.cells.filter((c) => c.kind === 'item');
    expect(after.length).toBe(count + 2);
  });

  it('a duel result pays coins, never spoils — both boards were private copies', () => {
    const game = fresh();
    const coins = game.snapshot.coins;
    const repo = game.snapshot.repository.length;
    game.applyClaim(
      letter('dr:1', {
        kind: 'duel_result',
        duelId: 'd_1',
        won: true,
        tie: false,
        yourScore: 100,
        theirScore: 40,
      }),
    );
    expect(game.snapshot.coins).toBeGreaterThan(coins);
    expect(game.snapshot.repository).toHaveLength(repo); // no items minted
    expect(game.duelStreak).toBe(1);
  });

  it('a tie keeps the streak; a loss resets it', () => {
    const game = fresh();
    game.applyClaim(
      letter('dr:a', {
        kind: 'duel_result',
        duelId: 'd_a',
        won: true,
        tie: false,
        yourScore: 50,
        theirScore: 10,
      }),
    );
    expect(game.duelStreak).toBe(1);
    game.applyClaim(
      letter('dr:b', {
        kind: 'duel_result',
        duelId: 'd_b',
        won: false,
        tie: true,
        yourScore: 50,
        theirScore: 50,
      }),
    );
    expect(game.duelStreak).toBe(1);
    game.applyClaim(
      letter('dr:c', {
        kind: 'duel_result',
        duelId: 'd_c',
        won: false,
        tie: false,
        yourScore: 10,
        theirScore: 90,
      }),
    );
    expect(game.duelStreak).toBe(0);
  });

  it('a full board refuses the gift rather than dropping it', () => {
    const game = fresh();
    let guard = 0;
    while (game.snapshot.board.cells.some((c) => c.kind === 'empty') && guard++ < 60) {
      game.applyClaim(letter(`g:${guard}`, { kind: 'gift', chain: 'wood', level: 0 }));
    }
    const events: string[] = [];
    game.subscribe((e) => events.push(e.type));
    game.applyClaim(letter('g:last', { kind: 'gift', chain: 'wood', level: 0 }));
    expect(events).toContain('reject');
  });
});

describe('two players, one world — the whole lifecycle', () => {
  it('invite → redeem → gift → help → duel → both results', async () => {
    const world = new MemorySocialWorld();
    const ada = new MemorySocialProvider(world, 'device-ada');
    const bo = new MemorySocialProvider(world, 'device-bo');

    const adaHello = await ada.hello({ name: 'Ada', portrait: 'c01' });
    const boHello = await bo.hello({ name: 'Bo', portrait: 'c02' });
    if (!adaHello.ok || !boHello.ok) throw new Error('hello failed');
    const adaId = adaHello.value.playerId;
    const boIdent = boHello.value.playerId;
    expect(adaId).not.toBe(boIdent);

    // --- invite + redeem: two-sided consent, one bonus letter each
    const inv = await ada.createInvite();
    if (!inv.ok) throw new Error('invite failed');
    expect((await bo.redeemInvite(inv.value.token)).ok).toBe(true);

    const adaSnap = await ada.snapshot();
    const boSnap = await bo.snapshot();
    if (!adaSnap.ok || !boSnap.ok) throw new Error('snapshot failed');
    expect(adaSnap.value.friends.map((f) => f.name)).toEqual(['Bo']);
    expect(boSnap.value.friends.map((f) => f.name)).toEqual(['Ada']);
    expect(adaSnap.value.inbox.filter((e) => e.payload.kind === 'join_bonus')).toHaveLength(1);
    expect(boSnap.value.inbox.filter((e) => e.payload.kind === 'join_bonus')).toHaveLength(1);

    // Redeeming again cannot mint a second friendship or a second bonus.
    expect((await bo.redeemInvite(inv.value.token)).ok).toBe(false);

    // --- gift: minted for the recipient, idempotent under retry
    expect((await ada.sendGift(boIdent, 'wood', 0, 'ck1')).ok).toBe(true);
    expect((await ada.sendGift(boIdent, 'wood', 0, 'ck1')).ok).toBe(true);
    const boAfterGift = await bo.snapshot();
    if (!boAfterGift.ok) throw new Error('snapshot failed');
    expect(boAfterGift.value.inbox.filter((e) => e.payload.kind === 'gift')).toHaveLength(1);

    // --- help: Bo asks, Ada answers, Bo receives
    expect((await bo.requestHelp(adaId, 'stone', 'ask1')).ok).toBe(true);
    const adaInbox = await ada.snapshot();
    if (!adaInbox.ok) throw new Error('snapshot failed');
    const ask = adaInbox.value.inbox.find((e) => e.payload.kind === 'help_request');
    expect(ask).toBeDefined();
    expect((await ada.fulfilHelp(ask!.id)).ok).toBe(true);
    const boHelped = await bo.snapshot();
    if (!boHelped.ok) throw new Error('snapshot failed');
    expect(boHelped.value.inbox.some((e) => e.payload.kind === 'help_fulfil')).toBe(true);

    // --- duel: one seed, both race it, higher score wins
    const duel = await ada.createDuel(boIdent);
    if (!duel.ok) throw new Error('duel failed');
    const boChallenged = await bo.snapshot();
    if (!boChallenged.ok) throw new Error('snapshot failed');
    const theirView = boChallenged.value.duels.find((d) => d.duelId === duel.value.duelId);
    expect(theirView?.seed).toBe(duel.value.seed); // the same board, both sides

    const first = await ada.submitDuelScore(duel.value.duelId, 120, 12);
    if (!first.ok) throw new Error('score failed');
    expect(first.value.status).toBe('open');
    expect(first.value.theirScore).toBeNull(); // hidden until it is settled

    const second = await bo.submitDuelScore(duel.value.duelId, 80, 11);
    if (!second.ok) throw new Error('score failed');
    expect(second.value.status).toBe('resolved');
    expect(second.value.winner).toBe('them');

    const adaFinal = await ada.snapshot();
    const boFinal = await bo.snapshot();
    if (!adaFinal.ok || !boFinal.ok) throw new Error('snapshot failed');
    const adaResult = adaFinal.value.inbox.find((e) => e.payload.kind === 'duel_result');
    const boResult = boFinal.value.inbox.find((e) => e.payload.kind === 'duel_result');
    expect(adaResult && adaResult.payload.kind === 'duel_result' && adaResult.payload.won).toBe(true);
    expect(boResult && boResult.payload.kind === 'duel_result' && boResult.payload.won).toBe(false);

    // --- claiming: once, and only your own
    const claim = await ada.claim(adaResult!.id);
    expect(claim.ok && claim.value.payload).toBeTruthy();
    const twice = await ada.claim(adaResult!.id);
    expect(twice.ok && twice.value.alreadyClaimed).toBe(true);
    expect((await bo.claim(adaResult!.id)).ok).toBe(false);
  });

  it('a friend you have not made cannot be gifted or duelled', async () => {
    const world = new MemorySocialWorld();
    const ada = new MemorySocialProvider(world, 'device-ada');
    const bo = new MemorySocialProvider(world, 'device-bo');
    await ada.hello({ name: 'Ada', portrait: 'c01' });
    const boId = await bo.hello({ name: 'Bo', portrait: 'c02' });
    if (!boId.ok) throw new Error('hello failed');
    expect((await ada.sendGift(boId.value.playerId, 'wood', 0, 'k')).ok).toBe(false);
    expect((await ada.createDuel(boId.value.playerId)).ok).toBe(false);
  });
});
