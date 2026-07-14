/**
 * Social layer (client-side simulation stub for the real multiplayer backend).
 * Invite friends → they join → you both get a hearth boost. Ask a joined friend
 * for help → they send starter items to your Gifts inbox to speed a task.
 *
 * Pure state transitions; the game orchestrator wires energy + board effects.
 */
import type { ChainId, Friend, Gift, SocialState } from './types';
import { localDayKey } from './energy';
import { FRIEND_NAMES } from '../data/friends';

export const JOIN_BONUS = 15;
export const HELP_ITEMS = 2; // items a friend sends per "ask for help"

export function initialSocial(now: number): SocialState {
  void now;
  return {
    friends: [
      { id: 'f1', name: 'Maya', avatar: 1, status: 'joined' },
      { id: 'f2', name: 'Tomas', avatar: 4, status: 'joined' },
    ],
    gifts: [],
    joinBonusGiven: ['f1', 'f2'],
    nextId: 3,
  };
}

export function pickInviteName(state: SocialState): string {
  return FRIEND_NAMES[state.nextId % FRIEND_NAMES.length] ?? 'Friend';
}

export function invite(state: SocialState, name: string): { state: SocialState; friend: Friend } {
  const friend: Friend = { id: `f${state.nextId}`, name, avatar: (state.nextId % 6) + 1, status: 'pending' };
  return { state: { ...state, friends: [...state.friends, friend], nextId: state.nextId + 1 }, friend };
}

export function joinFriend(state: SocialState, id: string): { state: SocialState; bonus: number; name: string } {
  const target = state.friends.find((f) => f.id === id);
  if (!target || target.status === 'joined') return { state, bonus: 0, name: target?.name ?? '' };
  const friends = state.friends.map((f) => (f.id === id ? { ...f, status: 'joined' as const } : f));
  const bonus = state.joinBonusGiven.includes(id) ? 0 : JOIN_BONUS;
  const joinBonusGiven = bonus > 0 ? [...state.joinBonusGiven, id] : state.joinBonusGiven;
  return { state: { ...state, friends, joinBonusGiven }, bonus, name: target.name };
}

export function canAsk(state: SocialState, id: string, now: number): boolean {
  const f = state.friends.find((x) => x.id === id);
  return !!f && f.status === 'joined' && f.askedDay !== localDayKey(now);
}

export function askFriend(
  state: SocialState,
  id: string,
  chain: ChainId,
  now: number,
): { state: SocialState; gifts: Gift[]; name: string } {
  const f = state.friends.find((x) => x.id === id);
  if (!f || !canAsk(state, id, now)) return { state, gifts: [], name: f?.name ?? '' };
  const gifts: Gift[] = Array.from({ length: HELP_ITEMS }, (_, i) => ({
    id: `g${state.nextId}-${i}`,
    from: f.name,
    chain,
    level: 0,
  }));
  const friends = state.friends.map((x) => (x.id === id ? { ...x, askedDay: localDayKey(now) } : x));
  return {
    state: { ...state, friends, gifts: [...state.gifts, ...gifts], nextId: state.nextId + 1 },
    gifts,
    name: f.name,
  };
}

export function takeGift(state: SocialState, giftId: string): { state: SocialState; gift: Gift | undefined } {
  const gift = state.gifts.find((g) => g.id === giftId);
  if (!gift) return { state, gift: undefined };
  return { state: { ...state, gifts: state.gifts.filter((g) => g.id !== giftId) }, gift };
}

export function joinedCount(state: SocialState): number {
  return state.friends.filter((f) => f.status === 'joined').length;
}
