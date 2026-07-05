/**
 * "Matches" = village happenings you can drop into with other players — a
 * bonfire, hauling nets, a song circle. Joining one gives a little Hearth
 * energy and keeps the harbour feeling alive. Backend is simulated for now
 * (the same client-side stub as the social layer); the real matchmaking
 * service slots in behind Game.joinMatch in M3.
 */
export interface MatchTemplate {
  id: string;
  name: string;
  blurb: string;
  energy: number;
}

export const MATCHES: readonly MatchTemplate[] = [
  { id: 'bonfire', name: 'Bonfire on the sand', blurb: 'The village gathers as the light fades.', energy: 5 },
  { id: 'nets', name: 'Haul the nets', blurb: 'A neighbour needs a hand at the pier.', energy: 4 },
  { id: 'lanterns', name: 'Light the lanterns', blurb: 'String warm light along the harbour.', energy: 4 },
  { id: 'market', name: 'Market morning', blurb: 'Help set the stalls before the bell.', energy: 3 },
  { id: 'songcircle', name: 'Song circle', blurb: 'Evening songs around the hearth.', energy: 5 },
];

/** Gentle guardrails so it never becomes a grind. */
export const MATCH_DAILY_CAP = 10;
export const MATCH_INTERVAL_MS = 15_000;

export function findMatch(id: string): MatchTemplate | undefined {
  return MATCHES.find((m) => m.id === id);
}
