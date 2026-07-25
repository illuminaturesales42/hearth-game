/**
 * Emberhollow's calendar. Festivals are keyed to REAL astronomical moments —
 * the solstices, the equinoxes, the full moon — so the village celebrates
 * because the sky actually says so, not because a timer fired.
 *
 * Data only; the logic lives in ../core/festivals. Art is optional: a festival
 * works with no banner (the card falls back to text), so these can ship ahead
 * of the paintings. See docs/festivals-spec.md.
 *
 * Design rules (docs/upgrade-roadmap.md): honest triggers, no fabricated
 * countdowns, everything returns every year, rewards are cosmetic only.
 */

/** The real moment a festival hangs on. Solar marks flip hemisphere; the lunar
 *  one is the same night for everybody. */
export type FestivalMark = 'spring-equinox' | 'midsummer' | 'autumn-equinox' | 'midwinter' | 'full-moon';

export interface FestivalDef {
  id: string;
  name: string;
  /** One warm line shown on the festival card. */
  blurb: string;
  /** Banner art id — optional; absent art degrades to a text-only card. */
  art: string;
  mark: FestivalMark;
  /** How many days either side of the mark the festival is celebrated. */
  windowDays: number;
  /** Honest phrasing for the "returning soon" list — never a countdown clock. */
  timing: string;
}

export const FESTIVALS: readonly FestivalDef[] = [
  {
    id: 'blossomtide',
    name: 'Blossomtide',
    blurb: 'The lanes go green again. Emberhollow airs its windows and plants something hopeful.',
    art: 'festival_blossomtide_banner',
    mark: 'spring-equinox',
    windowDays: 2,
    timing: 'At the spring equinox',
  },
  {
    id: 'longlight',
    name: 'Longlight',
    blurb: 'The longest day. Nobody lights a lantern until the very last of it has gone.',
    art: 'festival_longlight_banner',
    mark: 'midsummer',
    windowDays: 2,
    timing: 'At the summer solstice',
  },
  {
    id: 'harvest-home',
    name: 'Harvest Home',
    blurb: 'Bunting over the market, more food than sense, and everyone thanking everyone.',
    art: 'festival_harvest_banner',
    mark: 'autumn-equinox',
    windowDays: 2,
    timing: 'At the autumn equinox',
  },
  {
    id: 'midwinter-hearth',
    name: 'Midwinter Hearth',
    blurb: 'The deepest dark of the year — so every window in the village is lit, and kept lit.',
    art: 'festival_midwinter_banner',
    mark: 'midwinter',
    windowDays: 3,
    timing: 'At the winter solstice',
  },
  {
    id: 'full-moon-tide',
    name: 'Full Moon Tide',
    blurb: 'The bay goes silver and the tide runs high. A good night to be out looking up.',
    art: 'festival_fullmoon_banner',
    mark: 'full-moon',
    windowDays: 1,
    timing: 'Every full moon',
  },
];
