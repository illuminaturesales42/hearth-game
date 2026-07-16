/**
 * One source of truth for the mini-game call-to-action copy, shared by the
 * building card (`renderMinigameCta`) and the Village Life index
 * (`villageLifeSection`). Before this, each surface derived its own labels and
 * sub-lines from `minigameStatus`, and the wording had already drifted ("No
 * goes left today" vs "No goes left", "Need more energy" vs "Need energy"). The
 * layout still lives in each surface; only the words come from here, so they can
 * never disagree again.
 *
 * Voice stays warm and pillar-safe: a spent day is never a scold ("more goes
 * come from living well — no rush"), energy is refilled by real-world action,
 * never bought.
 */
import type { MinigameStatus } from '../core/game';

export type MinigameCtaKind = 'locked-story' | 'locked-l2' | 'open' | 'ready' | 'no-tokens' | 'no-energy';

export interface MinigameCta {
  /** which state we're in — surfaces decide whether to hide or disable. */
  kind: MinigameCtaKind;
  /** primary button label ('' ⇒ no button, only the note). */
  label: string;
  /** whether the primary action can be taken now (enable button + tappable image). */
  actionable: boolean;
  /** short supporting line under the title. */
  sub: string;
  /** badge shown on the tappable building image when `actionable`. */
  badge: string;
}

/** Map a mini-game's status to its shared presentation. */
export function minigameCta(st: MinigameStatus, tester: boolean): MinigameCta {
  const title = st.def.title;
  if (!st.unlocked) {
    if (st.reason === 'locked-story') {
      // The building hasn't returned yet — warm and hopeful, never a countdown scold.
      const n = st.ordersToGo;
      const when =
        n === undefined
          ? `${title} opens when this building returns.`
          : n === 1
            ? `${title} opens when this building returns — just one order to go.`
            : `${title} opens when this building returns — ${n} orders to go.`;
      return { kind: 'locked-story', label: '', actionable: false, sub: when, badge: '' };
    }
    if (st.reason === 'locked-l2')
      return {
        kind: 'locked-l2',
        label: 'Locked',
        actionable: false,
        sub: `Care for the building and ${title} opens its doors.`,
        badge: '',
      };
    // Eligible but its doors aren't open yet — opening costs nothing.
    return { kind: 'open', label: '✦ Open', actionable: true, sub: st.def.blurb, badge: '✦ New — tap to open' };
  }
  if (st.reason === 'ready') {
    // Surface the personal best right where the play decision is made — the
    // one gentle self-competition hook (never a leaderboard).
    const bestLine = st.best !== undefined ? ` · Best ${st.best}` : '';
    const sub = tester
      ? `Unlimited goes — tester mode.${bestLine}`
      : `${st.tokens} ${st.tokens === 1 ? 'go' : 'goes'} today · 4 energy each.${bestLine}`;
    return { kind: 'ready', label: st.def.verb, actionable: true, sub, badge: `✦ ${st.def.verb} — tap to play` };
  }
  if (st.reason === 'no-energy')
    return {
      kind: 'no-energy',
      label: 'Need more energy',
      actionable: false,
      sub: 'A real-world action refills your energy.',
      badge: '',
    };
  return {
    kind: 'no-tokens',
    label: 'No goes left',
    actionable: false,
    sub: 'More goes come from living well — no rush.',
    badge: '',
  };
}
