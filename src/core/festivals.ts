/**
 * Festival logic: which of Emberhollow's celebrations is happening right now,
 * and what's coming next. Pure and deterministic — every function takes `now`
 * (and the player's hemisphere) so the whole calendar is unit-testable at fixed
 * timestamps, per the repo's no-Date.now()-in-core rule.
 *
 * Two kinds of mark:
 *  - SOLAR (solstices/equinoxes) — a fixed calendar date that FLIPS below the
 *    equator: a Sydney player's midwinter is in June, not December.
 *  - LUNAR (full moon) — the same night everywhere, read from the real lunar
 *    phase already computed in ../data/moon.
 */
import { FESTIVALS, type FestivalDef, type FestivalMark } from '../data/festivals';
import { illumination, moonAge, SYNODIC } from '../data/moon';

const DAY_MS = 86_400_000;

/** Illuminated fraction at/above which the moon reads as "full" to the eye. */
export const FULL_MOON_THRESHOLD = 0.97;

/** Northern-hemisphere date of each solar mark (month is 0-indexed).
 *  Within a day or two of the true astronomical instant, which is plenty for a
 *  village that celebrates for several days either side. */
const SOLAR_DATE: Record<Exclude<FestivalMark, 'full-moon'>, { month: number; day: number }> = {
  'spring-equinox': { month: 2, day: 20 }, // ~20 March
  midsummer: { month: 5, day: 21 }, // ~21 June
  'autumn-equinox': { month: 8, day: 22 }, // ~22 September
  midwinter: { month: 11, day: 21 }, // ~21 December
};

/** Below the equator the seasons are opposite: the June solstice IS midwinter. */
const FLIPPED: Record<Exclude<FestivalMark, 'full-moon'>, Exclude<FestivalMark, 'full-moon'>> = {
  'spring-equinox': 'autumn-equinox',
  'autumn-equinox': 'spring-equinox',
  midsummer: 'midwinter',
  midwinter: 'midsummer',
};

function solarDateFor(mark: Exclude<FestivalMark, 'full-moon'>, southern: boolean): { month: number; day: number } {
  return SOLAR_DATE[southern ? FLIPPED[mark] : mark];
}

/** Local midnight for a Y/M/D, so day maths never drifts on a timezone edge. */
function atLocalMidnight(year: number, month: number, day: number): number {
  return new Date(year, month, day, 0, 0, 0, 0).getTime();
}

/** Whole days from `now` to `then` (negative = in the past). */
function daysBetween(now: number, then: number): number {
  const a = new Date(now);
  const startOfToday = atLocalMidnight(a.getFullYear(), a.getMonth(), a.getDate());
  return Math.round((then - startOfToday) / DAY_MS);
}

/**
 * How many days until this festival's next occurrence (0 = today).
 * Solar marks look at this year's date and roll to next year once it's past;
 * the lunar mark rides the synodic month.
 */
export function daysUntil(def: FestivalDef, now: number, southern = false): number {
  if (def.mark === 'full-moon') {
    const age = moonAge(now);
    const half = SYNODIC / 2;
    const untilFull = (((half - age) % SYNODIC) + SYNODIC) % SYNODIC;
    return Math.round(untilFull);
  }
  const { month, day } = solarDateFor(def.mark, southern);
  const year = new Date(now).getFullYear();
  const thisYear = daysBetween(now, atLocalMidnight(year, month, day));
  // Still inside this year's celebration window? Then it is "now", not next year.
  if (thisYear >= -def.windowDays) return thisYear;
  return daysBetween(now, atLocalMidnight(year + 1, month, day));
}

/** Is this festival being celebrated at `now`? */
export function isActive(def: FestivalDef, now: number, southern = false): boolean {
  if (def.mark === 'full-moon') return illumination(now) >= FULL_MOON_THRESHOLD;
  return Math.abs(daysUntil(def, now, southern)) <= def.windowDays;
}

/**
 * The festival happening right now, or null. If two ever overlap (a full moon
 * landing on a solstice — rare and rather wonderful) the solar one wins, since
 * it is the bigger village occasion.
 */
export function activeFestival(now: number, southern = false): FestivalDef | null {
  const active = FESTIVALS.filter((f) => isActive(f, now, southern));
  if (active.length === 0) return null;
  return active.find((f) => f.mark !== 'full-moon') ?? active[0]!;
}

export interface UpcomingFestival {
  def: FestivalDef;
  /** Whole days away (0 = today). */
  days: number;
}

/**
 * What's coming, soonest first — the honest "returning soon" list. It states
 * what happens and roughly when ("Harvest Home — in 18 days"), never a ticking
 * countdown engineered to pressure. Excludes anything active right now.
 */
export function upcomingFestivals(now: number, southern = false, limit = 3): UpcomingFestival[] {
  return FESTIVALS.filter((f) => !isActive(f, now, southern))
    .map((def) => ({ def, days: daysUntil(def, now, southern) }))
    .sort((a, b) => a.days - b.days)
    .slice(0, limit);
}

/** Warm, honest phrasing for how far off a festival is. Never a clock. */
export function whenLabel(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days <= 7) return `in ${days} days`;
  if (days <= 31) return `in about ${Math.round(days / 7)} weeks`;
  return `in about ${Math.round(days / 30)} months`;
}
