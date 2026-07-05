/**
 * Versioned localStorage persistence. Cloud save replaces the storage
 * backend in M2; the (de)serialization contract stays.
 */
import type { GameState } from './types';

const KEY = 'hearth:save:v4';

export function saveState(state: GameState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable (private mode). Play continues in-memory.
  }
}

export function loadState(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    if (parsed.version !== 4 || !parsed.board || !parsed.energy || !parsed.actions || !parsed.social) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
