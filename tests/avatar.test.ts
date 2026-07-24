import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import { CURRENT_VERSION, migrateState, saveState, loadState } from '../src/core/save';
import { defaultAvatar, normalizeAvatar } from '../src/core/avatar';
import { PORTRAITS, availablePortraits, defaultPortraitId, isPortraitId, portraitArt } from '../src/data/avatar-portraits';

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

describe('avatar portrait catalogue', () => {
  it('exposes portraits with stable ids and art ids', () => {
    expect(PORTRAITS.length).toBeGreaterThan(0);
    for (const p of PORTRAITS) {
      expect(p.id).toMatch(/^av_/);
      expect(p.artId.length).toBeGreaterThan(0);
    }
  });

  it('availablePortraits only returns ids whose art is present', () => {
    const avail = availablePortraits();
    // In tests artUrl resolves against the manifest; fallbacks (avatar_1..6) exist.
    for (const p of avail) expect(portraitArt(p.id)).not.toBeNull();
    expect(avail.length).toBeGreaterThan(0);
  });

  it('defaultPortraitId is always a present, valid id', () => {
    const id = defaultPortraitId();
    expect(isPortraitId(id)).toBe(true);
    expect(portraitArt(id)).not.toBeNull();
  });

  it('isPortraitId rejects unknown ids', () => {
    expect(isPortraitId('nope')).toBe(false);
    expect(isPortraitId(undefined)).toBe(false);
  });
});

describe('avatar model', () => {
  it('defaultAvatar is uncreated with a valid portrait', () => {
    const a = defaultAvatar();
    expect(a.created).toBe(false);
    expect(isPortraitId(a.portrait)).toBe(true);
  });

  it('normalizeAvatar falls back on unknown portrait, clamps name, drops absent optionals', () => {
    const long = 'x'.repeat(50);
    const a = normalizeAvatar({ created: true, name: long, portrait: 'bogus' });
    expect(a.created).toBe(true);
    expect(isPortraitId(a.portrait)).toBe(true); // coerced to a real one
    expect(a.name!.length).toBe(24);
    expect('pronouns' in a).toBe(false);
  });
});

describe('avatar persistence + migration', () => {
  it('freshState carries a default avatar', () => {
    expect(Game.freshState(1000).avatar).toEqual(defaultAvatar());
  });

  it('setAvatar persists a chosen portrait and flips created', () => {
    const pick = availablePortraits()[0]!.id;
    const g = new Game(1000);
    expect(g.avatar.created).toBe(false);
    g.setAvatar({ created: true, name: 'Wren', portrait: pick });
    expect(g.avatar.created).toBe(true);
    expect(g.avatar.name).toBe('Wren');
    expect(g.avatar.portrait).toBe(pick);
    const g2 = new Game(2000);
    expect(g2.avatar.portrait).toBe(pick); // survives reload
  });

  it('emits an avatar event on setAvatar', () => {
    const g = new Game(1000);
    const seen: string[] = [];
    g.subscribe((ev) => seen.push(ev.type));
    g.setAvatar({ created: true, portrait: defaultPortraitId() });
    expect(seen).toContain('avatar');
  });

  it('a v18 save migrates to v19 with a seeded avatar', () => {
    const fresh = Game.freshState(1000) as unknown as Record<string, unknown>;
    delete fresh.avatar;
    fresh.version = 18;
    const migrated = migrateState(fresh);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(CURRENT_VERSION);
    expect(migrated!.avatar).toEqual(defaultAvatar());
  });

  it('an avatar-less loaded save still normalises to a usable look', () => {
    const fresh = Game.freshState(1000) as unknown as Record<string, unknown>;
    delete fresh.avatar; // optional; guard must not reject
    saveState(fresh as never);
    const loaded = loadState();
    expect(loaded).not.toBeNull();
    expect(normalizeAvatar(loaded!.avatar).created).toBe(false);
  });
});
