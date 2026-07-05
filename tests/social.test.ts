import { describe, expect, it } from 'vitest';
import {
  JOIN_BONUS,
  askFriend,
  canAsk,
  initialSocial,
  invite,
  joinFriend,
  joinedCount,
  takeGift,
} from '../src/core/social';

const T0 = new Date('2026-07-05T09:00:00').getTime();

describe('social', () => {
  it('seeds a couple of joined friends', () => {
    expect(joinedCount(initialSocial(T0))).toBe(2);
  });

  it('invite adds a pending friend', () => {
    const { state, friend } = invite(initialSocial(T0), 'Alina');
    expect(friend.status).toBe('pending');
    expect(state.friends.some((f) => f.id === friend.id)).toBe(true);
  });

  it('a friend joining pays the bonus exactly once', () => {
    const inv = invite(initialSocial(T0), 'Alina');
    const first = joinFriend(inv.state, inv.friend.id);
    expect(first.bonus).toBe(JOIN_BONUS);
    const again = joinFriend(first.state, inv.friend.id);
    expect(again.bonus).toBe(0);
  });

  it('ask for help sends items and enforces a daily cooldown', () => {
    const s = initialSocial(T0);
    const id = s.friends[0]!.id;
    expect(canAsk(s, id, T0)).toBe(true);
    const asked = askFriend(s, id, 'wood', T0);
    expect(asked.gifts.length).toBeGreaterThan(0);
    expect(asked.gifts.every((g) => g.chain === 'wood')).toBe(true);
    expect(canAsk(asked.state, id, T0)).toBe(false);
    // available again the next day
    expect(canAsk(asked.state, id, T0 + 24 * 3600_000)).toBe(true);
  });

  it('cannot ask a friend who has not joined', () => {
    const inv = invite(initialSocial(T0), 'Alina');
    expect(canAsk(inv.state, inv.friend.id, T0)).toBe(false);
    expect(askFriend(inv.state, inv.friend.id, 'wood', T0).gifts.length).toBe(0);
  });

  it('taking a gift removes it from the inbox', () => {
    const s = initialSocial(T0);
    const asked = askFriend(s, s.friends[0]!.id, 'harvest', T0);
    const gid = asked.gifts[0]!.id;
    const taken = takeGift(asked.state, gid);
    expect(taken.gift?.id).toBe(gid);
    expect(taken.state.gifts.some((g) => g.id === gid)).toBe(false);
  });
});
