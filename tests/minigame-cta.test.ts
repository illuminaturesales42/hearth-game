import { describe, expect, it } from 'vitest';
import { minigameCta } from '../src/ui/minigame-cta';
import { MINIGAMES } from '../src/data/minigames';
import type { MinigameStatus, MinigameReason } from '../src/core/game';

const DEF = MINIGAMES[0]!; // a real MinigameDef (title/verb/blurb)

function st(reason: MinigameReason, unlocked: boolean, tokens = 3): MinigameStatus {
  return { def: DEF, unlocked, canPlay: unlocked && reason === 'ready', tokens, reason };
}

describe('minigameCta — shared card/index copy', () => {
  it('story-locked: no button, a warm explanatory note', () => {
    const c = minigameCta(st('locked-story', false), false);
    expect(c.kind).toBe('locked-story');
    expect(c.label).toBe('');
    expect(c.actionable).toBe(false);
    expect(c.sub).toContain('story is told');
  });

  it('L2-locked: a disabled "Locked" affordance', () => {
    const c = minigameCta(st('locked-l2', false), false);
    expect(c.label).toBe('Locked');
    expect(c.actionable).toBe(false);
    expect(c.sub).toContain('Care for the building');
  });

  it('eligible but not opened: an Open affordance (opening is free)', () => {
    const c = minigameCta(st('ready', false), false);
    expect(c.kind).toBe('open');
    expect(c.label).toBe('✦ Open');
    expect(c.actionable).toBe(true);
    expect(c.badge).toContain('tap to open');
    expect(c.sub).toBe(DEF.blurb);
  });

  it('ready: the game verb, goes + energy cost', () => {
    const c = minigameCta(st('ready', true, 2), false);
    expect(c.kind).toBe('ready');
    expect(c.label).toBe(DEF.verb);
    expect(c.actionable).toBe(true);
    expect(c.sub).toBe('2 goes today · 4 energy each.');
    expect(c.badge).toContain('tap to play');
  });

  it('ready + one token: singular "go"', () => {
    expect(minigameCta(st('ready', true, 1), false).sub).toBe('1 go today · 4 energy each.');
  });

  it('ready + tester: unlimited, no token count', () => {
    expect(minigameCta(st('ready', true, 0), true).sub).toBe('Unlimited goes — tester mode.');
  });

  it('no goes: never a scold', () => {
    const c = minigameCta(st('no-tokens', true, 0), false);
    expect(c.label).toBe('No goes left');
    expect(c.actionable).toBe(false);
    expect(c.sub).toContain('no rush');
  });

  it('no energy: refilled by living, not bought', () => {
    const c = minigameCta(st('no-energy', true, 3), false);
    expect(c.label).toBe('Need more energy');
    expect(c.actionable).toBe(false);
    expect(c.sub).toContain('real-world action');
  });
});
