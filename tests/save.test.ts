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
