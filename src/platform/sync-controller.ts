/**
 * Orchestrates cloud sync around the Game: pull-and-reconcile on start,
 * debounced push on change. Transport and conflict policy live in
 * sync-provider.ts; this is the thin wiring that keeps a local revision
 * counter and talks to the save layer.
 *
 * Deliberately conservative: a remote save only replaces the local one when
 * the player has NOT already progressed locally (local rev at baseline). Any
 * genuine two-sided edit is surfaced to the UI to decide — we never silently
 * overwrite progress. That is the same promise the save migrations make.
 */
import type { Game } from '../core/game';
import { exportSave, importSave } from '../core/save';
import { resolveSync } from './sync-provider';
import type { SyncEnvelope, SyncProvider } from './sync-provider';

const REV_KEY = 'hearth:sync-rev';
// The local rev as of the last CONFIRMED cloud sync (successful push, adopt, or
// seed). Persisted separately from REV_KEY so that local edits which never
// reached the cloud (offline pushes) leave rev > base — the signal that this
// device has diverged. Reading the baseline from REV_KEY itself (the old bug)
// made rev === base at every launch, so the conflict branch was unreachable and
// a newer remote silently overwrote un-pushed local progress.
const BASE_KEY = 'hearth:sync-base';
const PUSH_DEBOUNCE_MS = 4000;

export interface SyncStartResult {
  /** 'adopted' = took the cloud save; 'pushed' = seeded cloud from local;
   *  'conflict' = both sides changed, UI must choose; 'noop' = nothing to do. */
  outcome: 'adopted' | 'pushed' | 'conflict' | 'noop';
  remote?: SyncEnvelope;
}

export class SyncController {
  private timer = 0;
  private baselineRev: number;

  constructor(
    private game: Game,
    private provider: SyncProvider,
    private now: () => number = () => Date.now(),
  ) {
    this.baselineRev = readBase();
  }

  /** Mark the local save as in-sync with the cloud at `rev` (persisted). */
  private setBaseline(rev: number): void {
    this.baselineRev = rev;
    writeBase(rev);
  }

  private localEnvelope(): SyncEnvelope | null {
    const save = exportSave();
    if (!save) return null;
    return { rev: readRev(), updatedAt: this.now(), save };
  }

  /**
   * Reconcile with the cloud once at launch. Adopts a strictly-newer remote
   * only when local hasn't advanced past its last-synced baseline; otherwise
   * flags a conflict for the UI. Seeds the cloud if it's empty.
   */
  async start(): Promise<SyncStartResult> {
    const remote = await this.provider.pull();
    const local = this.localEnvelope();
    const winner = resolveSync(local, remote);

    if (winner === 'remote' && remote) {
      // Local edits that never reached the cloud since our last sync? Then
      // adopting the remote would silently wipe them — surface a conflict.
      const localAdvanced = local ? local.rev > this.baselineRev : false;
      if (localAdvanced) return { outcome: 'conflict', remote };
      const state = importSave(remote.save);
      if (state) {
        writeRev(remote.rev);
        this.setBaseline(remote.rev);
        this.wirePush();
        return { outcome: 'adopted', remote };
      }
    }

    if (winner === 'local' && local) {
      const ok = await this.provider.push(local);
      if (ok) this.setBaseline(local.rev); // only in-sync once the cloud confirmed
      this.wirePush();
      return { outcome: 'pushed' };
    }

    if (winner === 'same' && local) this.setBaseline(local.rev);
    this.wirePush();
    return remote ? { outcome: 'noop', remote } : { outcome: 'noop' };
  }

  /** Force-adopt the remote save (UI's answer to a conflict). */
  async adoptRemote(remote: SyncEnvelope): Promise<boolean> {
    const state = importSave(remote.save);
    if (!state) return false;
    writeRev(remote.rev);
    this.setBaseline(remote.rev);
    return true;
  }

  /**
   * Force-push local over remote (UI's answer to a conflict). Returns whether the
   * push reached the cloud. The rev must clear BOTH sides — the server rejects any
   * write that isn't strictly newer, so bumping only past the local baseline lets a
   * higher remote rev 409 the push and silently lose the save the player chose.
   */
  async keepLocal(remote?: SyncEnvelope): Promise<boolean> {
    const env = this.localEnvelope();
    if (!env) return false;
    const rev = Math.max(env.rev, remote?.rev ?? 0) + 1;
    writeRev(rev);
    const ok = await this.provider.push({ ...env, rev });
    if (ok) this.setBaseline(rev); // only in-sync once the cloud confirmed
    return ok;
  }

  /** After reconciliation, every meaningful change schedules a debounced push. */
  private wirePush(): void {
    this.game.subscribe((ev) => {
      if (ev.type === 'state') return; // 'state' is a repaint echo of a real event
      this.schedulePush();
    });
  }

  private schedulePush(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.pushNow(), PUSH_DEBOUNCE_MS) as unknown as number;
  }

  async pushNow(): Promise<void> {
    const save = exportSave();
    if (!save) return;
    const rev = readRev() + 1;
    writeRev(rev);
    const ok = await this.provider.push({ rev, updatedAt: this.now(), save });
    if (ok) this.setBaseline(rev); // a failed push leaves rev > base = "diverged"
  }
}

function readRev(): number {
  return readNum(REV_KEY);
}

function writeRev(rev: number): void {
  writeNum(REV_KEY, rev);
}

function readBase(): number {
  return readNum(BASE_KEY);
}

function writeBase(rev: number): void {
  writeNum(BASE_KEY, rev);
}

function readNum(key: string): number {
  try {
    return Number(localStorage.getItem(key) ?? 0) || 0;
  } catch {
    return 0;
  }
}

function writeNum(key: string, n: number): void {
  try {
    localStorage.setItem(key, String(n));
  } catch {
    /* best-effort */
  }
}
