import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { CURRENT_VERSION, migrateState, saveState, loadState } from '../src/core/save';
import {
  BODIES,
  CLOTH_COLOURS,
  HAIR_STYLES,
  PRESETS,
  SKIN_TONES,
  defaultAvatar,
  normalizeAppearance,
  normalizeAvatar,
  randomAppearance,
  swatchHex,
} from '../src/core/avatar';

// Minimal in-memory localStorage shim (vitest node env has none).
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

describe('avatar data model', () => {
  it('defaultAvatar is a valid, uncreated neutral look', () => {
    const a = defaultAvatar();
    expect(a.created).toBe(false);
    expect(normalizeAppearance(a.appearance)).toEqual(a.appearance);
  });

  it('normalizeAppearance falls back per-field for unknown ids', () => {
    const a = normalizeAppearance({ body: 'nope', skin: 'sk_deep', hair: 'bogus' } as never);
    expect(a.body).toBe(defaultAvatar().appearance.body); // unknown → default
    expect(a.skin).toBe('sk_deep'); // known → kept
    expect(HAIR_STYLES.some((h) => h.id === a.hair)).toBe(true); // always valid
  });

  it('normalizeAvatar clamps name length and drops absent optionals', () => {
    const long = 'x'.repeat(50);
    const a = normalizeAvatar({ created: true, name: long, appearance: defaultAvatar().appearance });
    expect(a.created).toBe(true);
    expect(a.name!.length).toBe(24);
    expect(a.pronouns).toBeUndefined();
    expect('pronouns' in a).toBe(false); // omitted, not set to undefined
  });

  it('all presets reference valid options', () => {
    for (const p of PRESETS) {
      expect(normalizeAppearance(p.appearance)).toEqual(p.appearance);
    }
  });

  it('randomAppearance only produces catalogue ids', () => {
    let n = 0;
    const a = randomAppearance(() => n++);
    expect(BODIES.some((b) => b.id === a.body)).toBe(true);
    expect(SKIN_TONES.some((s) => s.id === a.skin)).toBe(true);
  });

  it('swatchHex resolves known ids and falls back safely', () => {
    expect(swatchHex(CLOTH_COLOURS, 'cc_moss')).toBe('#7c8a5a');
    expect(swatchHex(CLOTH_COLOURS, 'missing')).toBe(CLOTH_COLOURS[0]!.hex);
  });
});

describe('avatar persistence + migration', () => {
  it('freshState carries a default avatar', () => {
    expect(Game.freshState(1000).avatar).toEqual(defaultAvatar());
  });

  it('setAvatar persists and flips created', () => {
    const g = new Game(1000);
    expect(g.avatar.created).toBe(false);
    g.setAvatar({ created: true, name: 'Wren', appearance: PRESETS[0]!.appearance });
    expect(g.avatar.created).toBe(true);
    expect(g.avatar.name).toBe('Wren');
    // survives reload
    const g2 = new Game(2000);
    expect(g2.avatar.created).toBe(true);
    expect(g2.avatar.appearance).toEqual(PRESETS[0]!.appearance);
  });

  it('emits an avatar event on setAvatar', () => {
    const g = new Game(1000);
    const seen: string[] = [];
    g.subscribe((ev) => seen.push(ev.type));
    g.setAvatar({ created: true, appearance: defaultAvatar().appearance });
    expect(seen).toContain('avatar');
  });

  it('a v18 save migrates to v19 with a seeded avatar', () => {
    const fresh = Game.freshState(1000) as Record<string, unknown>;
    // Simulate an older save: strip avatar, stamp v18.
    delete fresh.avatar;
    fresh.version = 18;
    const migrated = migrateState(fresh);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(CURRENT_VERSION);
    expect(migrated!.avatar).toEqual(defaultAvatar());
  });

  it('an avatar-less loaded save still normalises to a usable look', () => {
    const fresh = Game.freshState(1000) as Record<string, unknown>;
    delete fresh.avatar; // avatar is optional; guard must not reject
    saveState(fresh as never);
    const loaded = loadState();
    expect(loaded).not.toBeNull();
    expect(normalizeAvatar(loaded!.avatar).created).toBe(false);
  });
});
