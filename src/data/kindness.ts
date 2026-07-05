/**
 * A Kind Word — warm a stranger in the real world with a genuine compliment.
 * Social courage is one of the most life-giving habits, so it pays well; and if
 * the moment turns into a photo with a new friend, an extra bonus. Honour system
 * with prompts to make it easy to start.
 */
export const KINDNESS = {
  id: 'kindness',
  baseEnergy: 12,
  /** Extra energy if they capture a selfie with the new friend. */
  selfieBonus: 8,
} as const;

export const KINDNESS_PROMPTS: readonly string[] = [
  'Tell someone their smile brightened your day.',
  'Compliment a stranger on something they chose — their coat, their bag, the book they’re reading.',
  'Thank a worker for the care they put in, by name if you can read it.',
  'Tell someone they seem really good at what they do.',
  'Let someone know the small thing they did made a difference to you.',
  'Compliment a parent on how kind their child is.',
  'Tell a stranger you love their energy today.',
  'Notice someone who looks like they’re trying hard, and say so.',
];

/** Rotate a prompt without Math.random (keeps things deterministic per index). */
export function promptAt(i: number): string {
  return KINDNESS_PROMPTS[((i % KINDNESS_PROMPTS.length) + KINDNESS_PROMPTS.length) % KINDNESS_PROMPTS.length]!;
}
