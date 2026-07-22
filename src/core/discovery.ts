/**
 * Discovery nudges — the gentle glow that points a returning player at the parts
 * of Emberhollow they haven't tried yet. Pure: `pendingNudges(state)` reads the
 * engagement fields already in the save and returns the feature-ids that deserve
 * a soft glow right now — everything currently *available* but not yet in
 * `state.discovered`. A marker clears the instant the player engages (the UI
 * calls `game.discover(id)`), and never returns.
 *
 * Cosy rules: capped so the map never lights up like a slot machine, priority-
 * ordered so only the most worthwhile few glow, and never a number that shames.
 */
import type { GameState } from './types';
import { MINIGAMES } from '../data/minigames';
import { ACTIONS } from '../data/actions';
import { VILLAGERS } from '../data/world';
import { VILLAGER_MEETS, returnsAt } from '../data/town-layout';
import { almanacProgress } from './almanac';
import { composeWeek } from './chronicle';

/** A stable nudge id, e.g. `game:sawmill`, `action:breathe`, `villager:wren`. */
export type NudgeId = string;

/** At most this many glows live at once — an invitation, never a checklist. */
export const PENDING_CAP = 3;

/** Which villager becomes worth meeting at which delivered-order. */
const VILLAGER_UNLOCK: Record<string, number> = VILLAGER_MEETS;

/** The bottom-nav screen a nudge lives under (for the nav-item glow dots). */
export function screenOfNudge(id: NudgeId): 'home' | 'villagers' | 'journal' | null {
  if (id.startsWith('villager:')) return 'villagers';
  if (id.startsWith('week-digest:')) return 'journal';
  if (id.startsWith('game:') || id === 'almanac') return 'home';
  return null; // action nudges glow the energy pill directly, not a nav item
}

/**
 * The feature-ids that should glow right now — available but undiscovered —
 * priority-ordered and capped. Deterministic and side-effect-free.
 */
export function pendingNudges(state: GameState): NudgeId[] {
  const done = new Set(state.discovered ?? []);
  const delivered = state.orderIndex;
  const bests = state.minigames.bests ?? {};
  const out: NudgeId[] = [];

  const add = (id: NudgeId): void => {
    if (!done.has(id) && !out.includes(id)) out.push(id);
  };

  // 1) A Village Life game whose building has returned but was never played.
  for (const m of MINIGAMES) {
    const at = returnsAt(m.buildingArt);
    if (at !== null && delivered >= at && !(bests[m.id] !== undefined)) add(`game:${m.id}`);
  }

  // 2) A way to earn energy the player has never logged (featured only).
  for (const a of ACTIONS) {
    if (a.featured) add(`action:${a.id}`);
  }

  // 3) A neighbour who can be met but hasn't been.
  for (const v of VILLAGERS) {
    const at = VILLAGER_UNLOCK[v.id];
    if (at !== undefined && delivered >= at && !state.relationships[v.id]) add(`villager:${v.id}`);
  }

  // 4) The Almanac has pages to fill — once the player has actually played a game.
  const prog = almanacProgress(state.almanac);
  if (Object.keys(bests).length > 0 && prog.found < prog.total) add('almanac');

  // 5) A fresh weekly reflection they haven't opened.
  const entries = state.chronicle.entries;
  if (entries.length && composeWeek(entries)) add(`week-digest:${entries[0]!.day}`);

  return out.slice(0, PENDING_CAP);
}

/** The pending nudges that live under a given bottom-nav screen. */
export function nudgesForScreen(state: GameState, screen: 'home' | 'villagers' | 'journal'): NudgeId[] {
  return pendingNudges(state).filter((id) => screenOfNudge(id) === screen);
}

/**
 * A single warm sentence inviting the player toward one nudge — for the dawn
 * modal's "here's what's new" line. Never a to-do; always an invitation.
 */
export function nudgeLine(id: NudgeId): string {
  if (id.startsWith('game:')) {
    const m = MINIGAMES.find((g) => g.id === id.slice(5));
    return m ? `${m.title} is waiting — ${m.verb.toLowerCase()}.` : 'A village game is waiting to be played.';
  }
  if (id.startsWith('action:')) {
    const a = ACTIONS.find((x) => x.id === id.slice(7));
    return a ? `A new way to warm the hearth: ${a.label}.` : 'There’s a new way to earn energy.';
  }
  if (id.startsWith('villager:')) {
    const v = VILLAGERS.find((x) => x.id === id.slice(9));
    return v ? `${v.name} is about the village — say hello.` : 'A neighbour you haven’t met is about.';
  }
  if (id === 'almanac') return 'The Keeper’s Almanac has new pages to fill.';
  if (id.startsWith('week-digest:')) return 'Your week in Emberhollow is ready to read.';
  return '';
}
