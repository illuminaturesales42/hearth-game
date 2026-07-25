/**
 * The Chronicle: a storybook memory of days in Emberhollow, written as prose —
 * never statistics (per the Chronicle Design Bible). Entries are generated
 * deterministically from the day's ledger with hand-written sentence pools,
 * so the same day always reads the same and no network is ever needed.
 */
import type { ActionState, ChronicleEntry, StatsState } from './types';

const STAGE_SCENES = [
  'the square still wore its storm scars',
  'scaffolds stood hopeful against the sky',
  'a lit window made the evening feel possible',
  'gardens leaned into the fences, unafraid',
  'the beacon kept its slow, sure watch',
] as const;

const OPENERS = [
  'A quiet day in Emberhollow, where',
  'The sea kept its own counsel today, and',
  'Gulls argued over the docks while',
  'Salt on the wind, bread on the air, and',
  'The tide came in gentle today, and',
  'Low clouds sat on the shoals, but',
] as const;

const ACTION_LINES: Record<string, string> = {
  steps: 'the coast road remembered your footsteps',
  stairs: 'the cliff steps counted your climbs',
  water: 'the well was filled with care',
  'photo-outside': 'you went looking for beauty, and found it',
  'sunrise-photo': 'you were there when the morning arrived',
  'sunset-photo': 'you saw the sun off to sleep',
  'nature-photo': 'something green and living caught your eye',
  squats: 'the millstone turned under strong legs',
  stretch: 'the garden woke when you did',
  breathe: 'the sea breeze slowed to match your breathing',
  kindness: 'a stranger left warmer than they came',
  stargaze: 'the night sky held you a while',
  'gratitude-journal': 'one good thing was written down and kept',
  'log-cold-plunge': 'the cold water made you braver',
  'log-sauna': 'the heat wrung the week from your shoulders',
  'med-morning': 'the morning began by the hearth, unhurried',
  'med-box': 'four square breaths steadied the day',
  'med-478': 'the evening was let down gently',
  'med-bodyscan': 'the whole day was released, toe to crown',
  'log-meditation': 'stillness was practised, and it showed',
};

const CLOSERS = [
  'The hearth held its warmth well into the night.',
  'Somewhere, a kettle sang about it.',
  'Emberhollow noticed. Emberhollow always notices.',
  'It was enough. It was more than enough.',
  'The lighthouse blinked once, like a slow wink.',
  'Even the cats approved, and they approve of little.',
] as const;

const QUIET_DAYS = [
  'A resting day. Even harbours need slack tide, and the village kept the fire in for you.',
  'Nothing was asked of today, and today obliged. The hearth stayed warm regardless.',
  'A day of small silences. The boats stayed in, and that was fine.',
] as const;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const pick = <T>(arr: readonly T[], seed: number): T => arr[seed % arr.length]!;

/**
 * Write the prose entry for a finished day from its action counts.
 * Deterministic per (day, activity) — replays identically forever.
 */
export function composeEntry(
  day: string,
  counts: Record<string, number>,
  streak: number,
  stage: number,
  dayDelivers: number,
): ChronicleEntry {
  const seed = hash(day);
  const done = Object.keys(counts).filter((k) => (counts[k] ?? 0) > 0 && ACTION_LINES[k]);

  let text: string;
  if (done.length === 0 && dayDelivers === 0) {
    text = pick(QUIET_DAYS, seed);
  } else {
    const parts: string[] = [];
    parts.push(`${pick(OPENERS, seed)} ${STAGE_SCENES[Math.min(stage, 4)]}.`);
    const lines = done
      .slice(0, 3)
      .map((k, i) => ACTION_LINES[k]!.replace(/^./, (c) => (i === 0 ? c.toUpperCase() : c)));
    if (lines.length === 1) parts.push(`${lines[0]}.`);
    if (lines.length === 2) parts.push(`${lines[0]}, and ${lines[1]}.`);
    if (lines.length === 3) parts.push(`${lines[0]}, ${lines[1]}, and ${lines[2]}.`);
    if (dayDelivers > 0) {
      parts.push(
        dayDelivers === 1
          ? 'A villager’s request was seen to, and the town stood a little straighter for it.'
          : `${dayDelivers} of the village’s requests were seen to, and the town stood straighter for it.`,
      );
    }
    if (streak >= 3) parts.push(`Day ${streak} of tending the fire without letting it gutter.`);
    parts.push(pick(CLOSERS, seed >> 3));
    text = parts.join(' ');
  }
  return { day, text, stage, streak };
}

const WEEK_OPENERS = [
  'Seven mornings came and went over Emberhollow,',
  'A week folded itself into the Chronicle,',
  'The tide turned seven times this week,',
  'Another handful of days by the hearth,',
] as const;

const WEEK_STAGES = [
  'and the square still carries its storm scars — but you are here, and that is where it begins.',
  'and scaffolds are rising where the storm left gaps.',
  'and a lit window or two now makes the evenings feel possible.',
  'and the gardens have started leaning into the fences, unafraid.',
  'and the beacon keeps its slow, sure watch over a village nearly whole.',
] as const;

const WEEK_CLOSERS = [
  'Rest is progress too. The fire will keep.',
  'Whatever the week held, the village noticed. It always does.',
  'Small and steady wins here. Come back when you can.',
  'The kettle is on. Emberhollow is glad you came by.',
] as const;

export interface WeekDigest {
  title: string;
  text: string;
  days: number;
}

/**
 * "Your week in Emberhollow" — a gentle reflection over the last few days, drawn
 * from the Chronicle (prose, never a stat sheet — Chronicle Bible). Returns null
 * until there's a little to reflect on. Deterministic per the newest day.
 */
export function composeWeek(entries: readonly ChronicleEntry[]): WeekDigest | null {
  const week = entries.slice(0, 7); // entries are newest-first ≈ the last week
  if (week.length < 2) return null;
  const days = week.length;
  const topStreak = Math.max(...week.map((e) => e.streak));
  const stage = Math.min(4, Math.max(...week.map((e) => e.stage)));
  const seed = hash(week[0]!.day);
  const streakLine =
    topStreak >= 3
      ? ` You kept the fire tended ${topStreak} days without letting it gutter.`
      : days >= 5
        ? ' You were here for most of it, and the village felt the difference.'
        : '';
  const text = `${pick(WEEK_OPENERS, seed)} and you were here for ${days} of them.${streakLine} ${pick(
    WEEK_STAGES,
    stage,
  )} ${pick(WEEK_CLOSERS, seed >> 2)}`;
  return { title: 'Your week in Emberhollow', text, days };
}

/** True when `actions.day` belongs to a day before `today` and deserves an entry. */
export function dayHasRolled(actions: ActionState, todayKey: string): boolean {
  return actions.day !== todayKey;
}

/** Cap kept generous; a year of days is ~30 KB of text. */
export const MAX_ENTRIES = 400;

export function appendEntry(entries: readonly ChronicleEntry[], entry: ChronicleEntry): ChronicleEntry[] {
  if (entries.some((e) => e.day === entry.day)) return [...entries];
  const next = [entry, ...entries];
  return next.slice(0, MAX_ENTRIES);
}

export function rolloverStats(stats: StatsState, todayKey: string): StatsState {
  if (stats.day === todayKey) return stats;
  return { ...stats, day: todayKey, dayMerges: 0, dayDelivers: 0, dayActions: 0, dayDuelWins: 0 };
}
