import { beforeEach, describe, expect, it } from 'vitest';
import { Game } from '../src/core/game';
import {
  CURRENT_VERSION,
  clearSave,
  exportSave,
  importSave,
  loadState,
  migrateState,
  saveState,
} from '../src/core/save';

// vitest node env has no localStorage: provide a minimal in-memory shim.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  };
});

describe('save round-trip (P0 regression)', () => {
  it('freshState stamps CURRENT_VERSION and survives save→load', () => {
    const state = Game.freshState(1000);
    expect(state.version).toBe(CURRENT_VERSION);
    saveState(state);
    const loaded = loadState();
    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(CURRENT_VERSION);
    expect(loaded!.orderIndex).toBe(state.orderIndex);
  });

  it('a played game persists across a reload (constructor path)', () => {
    const g = new Game(1000);
    g.tapProducer(1000);
    const energyAfter = g.snapshot.energy.current;
    const g2 = new Game(2000);
    expect(g2.snapshot.energy.current).toBe(energyAfter);
  });
});

describe('migrations', () => {
  it('heals the historical v6-stamp bug (v8 shape stamped 6)', () => {
    const buggy = { ...Game.freshState(1000), version: 6 } as unknown;
    const healed = migrateState(buggy);
    expect(healed).not.toBeNull();
    expect(healed!.version).toBe(CURRENT_VERSION);
  });

  it('migrates a v8 save (no prefs) to current, adding default prefs', () => {
    const v8 = { ...Game.freshState(1000), version: 8 } as Record<string, unknown>;
    delete v8.prefs;
    const migrated = migrateState(v8);
    expect(migrated).not.toBeNull();
    expect(migrated!.prefs.musicVol).toBeGreaterThan(0);
  });

  it('reads legacy versioned keys and re-homes them', () => {
    const v8 = { ...Game.freshState(1000), version: 8 } as Record<string, unknown>;
    delete v8.prefs;
    store.set('hearth:save:v8', JSON.stringify(v8));
    const loaded = loadState();
    expect(loaded).not.toBeNull();
    expect(store.has('hearth:save')).toBe(true);
  });

  // The migration chain (MIGRATIONS) and the final null-guard in migrateState
  // (save.ts) are two places that must stay in sync: a new required GameState
  // key needs BOTH a migration step that adds it AND an entry in the guard.
  // This fixture is a realistic v8 save — stripped of every key introduced
  // after v8 — so if a future schema bump adds a guarded key without a
  // migration, migrateState returns null here and this test fails.
  const GUARDED_KEYS = [
    'board',
    'energy',
    'actions',
    'social',
    'gratitude',
    'settings',
    'prefs',
    'stats',
    'chronicle',
    'wellbeing',
    'relationships',
    'buildingUpgrades',
  ] as const;

  it('a genuine v8 save climbs the chain with every guarded key reconstructed', () => {
    // Keys added after v8 by later migrations — absent from a real v8 save.
    const postV8 = [
      'prefs', // v9
      'chronicle',
      'stats',
      'achievements',
      'questsClaimed',
      'flags', // v10
      'wellbeing',
      'decor',
      'nextDecorId', // v11
      'relationships', // v12
      'buildingUpgrades', // v13
    ];
    const v8 = { ...Game.freshState(1000), version: 8 } as Record<string, unknown>;
    for (const k of postV8) delete v8[k];

    const migrated = migrateState(v8);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(CURRENT_VERSION);
    for (const key of GUARDED_KEYS) {
      expect(migrated![key as keyof typeof migrated], `guarded key "${key}" must survive migration`).toBeDefined();
      expect(migrated![key as keyof typeof migrated]).not.toBeNull();
    }
  });

  it('rejects garbage without throwing', () => {
    expect(migrateState(null)).toBeNull();
    expect(migrateState('nope')).toBeNull();
    expect(migrateState({ version: 3 })).toBeNull();
    store.set('hearth:save', '{corrupt');
    expect(loadState()).toBeNull();
  });
});

describe('export / import', () => {
  it('export produces JSON that import accepts', () => {
    saveState(Game.freshState(1000));
    const json = exportSave();
    expect(json).toBeTruthy();
    clearSave();
    const imported = importSave(json!);
    expect(imported).not.toBeNull();
    expect(imported!.version).toBe(CURRENT_VERSION);
  });

  it('import rejects invalid payloads without altering storage', () => {
    saveState(Game.freshState(1000));
    const before = exportSave();
    expect(importSave('{"version":1}')).toBeNull();
    expect(exportSave()).toBe(before);
  });
});

describe('sanitizer completeness (audit C3)', () => {
  it('rejects a migrated save missing a required numeric field', () => {
    const g = new Game(Date.now());
    const raw = JSON.parse(JSON.stringify(g.snapshot)) as Record<string, unknown>;
    delete raw.coins;
    expect(migrateState(raw)).toBeNull();
  });

  it('rejects a save missing a required object/array field', () => {
    const g = new Game(Date.now());
    for (const key of ['repository', 'decor', 'achievements', 'flags', 'storySeen']) {
      const raw = JSON.parse(JSON.stringify(g.snapshot)) as Record<string, unknown>;
      delete raw[key];
      expect(migrateState(raw), `missing ${key} should be rejected`).toBeNull();
    }
  });

  it('accepts legitimate zero values (a brand-new village has coins 0)', () => {
    const g = new Game(Date.now());
    const raw = JSON.parse(JSON.stringify(g.snapshot)) as Record<string, unknown>;
    raw.coins = 0;
    raw.xp = 0;
    raw.orderIndex = 0;
    raw.duelStreak = 0;
    expect(migrateState(raw)).not.toBeNull();
  });
});

describe('beginDay chronicle gate (audit C4)', () => {
  it('writes yesterday to the Chronicle exactly once, then stays quiet on later ticks', () => {
    const t0 = new Date('2026-07-07T13:00:00').getTime();
    const g = new Game(t0);
    const events: string[] = [];
    g.subscribe((ev) => events.push(ev.type));
    const nextDay = new Date('2026-07-08T04:00:30').getTime(); // the day turns at 4am
    g.tick(nextDay); // first tick after the 4am turn: chronicle written once
    const chronicles1 = events.filter((e) => e === 'chronicle').length;
    expect(chronicles1).toBe(1);
    const before = events.length;
    g.tick(nextDay + 20_000); // the 20s heartbeat — must NOT rewrite/emit chronicle
    g.tick(nextDay + 40_000);
    const chroniclesAfter = events.filter((e) => e === 'chronicle').length;
    expect(chroniclesAfter).toBe(1);
    // and no state-rebuild churn from the chronicle branch either (regen may
    // legitimately emit 'state' when energy accrues — allow only those)
    const newEvents = events.slice(before);
    expect(newEvents.every((e) => e === 'state')).toBe(true);
  });
});
