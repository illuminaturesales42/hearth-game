/**
 * Versioned persistence with a migration chain. From v8 onward a schema bump
 * MUST ship a migration — public testers' progress is never wiped again.
 * Rotating backups (3 slots, refreshed at most once per hour) guard against
 * corruption, and export/import gives players a manual lifeline.
 */
import type { GameState, MinigameState } from './types';
import { localDayKey } from './energy';
import { initialMinigames } from './minigames';

export const CURRENT_VERSION = 17;

const KEY = 'hearth:save';
/** Older builds wrote the version into the key. Read them once, then adopt KEY. */
const LEGACY_KEYS = ['hearth:save:v8', 'hearth:save:v7', 'hearth:save:v6', 'hearth:save:v5'];
const BACKUP_KEYS = ['hearth:backup:1', 'hearth:backup:2', 'hearth:backup:3'];
const BACKUP_STAMP = 'hearth:backup:at';
const BACKUP_EVERY_MS = 60 * 60 * 1000;

export function defaultPrefs(): GameState['prefs'] {
  return { musicVol: 0.7, sfxVol: 1, textScale: 1, highContrast: false, forceReducedMotion: false };
}

/**
 * Migration chain: each entry upgrades exactly one version. Keep every step
 * forever; a v8 export imported in 2027 must still climb to current.
 */
type LooseState = GameState & { version: number } & Record<string, unknown>;
const MIGRATIONS: Record<number, (s: LooseState) => LooseState> = {
  // v8 → v9: user prefs (settings screen) join the save.
  8: (s) => ({ ...s, version: 9, prefs: defaultPrefs() }),
  // v9 → v10: Chronicle, stats counters, achievements, daily quests, flags.
  9: (s) => {
    const day = (s.actions as { day?: string } | undefined)?.day ?? '1970-01-01';
    return {
      ...s,
      version: 10,
      chronicle: { entries: [] },
      stats: { merges: 0, duelWins: 0, flashbacks: 0, day, dayMerges: 0, dayDelivers: 0, dayActions: 0 },
      achievements: [],
      questsClaimed: [],
      flags: { ftueDone: true, windDownShown: false }, // existing players skip the tutorial
    };
  },
  // v10 → v11: wellbeing signals + player-placed town decor.
  10: (s) => ({ ...s, version: 11, wellbeing: { lastCalmDay: null }, decor: [], nextDecorId: 1 }),
  // v11 → v12: villager relationships (Codex Book III).
  11: (s) => ({ ...s, version: 12, relationships: {} }),
  // v12 → v13: building upgrade tiers.
  12: (s) => ({ ...s, version: 13, buildingUpgrades: {} }),
  // v13 → v14: Village Life mini-games (post-story building games).
  13: (s) => ({ ...s, version: 14, minigames: initialMinigames(localDayKey(Date.now())) }),
  // v14 → v15: per-game personal bests on the minigame state.
  14: (s) => {
    const mg = (s.minigames as MinigameState | undefined) ?? initialMinigames(localDayKey(Date.now()));
    return { ...s, version: 15, minigames: { ...mg, bests: mg.bests ?? {} } };
  },
  // v15 → v16: the Keeper's Almanac (a collection stamped by mini-game finds).
  // Existing villages start with an empty book — nothing is ever missed, so
  // there's nothing to back-fill; the next catch writes the first page.
  15: (s) => ({ ...s, version: 16, almanac: {} }),
  // v16 → v17: discovery-glow record. Optional field, so no back-fill and no
  // presence-guard change — a returning player simply sees the glows for
  // whatever they've not engaged with yet.
  16: (s) => ({ ...s, version: 17, discovered: [] }),
};

/** Upgrade any historical state to CURRENT_VERSION, or null if unrecognizable. */
export function migrateState(raw: unknown): GameState | null {
  if (!raw || typeof raw !== 'object') return null;
  let s = raw as LooseState;
  if (typeof s.version !== 'number') return null;
  // Heal the historical stamp bug: builds that wrote `version: 6` while already
  // carrying the v8 shape (repository + settings present).
  if (s.version < 8 && 'repository' in s && 'settings' in s) s = { ...s, version: 8 };
  if (s.version < 8) return null; // pre-tester prototypes: no migration promise
  while (s.version < CURRENT_VERSION) {
    const step = MIGRATIONS[s.version];
    if (!step) return null;
    s = step(s);
  }
  if (s.version !== CURRENT_VERSION) return null;
  // Every non-optional GameState field must be present — a truncated or
  // corrupt save that passed the migration chain must still be rejected here,
  // never loaded half-broken (and then re-saved over the player's village).
  if (
    !s.board ||
    !s.energy ||
    !s.actions ||
    !s.social ||
    !s.gratitude ||
    !s.settings ||
    !s.prefs ||
    !s.stats ||
    !s.chronicle ||
    !s.wellbeing ||
    !s.relationships ||
    !s.buildingUpgrades ||
    !s.minigames ||
    !s.almanac ||
    !s.achievements ||
    !s.questsClaimed ||
    !s.flags ||
    !s.decor ||
    !s.repository ||
    !s.storySeen
  )
    return null;
  // Numeric fields are checked for presence, not truthiness — 0 is a
  // perfectly valid value for all of them (a brand-new village has coins 0).
  for (const key of ['coins', 'xp', 'orderIndex', 'duelStreak', 'nextUid', 'nextDecorId'] as const) {
    if (typeof (s as Record<string, unknown>)[key] !== 'number') return null;
  }
  return s;
}

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable (private mode). Play continues in-memory.
  }
}

export function loadState(): GameState | null {
  try {
    let raw = localStorage.getItem(KEY);
    if (!raw) {
      for (const legacy of LEGACY_KEYS) {
        raw = localStorage.getItem(legacy);
        if (raw) break;
      }
    }
    if (!raw) return null;
    rotateBackup(raw);
    const state = migrateState(JSON.parse(raw));
    if (state) saveState(state); // persist migrated shape under the current key
    return state;
  } catch {
    return null;
  }
}

/** Keep 3 rotating snapshots, refreshed at most hourly (called on load). */
function rotateBackup(raw: string): void {
  try {
    const last = Number(localStorage.getItem(BACKUP_STAMP) ?? 0);
    if (Date.now() - last < BACKUP_EVERY_MS) return;
    for (let i = BACKUP_KEYS.length - 1; i > 0; i--) {
      const prev = localStorage.getItem(BACKUP_KEYS[i - 1]!);
      if (prev) localStorage.setItem(BACKUP_KEYS[i]!, prev);
    }
    localStorage.setItem(BACKUP_KEYS[0]!, raw);
    localStorage.setItem(BACKUP_STAMP, String(Date.now()));
  } catch {
    /* backups are best-effort */
  }
}

/** Serialized save for manual export (Settings). */
export function exportSave(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** Import a pasted save. Runs the full migration chain; returns the state or null. */
export function importSave(json: string): GameState | null {
  try {
    const state = migrateState(JSON.parse(json));
    if (state) saveState(state);
    return state;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
  } catch {
    /* ignore */
  }
}
