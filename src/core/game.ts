/**
 * Game orchestrator: owns GameState, exposes actions, notifies subscribers.
 * UI layers subscribe; core stays DOM-free.
 */
import type { GameState, Item } from './types';
import {
  chainDef,
  createBoard,
  dropItem,
  emptyIndices,
  findItem,
  findMergePair,
  itemAt,
  maxLevel,
  tidyBoard,
  toggleLock,
  trashMatching,
  withEmpty,
  withItem,
} from './board';
import { COLLECTIONS } from '../data/world';
import { accrueRegen, canSpend, grant, initialEnergy, spend } from './energy';
import {
  BOARD_COLS,
  BOARD_ROWS,
  CHAPTERS,
  ENERGY,
  ORDERS,
  PRODUCER_INDEX,
  RESOURCE_SPAWN_TABLE,
  SPAWN_TABLE,
  WORKSHOP_UNLOCK_AT,
  ZONE_STAGES,
  sellValue,
  stageFor,
} from '../data/economy';
import { stampItems, type AlmanacPage, type AlmanacState } from './almanac';
import { pendingNudges } from './discovery';
import { appendEntry, composeEntry, rolloverStats } from './chronicle';
import { newlyEarned } from './achievements';
import { questMultiplier, questsForDay } from '../data/daily-quests';
import { newMilestones } from '../data/milestones';
import { requestsForDay, type TownRequest } from '../data/town-requests';
import { CURRENT_VERSION, defaultPrefs, loadState, saveState } from './save';
import { applySnapshot, initialLedger } from '../health/health-energy';
import type { HealthSnapshot } from '../health/health-provider';
import {
  advanceDay,
  canDoAction,
  initialActionState,
  recordAction,
  rolloverActions,
  streakMultiplier,
} from './actions';
import type { RecordResult } from './actions';
import { localDayKey } from './energy';
import { LOG_MEDITATION, loggedMinutesToEnergy } from '../data/meditations';
import { findRecovery, recoveryEnergy } from '../data/recovery';
import { GRATITUDE, initialGratitude } from '../data/gratitude';
import { KINDNESS } from '../data/kindness';
import { askFriend, canAsk, initialSocial, invite, joinFriend, pickInviteName, takeGift } from './social';
import { STARGAZE, fullMoonBonus, phaseName } from '../data/moon';
import { isNight } from './sun';
import type { Coords } from './sun';
import { addToRepository, duelMultiplier } from './duel';
import { repoRequestsFor, takeFromRepository, type RepoRequest } from './repository';
import {
  MINIGAME_ENERGY_COST,
  addEmber,
  grantToken,
  initialMinigames,
  isEligible,
  isUnlocked,
  recordBest,
  rolloverMinigames,
  spendToken,
  storyComplete,
  tryUnlock,
  type MgReward,
  type UnlockOutcome,
} from './minigames';
import { MINIGAMES, MINIGAME_BY_ID, WISHES, minigameForBuilding, type MinigameDef } from '../data/minigames';
import { orderAt } from '../data/endless';
import { DECOR_CATALOG, TOWN_BUILDINGS, BUILDING_INFO, returnsAt } from '../data/town-layout';
import { bondFor, deliveryMemory, hearts, recordMemory, restoreMemory } from './relationships';
import { villagerIdFor, villagerDef } from '../data/villagers';
import type {
  ActionState,
  ChainId,
  GratitudeEntry,
  GratitudeState,
  MinigameState,
  OrderDef,
  RepositoryItem,
  Settings,
  SocialState,
} from './types';

/** Why a building's mini-game is (or isn't) playable right now. */
export type MinigameReason = 'ready' | 'no-tokens' | 'no-energy' | 'locked-story' | 'locked-l2';

/** A building's mini-game and its current playability. Shared source of truth
 *  for the building card and the Village Life index (see ui/minigame-cta.ts). */
export interface MinigameStatus {
  def: MinigameDef;
  unlocked: boolean;
  canPlay: boolean;
  tokens: number;
  reason: MinigameReason;
  /** When 'locked-story': orders left until the game's building returns. */
  ordersToGo?: number;
  /** The player's personal best for this game (0-100 score), if any. */
  best?: number;
}

export type GameEvent =
  | { type: 'state' }
  | { type: 'spawn'; index: number }
  | { type: 'merge'; index: number; item: Item }
  | { type: 'reject'; index: number; reason: 'energy' | 'full' | 'invalid' }
  | { type: 'sold'; coins: number }
  | { type: 'bought'; label: string; coins: number }
  | { type: 'requestDone'; who: string; coins: number }
  | { type: 'zoneRestored'; label: string; at: number }
  | { type: 'collectionDone'; name: string; coins: number }
  | { type: 'delivered'; orderId: string; resolution: string; rewardEnergy: number; rewardCoins: number }
  | { type: 'action'; actionId: string; energy: number }
  | { type: 'chest'; coins: number }
  | {
      type: 'health';
      energy: number;
      fromSteps: number;
      fromStairs: number;
      fromSleep: number;
      sleepFullNight: boolean;
    }
  | { type: 'social' }
  | { type: 'friendJoined'; name: string; energy: number }
  | { type: 'help'; from: string; count: number }
  | { type: 'daily'; energy: number; streak: number }
  | { type: 'newDay'; streak: number; energy: number; chestCoins: number }
  | { type: 'streakSaved'; freezesLeft: number }
  | { type: 'gratitude'; energy: number; multiplier: number }
  | { type: 'flashback'; text: string; energy: number }
  | { type: 'stargaze'; energy: number; moon: string }
  | { type: 'kindness'; energy: number; selfie: boolean }
  | { type: 'achievement'; id: string; title: string; icon: string; coins: number }
  | { type: 'questDone'; label: string; coins: number }
  | { type: 'milestone'; days: number; coins: number; title: string; note: string }
  | { type: 'chronicle'; day: string }
  | { type: 'bond'; villagerId: string; name: string; hearts: number; grew: boolean }
  | { type: 'upgrade'; art: string; tier: number; coins: number }
  | { type: 'decor' }
  | { type: 'settings' }
  | { type: 'duelEnd'; won: boolean; streak: number; multiplier: number; coins: number; itemCount: number }
  | { type: 'minigameUnlocked'; id: string; title: string }
  | { type: 'minigameEnd'; id: string; title: string; coins: number; ember: number; itemCount: number; wish?: string }
  | { type: 'repoGiven'; who: string; chain: ChainId; level: number; coins: number }
  | { type: 'chapterComplete'; chapter: number; title: string; cliffhanger: string; hasNext: boolean };

type Listener = (ev: GameEvent) => void;

export class Game {
  private state: GameState;
  private listeners: Listener[] = [];
  /** Tester convenience: unlimited mini-game goes (no token/energy cost). Off in
   *  normal play; turned on by the ?tester opt-in (see main.ts). Never persisted. */
  private testerUnlimited = false;

  constructor(now = Date.now()) {
    this.state = loadState() ?? Game.freshState(now);
    this.beginDay(now); // yesterday's Chronicle entry before anything rolls
    this.state = {
      ...this.state,
      energy: accrueRegen(this.state.energy, now),
      actions: rolloverActions(this.state.actions, now),
    };
  }

  static freshState(now: number): GameState {
    let board = createBoard(BOARD_COLS, BOARD_ROWS, PRODUCER_INDEX);
    // Opening layout: enough to teach merging in the first 20 seconds.
    const seeds: { i: number; chain: Item['chain']; level: number }[] = [
      { i: 8, chain: 'wood', level: 0 },
      { i: 9, chain: 'wood', level: 0 }, // adjacent to i:8 so the first taught merge needs no reach
      { i: 14, chain: 'wood', level: 1 },
      { i: 26, chain: 'wood', level: 1 },
      { i: 27, chain: 'harvest', level: 0 },
      { i: 29, chain: 'harvest', level: 0 },
      { i: 33, chain: 'hearthfire', level: 0 },
      { i: 35, chain: 'hearthfire', level: 0 },
    ];
    let uid = 1;
    for (const s of seeds) board = withItem(board, s.i, { chain: s.chain, level: s.level, uid: uid++ });
    return {
      version: CURRENT_VERSION,
      board,
      energy: initialEnergy(now),
      actions: initialActionState(now),
      social: initialSocial(now),
      gratitude: initialGratitude(now),
      settings: { autoMerge: false },
      prefs: defaultPrefs(),
      chronicle: { entries: [] },
      stats: {
        merges: 0,
        duelWins: 0,
        flashbacks: 0,
        day: localDayKey(now),
        dayMerges: 0,
        dayDelivers: 0,
        dayActions: 0,
      },
      achievements: [],
      questsClaimed: [],
      flags: { ftueDone: false, windDownShown: false },
      wellbeing: { lastCalmDay: null },
      relationships: {},
      buildingUpgrades: {},
      decor: [],
      nextDecorId: 1,
      minigames: initialMinigames(localDayKey(now)),
      almanac: {},
      discovered: [],
      repository: [],
      duelStreak: 0,
      coins: 0,
      xp: 0,
      orderIndex: 0,
      storySeen: [],
      nextUid: uid,
    };
  }

  get snapshot(): GameState {
    return this.state;
  }

  /** The order the village currently wants: authored story order, then endless town-needs. */
  currentOrder(): OrderDef {
    return orderAt(this.state.orderIndex);
  }

  get actionState(): ActionState {
    return this.state.actions;
  }

  get socialState(): SocialState {
    return this.state.social;
  }

  // ---------- social ----------

  /** Invite a friend. Returns a shareable code; a pending friend is added. */
  inviteFriend(now = Date.now()): { code: string; name: string } {
    void now;
    const name = pickInviteName(this.state.social);
    const res = invite(this.state.social, name);
    this.state = { ...this.state, social: res.state };
    this.emit({ type: 'social' });
    return {
      code: res.friend.id.toUpperCase() + Math.abs(hashCode(res.friend.id)).toString(36).slice(0, 4).toUpperCase(),
      name,
    };
  }

  /** Simulate a friend accepting the invite (real backend fires this on their join). */
  markFriendJoined(id: string): void {
    const res = joinFriend(this.state.social, id);
    this.state = { ...this.state, social: res.state };
    if (res.bonus > 0) this.state = { ...this.state, energy: grant(this.state.energy, res.bonus) };
    this.emit({ type: 'friendJoined', name: res.name, energy: res.bonus });
    this.emit({ type: 'social' });
  }

  canAskFriend(id: string, now = Date.now()): boolean {
    return canAsk(this.state.social, id, now);
  }

  /** Ask a friend for help; they send starter items of the current task's chain. */
  askFriendForHelp(id: string, now = Date.now()): void {
    const chain: ChainId = this.currentOrder().need.chain;
    const res = askFriend(this.state.social, id, chain, now);
    if (res.gifts.length === 0) {
      this.emit({ type: 'social' });
      return;
    }
    this.state = { ...this.state, social: res.state };
    this.emit({ type: 'help', from: res.name, count: res.gifts.length });
    this.emit({ type: 'social' });
  }

  /** Place a received gift onto the first empty board cell. */
  claimGift(giftId: string): void {
    const gift = this.state.social.gifts.find((g) => g.id === giftId);
    if (!gift) return;
    const empties = emptyIndices(this.state.board);
    if (empties.length === 0) {
      this.emit({ type: 'reject', index: -1, reason: 'full' });
      return;
    }
    const res = takeGift(this.state.social, giftId);
    const index = empties[0]!;
    const item: Item = { chain: gift.chain, level: gift.level, uid: this.state.nextUid };
    this.undoBoard = null;
    this.state = {
      ...this.state,
      social: res.state,
      board: withItem(this.state.board, index, item),
      nextUid: this.state.nextUid + 1,
    };
    this.emit({ type: 'spawn', index });
    this.emit({ type: 'social' });
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private processing = false;

  private emit(ev: GameEvent): void {
    // Progression sweep: daily quests auto-complete and achievements grant
    // themselves off the new state, queued as follow-up events (no recursion).
    const extra: GameEvent[] = [];
    if (!this.processing) {
      this.processing = true;
      const streak = this.state.actions.streak;
      const mult = questMultiplier(streak);
      for (const q of questsForDay(this.state.stats.day)) {
        if (!this.state.questsClaimed.includes(q.id) && q.progress(this.state) >= q.target) {
          const coins = Math.round(q.coins * mult); // regulars earn a little more
          this.state = {
            ...this.state,
            questsClaimed: [...this.state.questsClaimed, q.id],
            coins: this.state.coins + coins,
          };
          extra.push({ type: 'questDone', label: q.label, coins });
        }
      }
      for (const a of newlyEarned(this.state)) {
        this.state = {
          ...this.state,
          achievements: [...this.state.achievements, a.id],
          coins: this.state.coins + a.coins,
        };
        extra.push({ type: 'achievement', id: a.id, title: a.title, icon: a.icon, coins: a.coins });
      }
      for (const m of newMilestones(streak, this.state.milestonesSeen ?? [])) {
        this.state = {
          ...this.state,
          milestonesSeen: [...(this.state.milestonesSeen ?? []), m.id],
          coins: this.state.coins + m.coins,
        };
        extra.push({ type: 'milestone', days: m.at, coins: m.coins, title: m.title, note: m.note });
      }
      // Collection mastery: reaching a chain's top tier completes its set.
      const claimed = new Set(this.state.collectionsClaimed ?? []);
      for (const col of COLLECTIONS) {
        if (claimed.has(col.id)) continue;
        if ((this.state.maxTier?.[col.chain] ?? 0) >= maxLevel(col.chain)) {
          this.state = {
            ...this.state,
            collectionsClaimed: [...(this.state.collectionsClaimed ?? []), col.id],
            coins: this.state.coins + col.coins,
          };
          extra.push({ type: 'collectionDone', name: col.name, coins: col.coins });
        }
      }
      this.processing = false;
    }
    saveState(this.state);
    this.dispatch(ev);
    for (const e of extra) this.dispatch(e);
    if (ev.type !== 'state') this.dispatch({ type: 'state' });
  }

  /** Fan an event out to every subscriber; one throwing listener can't wedge the rest. */
  private dispatch(ev: GameEvent): void {
    for (const l of this.listeners) {
      try {
        l(ev);
      } catch (err) {
        // A broken UI subscriber must never halt the game loop or other views.
        console.error('Hearth: listener error', err);
      }
    }
  }

  /**
   * Day boundary: before any counts roll over, yesterday writes itself into
   * the Chronicle; per-day stats and claimed quests reset. Idempotent.
   */
  private beginDay(now: number): void {
    const today = localDayKey(now);
    // Write yesterday into the Chronicle exactly once. `actions.day` only
    // advances when the player logs an action (rolloverActions is lazy), so
    // without the last-entry check this branch re-entered on EVERY 20s tick
    // after midnight — rebuilding state, emitting, and re-saving each time
    // until the first action of the day. The chronicle's own last entry is the
    // persisted "already written" marker; appendEntry's dedupe stays as belt.
    if (this.state.actions.day !== today && this.state.chronicle.entries.at(-1)?.day !== this.state.actions.day) {
      const a = this.state.actions;
      const entry = composeEntry(
        a.day,
        a.counts,
        a.streak,
        stageFor(this.state.orderIndex),
        this.state.stats.dayDelivers,
      );
      this.state = { ...this.state, chronicle: { entries: appendEntry(this.state.chronicle.entries, entry) } };
      this.emit({ type: 'chronicle', day: entry.day });
    }
    if (this.state.stats.day !== today) {
      this.state = {
        ...this.state,
        stats: rolloverStats(this.state.stats, today),
        questsClaimed: [],
        requestsFilled: [],
        minigames: rolloverMinigames(this.state.minigames, today),
      };
    }
  }

  private bumpStat(patch: Partial<GameState['stats']>): void {
    this.state = { ...this.state, stats: { ...this.state.stats, ...patch } };
  }

  /** Call on a timer to accrue passive regen (and roll the day at midnight). */
  tick(now = Date.now()): void {
    this.beginDay(now);
    const next = accrueRegen(this.state.energy, now);
    if (next !== this.state.energy) {
      this.state = { ...this.state, energy: next };
      this.emit({ type: 'state' });
    }
  }

  tapProducer(now = Date.now()): void {
    this.state = { ...this.state, energy: accrueRegen(this.state.energy, now) };
    if (!canSpend(this.state.energy, ENERGY.spawnCost)) {
      this.emit({ type: 'reject', index: PRODUCER_INDEX, reason: 'energy' });
      return;
    }
    const empties = emptyIndices(this.state.board);
    if (empties.length === 0) {
      this.emit({ type: 'reject', index: PRODUCER_INDEX, reason: 'full' });
      return;
    }
    const table = this.workshopMode() ? RESOURCE_SPAWN_TABLE : SPAWN_TABLE;
    const chain = pickSpawnChain(Math.random, table);
    const index = empties[Math.floor(Math.random() * empties.length)]!;
    const item: Item = { chain, level: 0, uid: this.state.nextUid };
    this.undoBoard = null;
    this.state = {
      ...this.state,
      energy: spend(this.state.energy, ENERGY.spawnCost),
      board: withItem(this.state.board, index, item),
      nextUid: this.state.nextUid + 1,
    };
    this.emit({ type: 'spawn', index });
  }

  /** The Workshop side-economy unlocks part-way through Chapter 1. */
  workshopUnlocked(): boolean {
    return this.state.orderIndex >= WORKSHOP_UNLOCK_AT;
  }

  /** Whether the producer is currently spawning craft resources. */
  workshopMode(): boolean {
    return this.workshopUnlocked() && this.state.producerMode === 'workshop';
  }

  /** Flip the producer between story goods and craft resources. */
  toggleProducerMode(): void {
    if (!this.workshopUnlocked()) return;
    const producerMode = this.state.producerMode === 'workshop' ? 'story' : 'workshop';
    this.state = { ...this.state, producerMode };
    this.emit({ type: 'state' });
  }

  /** Today's town requests still open (empty until the Workshop is unlocked). */
  activeRequests(): TownRequest[] {
    if (!this.workshopUnlocked()) return [];
    const filled = new Set(this.state.requestsFilled ?? []);
    return requestsForDay(this.state.stats.day).filter((r) => !filled.has(r.id));
  }

  /** How many unlocked board items match a chain+level (for request checks). */
  countMatching(chain: ChainId, level: number): number {
    return this.state.board.cells.filter(
      (c) => c.kind === 'item' && c.item.chain === chain && c.item.level === level && !c.item.locked,
    ).length;
  }

  canFulfil(req: TownRequest): boolean {
    return this.countMatching(req.chain, req.level) >= req.qty;
  }

  /** Hand a town request its items from the board, in exchange for coins. */
  fulfilRequest(id: string): boolean {
    const req = requestsForDay(this.state.stats.day).find((r) => r.id === id);
    if (!req || (this.state.requestsFilled ?? []).includes(id) || !this.canFulfil(req)) return false;
    // remove qty matching, unlocked items
    let removed = 0;
    const cells = this.state.board.cells.map((c) => {
      if (
        removed < req.qty &&
        c.kind === 'item' &&
        c.item.chain === req.chain &&
        c.item.level === req.level &&
        !c.item.locked
      ) {
        removed++;
        return { kind: 'empty' as const };
      }
      return c;
    });
    this.undoBoard = null;
    this.state = {
      ...this.state,
      board: { ...this.state.board, cells },
      coins: this.state.coins + req.coins,
      requestsFilled: [...(this.state.requestsFilled ?? []), id],
    };
    this.emit({ type: 'requestDone', who: req.who, coins: req.coins });
    return true;
  }

  /** Sell a board item for coins (a modest sink for surplus resources). */
  sellItem(index: number): number {
    const it = itemAt(this.state.board, index);
    if (!it || it.locked) return 0;
    const coins = sellValue(it.chain, it.level);
    this.undoBoard = null;
    this.state = { ...this.state, coins: this.state.coins + coins, board: withEmpty(this.state.board, index) };
    this.emit({ type: 'sold', coins });
    return coins;
  }

  /** Session-only snapshot for single-step merge undo (never saved). */
  private undoBoard: GameState['board'] | null = null;

  drop(from: number, to: number): void {
    this.beginDay(Date.now());
    const before = this.state.board;
    const res = dropItem(this.state.board, from, to, this.state.nextUid);
    if (res.board === this.state.board) {
      this.emit({ type: 'reject', index: to, reason: 'invalid' });
      return;
    }
    this.undoBoard = res.merged ? before : null;
    const tierPatch =
      res.merged && res.result
        ? {
            maxTier: {
              ...(this.state.maxTier ?? {}),
              [res.result.chain]: Math.max(this.state.maxTier?.[res.result.chain] ?? 0, res.result.level),
            },
          }
        : {};
    this.state = {
      ...this.state,
      board: res.board,
      nextUid: res.merged ? this.state.nextUid + 1 : this.state.nextUid,
      xp: res.merged ? this.state.xp + (res.result?.level ?? 0) : this.state.xp,
      ...tierPatch,
    };
    if (res.merged) {
      this.bumpStat({ merges: this.state.stats.merges + 1, dayMerges: this.state.stats.dayMerges + 1 });
    }
    if (res.merged && res.result) this.emit({ type: 'merge', index: to, item: res.result });
    else this.emit({ type: 'state' });
  }

  canUndoMerge(): boolean {
    return this.undoBoard !== null;
  }

  /** Take back the last merge (one step; cleared by any other board change). */
  undoLastMerge(): void {
    if (!this.undoBoard) return;
    this.state = { ...this.state, board: this.undoBoard };
    this.undoBoard = null;
    this.emit({ type: 'state' });
  }

  /** Remove an item from the board (confirmed in the UI). No refunds, no drama. */
  trashItem(index: number): void {
    if (!itemAt(this.state.board, index)) return;
    this.undoBoard = null;
    this.state = { ...this.state, board: withEmpty(this.state.board, index) };
    this.emit({ type: 'state' });
  }

  /** Compact + group the board so it reads tidy. */
  tidy(): void {
    this.undoBoard = null;
    this.state = { ...this.state, board: tidyBoard(this.state.board) };
    this.emit({ type: 'state' });
  }

  /** Pin/unpin an item so it can't be dragged, auto-merged, or bulk-cleared. */
  toggleLock(index: number): void {
    this.state = { ...this.state, board: toggleLock(this.state.board, index) };
    this.emit({ type: 'state' });
  }

  /** Clear all unlocked items of a chain at or below `maxLvl`. Returns count. */
  clearMatching(chain: ChainId, maxLvl: number): number {
    const res = trashMatching(this.state.board, chain, maxLvl);
    if (res.cleared === 0) return 0;
    this.undoBoard = null;
    this.state = { ...this.state, board: res.board };
    this.emit({ type: 'state' });
    return res.cleared;
  }

  /** Index of the board item satisfying the current order, or -1. */
  deliverableIndex(): number {
    const order = this.currentOrder();
    return findItem(this.state.board, order.need.chain, order.need.level);
  }

  deliver(): void {
    this.beginDay(Date.now());
    const order = this.currentOrder();
    const idx = this.deliverableIndex();
    if (idx < 0) {
      this.emit({ type: 'reject', index: -1, reason: 'invalid' });
      return;
    }
    this.bumpStat({ dayDelivers: this.state.stats.dayDelivers + 1 });
    this.undoBoard = null; // undoing across a delivery would duplicate items
    this.state = {
      ...this.state,
      board: withEmpty(this.state.board, idx),
      energy: grant(this.state.energy, order.rewardEnergy),
      coins: this.state.coins + order.rewardCoins,
      orderIndex: this.state.orderIndex + 1,
      storySeen: [...this.state.storySeen, order.id],
    };
    this.emit({
      type: 'delivered',
      orderId: order.id,
      resolution: order.resolution,
      rewardEnergy: order.rewardEnergy,
      rewardCoins: order.rewardCoins,
    });
    this.recordBond(order);
    this.checkZoneRestored();
    this.emitChapterBoundary();
  }

  /** Celebrate crossing a village-restoration milestone (a zone comes back). */
  private checkZoneRestored(): void {
    const zone = ZONE_STAGES.find((z) => z.at === this.state.orderIndex && z.at > 0);
    if (zone) this.emit({ type: 'zoneRestored', label: zone.label, at: zone.at });
  }

  /**
   * A delivery is a moment between the player and a villager (Codex Book III).
   * It grows their bond and is remembered; restoring the villager's own home
   * counts double. Emitted as a 'bond' event so the UI can celebrate quietly.
   */
  private recordBond(order: OrderDef): void {
    const vid = villagerIdFor(order.who);
    if (!vid) return;
    const day = this.state.actions.day;
    const before = hearts(bondFor(this.state.relationships, vid).points);
    const itemName = chainDef(order.need.chain).levelNames[order.need.level] ?? 'what they needed';
    let rel = recordMemory(
      this.state.relationships,
      vid,
      deliveryMemory(day, villagerDef(vid)?.name ?? order.who, itemName),
    );
    // Did this delivery just bring their home back from the storm?
    const home = TOWN_BUILDINGS.find((b) => b.unlockAt === this.state.orderIndex && b.art === villagerDef(vid)?.home);
    if (home) rel = recordMemory(rel, vid, restoreMemory(day, BUILDING_INFO[home.art] ?? 'their home'));
    this.state = { ...this.state, relationships: rel };
    this.discover(`villager:${vid}`); // met at last — retire their glow
    const after = hearts(bondFor(rel, vid).points);
    this.emit({
      type: 'bond',
      villagerId: vid,
      name: villagerDef(vid)?.name ?? order.who,
      hearts: after,
      grew: after > before,
    });
  }

  /** The player's standing with a villager, for the Villagers screen. */
  bond(villagerId: string): { points: number; hearts: number } {
    const b = bondFor(this.state.relationships, villagerId);
    return { points: b.points, hearts: hearts(b.points) };
  }

  /** Fires chapterComplete when a delivery just crossed a chapter's end. */
  private emitChapterBoundary(): void {
    const done = CHAPTERS.find((c) => this.state.orderIndex === c.end);
    if (!done) return;
    this.emit({
      type: 'chapterComplete',
      chapter: done.id,
      title: done.title,
      cliffhanger: done.cliffhanger,
      hasNext: CHAPTERS.some((c) => c.start === done.end),
    });
  }

  /**
   * Sync a health snapshot into energy. Idempotent per day; safe to call on
   * every app foreground. Emits 'health' only when something was granted.
   */
  syncHealth(snap: HealthSnapshot, now = Date.now()): void {
    this.beginDay(now);
    const ledger = this.state.healthLedger ?? initialLedger(now);
    const res = applySnapshot(ledger, snap, now);
    this.state = { ...this.state, healthLedger: res.ledger };
    if (res.energy > 0) {
      this.state = { ...this.state, energy: grant(this.state.energy, res.energy) };
      this.earnMinigameToken(); // a real walk/night's sleep earns a Village Life go
      this.emit({
        type: 'health',
        energy: res.energy,
        fromSteps: res.fromSteps,
        fromStairs: res.fromStairs,
        fromSleep: res.fromSleep,
        sleepFullNight: res.sleepFullNight,
      });
    } else {
      saveState(this.state);
    }
  }

  canDoAction(actionId: string, now = Date.now()): boolean {
    return canDoAction(this.state.actions, actionId, now);
  }

  // ---------- sunrise: a new day ----------

  /** True when today's dawn reward hasn't been claimed (or earned via an action) yet. */
  canClaimDaily(now = Date.now()): boolean {
    return advanceDay(this.state.actions, now).advanced;
  }

  /** What claiming right now would give: streak, energy, and any milestone chest. */
  dailyRewardPreview(now = Date.now()): { streak: number; energy: number; chestCoins: number } {
    const adv = advanceDay(this.state.actions, now);
    return { streak: adv.state.streak, energy: adv.dailyBonus, chestCoins: adv.chestCoins };
  }

  /**
   * Claim the new day at sunrise: a fresh start, streak-scaled energy, and a
   * milestone chest on the streak cadence. Marks the day active, so the first
   * action of the day won't re-pay the bonus.
   */
  claimDaily(now = Date.now()): void {
    this.beginDay(now);
    const adv = advanceDay(this.state.actions, now);
    if (!adv.advanced) return;
    this.state = {
      ...this.state,
      actions: adv.state,
      energy: grant(this.state.energy, adv.dailyBonus),
      coins: this.state.coins + adv.chestCoins,
    };
    if (adv.usedFreeze) this.emit({ type: 'streakSaved', freezesLeft: adv.state.freezes ?? 0 });
    this.emit({ type: 'newDay', streak: adv.state.streak, energy: adv.dailyBonus, chestCoins: adv.chestCoins });
  }

  /** Hearthstones held — each auto-saves the streak across one missed day. */
  freezeCount(): number {
    return this.state.actions.freezes ?? 0;
  }

  /**
   * Complete a real-world action (photo, movement, self-report, guided
   * meditation). Sensor actions (steps/stairs/sleep) come through syncHealth.
   * Grants energy, advances streak, and opens a chest every few active days.
   */
  completeAction(actionId: string, now = Date.now()): void {
    this.applyRecord(recordAction(this.state.actions, actionId, now), actionId);
  }

  /** Log a meditation the player did outside a guided session. Once per day, capped. */
  logMeditation(minutes: number, now = Date.now()): void {
    const energy = loggedMinutesToEnergy(minutes);
    this.applyRecord(recordAction(this.state.actions, LOG_MEDITATION.id, now, energy), LOG_MEDITATION.id);
  }

  /** Log a recovery activity (cold plunge, sauna) by duration. Once per day each, capped. */
  logRecovery(activityId: string, minutes: number, now = Date.now()): void {
    const activity = findRecovery(activityId);
    if (!activity) return;
    this.applyRecord(recordAction(this.state.actions, activityId, now, recoveryEnergy(activity, minutes)), activityId);
  }

  private applyRecord(res: RecordResult, actionId: string): void {
    this.discover(`action:${actionId}`); // first log of this action retires its glow
    // The sea remembers a quiet mind: any meditation marks today calm,
    // whether or not the energy cap already paid out.
    if (actionId.startsWith('med-') || actionId === 'log-meditation') {
      this.state = { ...this.state, wellbeing: { lastCalmDay: res.state.day } };
    }
    const total = res.energy + res.dailyBonus;
    if (total <= 0 && res.chestCoins <= 0) {
      this.emit({ type: 'action', actionId, energy: 0 });
      return;
    }
    this.state = {
      ...this.state,
      actions: res.state,
      energy: grant(this.state.energy, total),
      coins: this.state.coins + res.chestCoins,
    };
    if (res.energy > 0) {
      this.bumpStat({ dayActions: this.state.stats.dayActions + 1 });
      this.earnMinigameToken(); // living well earns another go at Village Life
    }
    if (res.usedFreeze) this.emit({ type: 'streakSaved', freezesLeft: res.state.freezes ?? 0 });
    this.emit({ type: 'action', actionId, energy: res.energy });
    if (res.dailyBonus > 0) this.emit({ type: 'daily', energy: res.dailyBonus, streak: res.state.streak });
    if (res.chestCoins > 0) this.emit({ type: 'chest', coins: res.chestCoins });
  }

  // ---------- town decor (coins buy beauty, never power) ----------

  /** Place a decoration from the catalog onto the town. False when it can't land. */
  placeDecor(art: string, x: number, y: number): boolean {
    const def = DECOR_CATALOG.find((d) => d.art === art);
    if (!def || this.state.coins < def.cost) return false;
    // Keep pieces on the island — not in the sky, not out at sea.
    if (x < 0.04 || x > 0.96 || y < 0.42 || y > 0.92) return false;
    this.state = {
      ...this.state,
      coins: this.state.coins - def.cost,
      decor: [...this.state.decor, { id: this.state.nextDecorId, art, x, y }],
      nextDecorId: this.state.nextDecorId + 1,
    };
    this.emit({ type: 'decor' });
    return true;
  }

  /**
   * Pick a decoration back up. Half the materials are reclaimed — the other
   * half was worked into the piece and given to the village. You keep the
   * freedom to rearrange (keep-everything holds), but decorating is now a real
   * coin sink rather than a cost-neutral loop you could buy and refund forever.
   * Coins buy beauty, and beauty, once made, has been spent on.
   */
  removeDecor(id: number): void {
    const piece = this.state.decor.find((d) => d.id === id);
    if (!piece) return;
    const cost = DECOR_CATALOG.find((d) => d.art === piece.art)?.cost ?? 0;
    this.state = {
      ...this.state,
      coins: this.state.coins + Math.floor(cost / 2),
      decor: this.state.decor.filter((d) => d.id !== id),
    };
    this.emit({ type: 'decor' });
  }

  // ---------- building upgrades (coins buy pride, never power) ----------

  /** Coin cost to reach each tier: [→ L2, → L3]. Escalating, so a long-term sink. */
  static UPGRADE_COSTS = [120, 320] as const;
  /** Per-building cost multiplier — grander/civic buildings cost more to cherish,
   *  the small homes and huts a little less. Pure coin-sink variety, never power. */
  static UPGRADE_FACTOR: Record<string, number> = {
    town_townhall: 1.5,
    town_library: 1.3,
    town_market: 1.2,
    town_bakery: 1.2,
    town_garden: 1.1,
    town_dock: 1.1,
  };

  /** Current upgrade tier of a building (0 = base, 1 = L2, 2 = L3). */
  upgradeTier(art: string): number {
    return this.state.buildingUpgrades[art] ?? 0;
  }

  /** A building can be upgraded once it has returned and it isn't already at the top tier. */
  canUpgrade(art: string): boolean {
    const building = TOWN_BUILDINGS.find((b) => b.art === art);
    if (!building || this.state.orderIndex < building.unlockAt) return false;
    const cost = this.upgradeCost(art);
    return cost !== null && this.state.coins >= cost;
  }

  /** The coin cost of the next upgrade for a building, or null if maxed. */
  upgradeCost(art: string): number | null {
    const tier = this.upgradeTier(art);
    if (tier >= Game.UPGRADE_COSTS.length) return null;
    const factor = Game.UPGRADE_FACTOR[art] ?? 1;
    return Math.round((Game.UPGRADE_COSTS[tier]! * factor) / 10) * 10; // round to a tidy 10
  }

  /** Spend coins to raise a building a tier. Beauty and pride — never power. */
  upgradeBuilding(art: string): boolean {
    const cost = this.upgradeCost(art);
    if (cost === null || !this.canUpgrade(art)) return false;
    const nextTier = this.upgradeTier(art) + 1;
    this.state = {
      ...this.state,
      coins: this.state.coins - cost,
      buildingUpgrades: { ...this.state.buildingUpgrades, [art]: nextTier },
    };
    this.emit({ type: 'upgrade', art, tier: nextTier, coins: cost });
    return true;
  }

  /** Real progress toward a collection: highest tier reached vs the chain top. */
  collectionProgress(id: string): { have: number; total: number; done: boolean } {
    const col = COLLECTIONS.find((c) => c.id === id);
    if (!col) return { have: 0, total: 1, done: false };
    const total = maxLevel(col.chain);
    const have = Math.min(total, this.state.maxTier?.[col.chain] ?? 0);
    return { have, total, done: (this.state.collectionsClaimed ?? []).includes(id) };
  }

  // ---------- Market: cosmetic board skins (coins buy beauty, never power) ----
  currentSkin(): string {
    return this.state.prefs.boardSkin ?? 'classic';
  }

  ownsSkin(id: string): boolean {
    return id === 'classic' || (this.state.prefs.ownedSkins ?? []).includes(id);
  }

  /** Equip an already-owned skin (free). */
  equipSkin(id: string): void {
    if (!this.ownsSkin(id)) return;
    this.state = { ...this.state, prefs: { ...this.state.prefs, boardSkin: id } };
    this.emit({ type: 'state' });
  }

  /** Buy a skin (or equip if owned). Returns false if unaffordable. */
  buySkin(id: string, cost: number): boolean {
    if (this.ownsSkin(id)) {
      this.equipSkin(id);
      return true;
    }
    if (this.state.coins < cost) return false;
    this.state = {
      ...this.state,
      coins: this.state.coins - cost,
      prefs: {
        ...this.state.prefs,
        ownedSkins: [...(this.state.prefs.ownedSkins ?? []), id],
        boardSkin: id,
      },
    };
    this.emit({ type: 'bought', label: 'skin', coins: cost });
    return true;
  }

  /** Dev-only: jump the story forward to preview the composed town. */
  devPreviewStory(orderIndex: number): void {
    const clamped = Math.max(0, Math.min(ORDERS.length, Math.floor(orderIndex)));
    this.state = { ...this.state, orderIndex: clamped };
    this.emit({ type: 'state' });
  }

  /**
   * Dev/tester: complete the story, fund the town, and open every building game
   * at once (incl. the L2-gated ones, which normally need coin-paced upgrades) —
   * so a tester can reach all six mini-games in a single call.
   */
  devUnlockMinigames(now = Date.now()): void {
    this.beginDay(now);
    const buildingUpgrades = { ...this.state.buildingUpgrades };
    for (const m of MINIGAMES)
      if (m.unlock === 'l2') buildingUpgrades[m.buildingArt] = Math.max(buildingUpgrades[m.buildingArt] ?? 0, 1);
    this.state = {
      ...this.state,
      orderIndex: Math.max(this.state.orderIndex, ORDERS.length),
      coins: this.state.coins + 2000,
      energy: grant(this.state.energy, 100),
      buildingUpgrades,
      minigames: { ...this.state.minigames, unlocked: MINIGAMES.map((m) => m.id), tokens: 20 },
    };
    this.emit({ type: 'state' });
  }

  // ---------- auto-merge ----------

  get settings(): Settings {
    return this.state.settings;
  }

  setAutoMerge(on: boolean): void {
    this.state = { ...this.state, settings: { ...this.state.settings, autoMerge: on } };
    this.emit({ type: 'settings' });
  }

  get prefs() {
    return this.state.prefs;
  }

  get flags() {
    return this.state.flags;
  }

  setFlag(patch: Partial<GameState['flags']>): void {
    this.state = { ...this.state, flags: { ...this.state.flags, ...patch } };
    this.emit({ type: 'settings' });
  }

  setPrefs(patch: Partial<GameState['prefs']>): void {
    this.state = { ...this.state, prefs: { ...this.state.prefs, ...patch } };
    this.emit({ type: 'settings' });
  }

  /** Whether any mergeable pair currently exists on the board. */
  hasMergePair(): boolean {
    return findMergePair(this.state.board) !== null;
  }

  /** Merge the first available matching pair. Returns true if a merge happened. */
  autoMergeOnce(): boolean {
    const pair = findMergePair(this.state.board);
    if (!pair) return false;
    this.drop(pair[1], pair[0]); // consume second onto first — emits 'merge'
    return true;
  }

  // ---------- stargaze (moon-linked night action) ----------

  canStargaze(now = Date.now(), coords?: Coords): boolean {
    return isNight(now, coords) && canDoAction(this.state.actions, STARGAZE.id, now);
  }

  /** Tonight's stargaze reward: base + full-moon bonus, with the phase name. */
  stargazePreview(now = Date.now()): { energy: number; bonus: number; moon: string } {
    const bonus = fullMoonBonus(now);
    return { energy: STARGAZE.baseEnergy + bonus, bonus, moon: phaseName(now) };
  }

  /** Log a completed stargaze. Night-gated, once per day, moon-bonused. */
  doStargaze(now = Date.now(), coords?: Coords): void {
    this.beginDay(now);
    if (!isNight(now, coords)) {
      this.emit({ type: 'stargaze', energy: 0, moon: phaseName(now) });
      return;
    }
    const { energy, moon } = this.stargazePreview(now);
    const res = recordAction(this.state.actions, STARGAZE.id, now, energy);
    if (res.energy <= 0 && res.dailyBonus <= 0) {
      this.emit({ type: 'stargaze', energy: 0, moon });
      return;
    }
    this.state = {
      ...this.state,
      actions: res.state,
      energy: grant(this.state.energy, res.energy + res.dailyBonus),
      coins: this.state.coins + res.chestCoins,
    };
    if (res.energy > 0) this.bumpStat({ dayActions: this.state.stats.dayActions + 1 });
    this.emit({ type: 'stargaze', energy: res.energy, moon });
    if (res.dailyBonus > 0) this.emit({ type: 'daily', energy: res.dailyBonus, streak: res.state.streak });
    if (res.chestCoins > 0) this.emit({ type: 'chest', coins: res.chestCoins });
  }

  // ---------- duel results, Repository & story delivery ----------

  get repository(): readonly RepositoryItem[] {
    return this.state.repository;
  }
  get duelStreak(): number {
    return this.state.duelStreak;
  }

  /**
   * Settle a finished duel. If the local player won, the board spoils are banked
   * into the Repository, a streak-multiplied coin reward is paid, and the win
   * streak grows. A loss or tie resets the streak (no other penalty).
   */
  finishDuel(playerWon: boolean, spoils: readonly { chain: ChainId; level: number }[], score: number): void {
    this.beginDay(Date.now());
    if (playerWon) {
      this.bumpStat({ duelWins: this.state.stats.duelWins + 1 });
      const streak = this.state.duelStreak + 1;
      const mult = duelMultiplier(streak);
      const coins = Math.round(score * mult);
      this.state = {
        ...this.state,
        repository: addToRepository(this.state.repository, spoils),
        duelStreak: streak,
        coins: this.state.coins + coins,
      };
      this.emit({ type: 'duelEnd', won: true, streak, multiplier: mult, coins, itemCount: spoils.length });
    } else {
      this.state = { ...this.state, duelStreak: 0 };
      this.emit({ type: 'duelEnd', won: false, streak: 0, multiplier: 1, coins: 0, itemCount: 0 });
    }
  }

  /** Whether the Repository holds the item the current story order needs. */
  canDeliverFromRepository(): boolean {
    const order = this.currentOrder();
    return this.state.repository.some(
      (r) => r.chain === order.need.chain && r.level === order.need.level && r.count > 0,
    );
  }

  /** Spend a Repository item to complete the current order — duels feeding the story. */
  deliverFromRepository(): void {
    this.beginDay(Date.now());
    const order = this.currentOrder();
    const idx = this.state.repository.findIndex(
      (r) => r.chain === order.need.chain && r.level === order.need.level && r.count > 0,
    );
    if (idx < 0) {
      this.emit({ type: 'reject', index: -1, reason: 'invalid' });
      return;
    }
    this.bumpStat({ dayDelivers: this.state.stats.dayDelivers + 1 });
    this.undoBoard = null; // deliveries close the undo window, wherever they come from
    const repository = this.state.repository
      .map((r, i) => (i === idx ? { ...r, count: r.count - 1 } : r))
      .filter((r) => r.count > 0);
    this.state = {
      ...this.state,
      repository,
      energy: grant(this.state.energy, order.rewardEnergy),
      coins: this.state.coins + order.rewardCoins,
      orderIndex: this.state.orderIndex + 1,
      storySeen: [...this.state.storySeen, order.id],
    };
    this.emit({
      type: 'delivered',
      orderId: order.id,
      resolution: order.resolution,
      rewardEnergy: order.rewardEnergy,
      rewardCoins: order.rewardCoins,
    });
    this.recordBond(order);
    this.checkZoneRestored();
    this.emitChapterBoundary();
  }

  // ---------- Repository: gathered loot & standing village requests ----------

  /**
   * Standing village requests for the mini-game loot you're holding — the town
   * "asking for your caught fish/honey/copper…". Only ever lists things you
   * actually hold, so they can never block the main merge→deliver loop.
   */
  repositoryRequests(): RepoRequest[] {
    return repoRequestsFor(this.state.repository, this.state.actions.day);
  }

  /** Gift one held item to the villager who wants it, for coins. Keeps-everything: your choice. */
  giveFromRepository(chain: ChainId, level: number): boolean {
    const req = this.repositoryRequests().find((r) => r.chain === chain && r.level === level);
    if (!req) return false;
    this.beginDay(Date.now());
    this.state = {
      ...this.state,
      repository: takeFromRepository(this.state.repository, chain, level),
      coins: this.state.coins + req.coins,
    };
    this.emit({ type: 'repoGiven', who: req.who, chain, level, coins: req.coins });
    this.emit({ type: 'state' });
    return true;
  }

  // ---------- Village Life mini-games (post-story building games) ----------

  get minigameState(): MinigameState {
    return this.state.minigames;
  }

  /** The story is complete once every order is delivered — the gate to Village Life. */
  isStoryComplete(): boolean {
    return storyComplete(this.state.orderIndex, ORDERS.length);
  }

  /** Whether a building supports upgrades at all (props like the well/sign and
   *  specials like the lighthouse don't — they have no L2/L3 art). */
  isUpgradeable(art: string): boolean {
    return TOWN_BUILDINGS.some((b) => b.art === art) && !art.startsWith('prop_');
  }

  /** The mini-game a building offers and its current playability, for the building card. */
  minigameStatus(art: string): MinigameStatus | null {
    const def = minigameForBuilding(art);
    if (!def) return null;
    // Games unlock progressively as each building returns (the well at order 6,
    // the beacon at 9…) — NOT at full story completion, which read as broken
    // mid-game. Tester mode bypasses both the return gate and the L2-upgrade
    // gate so all six games are reachable at any progress.
    const at = returnsAt(art);
    const returned = this.testerUnlimited || (at !== null && this.state.orderIndex >= at);
    const eligible = isEligible(def.unlock, returned, this.testerUnlimited ? 2 : this.upgradeTier(art));
    // Story-gated games (the well, the beacon) open automatically the moment
    // their building returns — there is no upgrade ceremony for them, so
    // requiring a separate "open the doors" tap made them feel like they
    // didn't launch. L2 games still open explicitly after being cared for.
    // Tester mode treats every game as already opened so all six mechanics can
    // be tried instantly (no "care for it → open the doors" ceremony first).
    const unlocked =
      this.testerUnlimited || isUnlocked(this.state.minigames, def.id) || (def.unlock === 'story' && returned);
    const tokens = this.state.minigames.tokens;
    let reason: 'ready' | 'no-tokens' | 'no-energy' | 'locked-story' | 'locked-l2' = 'ready';
    if (!returned) reason = 'locked-story';
    else if (!eligible) reason = 'locked-l2';
    // Tester mode gives unlimited goes so the mechanics can be tried freely —
    // the token + energy gates are skipped (see startMinigame too).
    else if (this.testerUnlimited) reason = 'ready';
    else if (tokens <= 0) reason = 'no-tokens';
    else if (this.state.energy.current < MINIGAME_ENERGY_COST) reason = 'no-energy';
    // How many more orders until the building is back — for warm lock copy.
    const ordersToGo = !returned && at !== null ? Math.max(0, at - this.state.orderIndex) : undefined;
    const best = this.state.minigames.bests?.[def.id];
    return {
      def,
      unlocked,
      canPlay: unlocked && reason === 'ready',
      tokens,
      reason,
      ...(ordersToGo !== undefined ? { ordersToGo } : {}),
      ...(best !== undefined ? { best } : {}),
    };
  }

  /** Open a building's doors — at most one new game opens per day. */
  openMinigameDoors(art: string, now = Date.now()): UnlockOutcome {
    this.beginDay(now);
    const def = minigameForBuilding(art);
    if (!def) return 'ineligible';
    const at = returnsAt(art);
    const returned = this.testerUnlimited || (at !== null && this.state.orderIndex >= at);
    const eligible = isEligible(def.unlock, returned, this.testerUnlimited ? 2 : this.upgradeTier(art));
    const res = tryUnlock(this.state.minigames, def.id, eligible, localDayKey(now));
    if (res.outcome === 'opened') {
      this.state = { ...this.state, minigames: res.state };
      this.emit({ type: 'minigameUnlocked', id: def.id, title: def.title });
    }
    return res.outcome;
  }

  canPlayMinigame(id: string): boolean {
    const def = MINIGAME_BY_ID[id];
    const st = def ? this.minigameStatus(def.buildingArt) : null;
    return !!st && st.canPlay;
  }

  /** Tester opt-in: unlimited mini-game goes so mechanics can be tried freely. */
  setTesterUnlimited(on: boolean): void {
    this.testerUnlimited = on;
  }
  get isTesterUnlimited(): boolean {
    return this.testerUnlimited;
  }

  /** Enter a mini-game: spend a token + the energy cost, return a run seed. Null if blocked. */
  startMinigame(id: string, now = Date.now()): { seed: number } | null {
    this.beginDay(now);
    if (!this.canPlayMinigame(id)) return null;
    this.discover(`game:${id}`); // first play retires the game's discovery glow
    // Tester mode: unlimited goes — don't spend the token or energy.
    if (!this.testerUnlimited) {
      this.state = {
        ...this.state,
        energy: spend(this.state.energy, MINIGAME_ENERGY_COST),
        minigames: spendToken(this.state.minigames),
      };
    }
    this.emit({ type: 'state' });
    return { seed: ((now >>> 0) ^ 0x9e3779b9 ^ (this.state.nextUid * 2654435761)) >>> 0 };
  }

  /** How many wishes the well can draw from (for seeding the UI's pick). */
  wishCount(): number {
    return WISHES.length;
  }

  /**
   * Bank a finished run's rewards: coins + Repository items now (deliverable once
   * the endless orders land), embers capped so play never out-earns real life,
   * and any drawn wish kept as a small keepsake.
   */
  finishMinigame(
    id: string,
    reward: MgReward,
    wish?: { who: string; text: string },
    score?: number,
  ): { isBest: boolean; best: number | null; discovered: AlmanacPage[] } {
    const def = MINIGAME_BY_ID[id];
    if (!def) return { isBest: false, best: null, discovered: [] };
    const em = addEmber(this.state.minigames, reward.ember);
    let minigames = em.state;
    if (wish) {
      minigames = {
        ...minigames,
        wishes: [
          { id: `wish-${this.state.nextUid}`, who: wish.who, text: wish.text, day: this.state.actions.day },
          ...minigames.wishes,
        ].slice(0, 24),
      };
    }
    // Personal best (a warm memento, never a leaderboard) — highest kept.
    let isBest = false;
    if (typeof score === 'number') {
      const rb = recordBest(minigames, id, score);
      minigames = rb.state;
      isBest = rb.isBest;
    }
    // The Keeper's Almanac remembers the first of each kind — the collection
    // that gives the games a reason past the coins.
    const stamped = stampItems(this.state.almanac, reward.items);
    this.state = {
      ...this.state,
      coins: this.state.coins + reward.coins,
      repository: addToRepository(this.state.repository, reward.items),
      energy: em.granted > 0 ? grant(this.state.energy, em.granted) : this.state.energy,
      minigames,
      almanac: stamped.state,
      nextUid: this.state.nextUid + 1,
    };
    this.emit({
      type: 'minigameEnd',
      id,
      title: def.title,
      coins: reward.coins,
      ember: em.granted,
      itemCount: reward.items.length,
      ...(wish ? { wish: `${wish.who} ${wish.text}` } : {}),
    });
    return { isBest, best: this.state.minigames.bests?.[id] ?? null, discovered: stamped.discovered };
  }

  /** The player's personal best for a mini-game, or null if never played. */
  minigameBest(id: string): number | null {
    return this.state.minigames.bests?.[id] ?? null;
  }

  /** The Keeper's Almanac as it stands (stamp id -> times found). */
  get almanac(): AlmanacState {
    return this.state.almanac;
  }

  // ---------- discovery nudges ----------

  /** Feature-ids that should glow right now — available but not yet engaged. */
  pendingNudges(): string[] {
    return pendingNudges(this.state);
  }

  /** Has this feature already been discovered (its glow retired)? */
  isDiscovered(id: string): boolean {
    return (this.state.discovered ?? []).includes(id);
  }

  /** Retire a feature's discovery glow for good (idempotent). */
  discover(id: string): void {
    if (this.isDiscovered(id)) return;
    this.state = { ...this.state, discovered: [...(this.state.discovered ?? []), id] };
    this.emit({ type: 'state' });
  }

  /** Living well tops up a mini-game attempt (never bought). Capped per day. */
  private earnMinigameToken(): void {
    this.state = { ...this.state, minigames: grantToken(this.state.minigames) };
  }

  // ---------- kindness to a stranger ----------

  canDoKindness(now = Date.now()): boolean {
    return canDoAction(this.state.actions, KINDNESS.id, now);
  }

  /** Log a real-world compliment to a stranger; selfie with the new friend adds a bonus. */
  doKindness(withSelfie: boolean, now = Date.now()): void {
    this.beginDay(now);
    const energy = KINDNESS.baseEnergy + (withSelfie ? KINDNESS.selfieBonus : 0);
    const res = recordAction(this.state.actions, KINDNESS.id, now, energy);
    if (res.energy <= 0 && res.dailyBonus <= 0) {
      this.emit({ type: 'kindness', energy: 0, selfie: withSelfie });
      return;
    }
    this.state = {
      ...this.state,
      actions: res.state,
      energy: grant(this.state.energy, res.energy + res.dailyBonus),
      coins: this.state.coins + res.chestCoins,
    };
    if (res.energy > 0) this.bumpStat({ dayActions: this.state.stats.dayActions + 1 });
    this.emit({ type: 'kindness', energy: res.energy, selfie: withSelfie });
    if (res.dailyBonus > 0) this.emit({ type: 'daily', energy: res.dailyBonus, streak: res.state.streak });
    if (res.chestCoins > 0) this.emit({ type: 'chest', coins: res.chestCoins });
  }

  // ---------- gratitude journal ----------

  get gratitudeState(): GratitudeState {
    return this.state.gratitude;
  }

  /** Preview the energy a journal entry would earn right now (base × streak multiplier). */
  gratitudePreview(): { energy: number; multiplier: number } {
    const mult = streakMultiplier(Math.max(1, this.state.actions.streak));
    return { energy: Math.round(GRATITUDE.baseEnergy * mult), multiplier: mult };
  }

  canWriteGratitude(now = Date.now()): boolean {
    return canDoAction(this.state.actions, GRATITUDE.id, now);
  }

  /** Write one good thing about today. Streak-multiplied energy; kept for flashbacks. */
  writeGratitude(text: string, now = Date.now()): void {
    this.beginDay(now);
    const clean = text.trim().slice(0, GRATITUDE.maxLen);
    if (!clean) return;
    const { energy, multiplier } = this.gratitudePreview();
    const res = recordAction(this.state.actions, GRATITUDE.id, now, energy);
    if (res.energy <= 0 && res.dailyBonus <= 0) {
      this.emit({ type: 'gratitude', energy: 0, multiplier });
      return;
    }
    const entry: GratitudeEntry = { id: `grat-${now}`, day: localDayKey(now), text: clean, createdAt: now };
    this.state = {
      ...this.state,
      actions: res.state,
      gratitude: { ...this.state.gratitude, entries: [entry, ...this.state.gratitude.entries] },
      energy: grant(this.state.energy, res.energy + res.dailyBonus),
      coins: this.state.coins + res.chestCoins,
    };
    this.emit({ type: 'gratitude', energy: res.energy, multiplier });
    if (res.dailyBonus > 0) this.emit({ type: 'daily', energy: res.dailyBonus, streak: res.state.streak });
    if (res.chestCoins > 0) this.emit({ type: 'chest', coins: res.chestCoins });
  }

  /** A past entry (older than the min age) ready to resurface today, or undefined. */
  pendingFlashback(now = Date.now()): GratitudeEntry | undefined {
    const g = this.state.gratitude;
    if (g.lastFlashbackDay === localDayKey(now)) return undefined;
    const cutoff = now - GRATITUDE.flashbackMinDays * 86_400_000;
    const eligible = g.entries.filter((e) => e.createdAt <= cutoff);
    return eligible.length ? eligible[eligible.length - 1] : undefined; // the oldest, remembered
  }

  /** Claim today's flashback boost for a resurfaced good day. */
  claimFlashback(now = Date.now()): void {
    const entry = this.pendingFlashback(now);
    if (!entry) return;
    this.bumpStat({ flashbacks: this.state.stats.flashbacks + 1 });
    this.state = {
      ...this.state,
      gratitude: { ...this.state.gratitude, lastFlashbackDay: localDayKey(now) },
      energy: grant(this.state.energy, GRATITUDE.flashbackBoost),
    };
    this.emit({ type: 'flashback', text: entry.text, energy: GRATITUDE.flashbackBoost });
  }

  itemAt(index: number): Item | null {
    return itemAt(this.state.board, index);
  }

  reset(now = Date.now()): void {
    this.state = Game.freshState(now);
    this.emit({ type: 'state' });
  }
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

export function pickSpawnChain(
  rand: () => number,
  table: readonly { chain: Item['chain']; weight: number }[] = SPAWN_TABLE,
): Item['chain'] {
  const total = table.reduce((s, e) => s + e.weight, 0);
  let roll = rand() * total;
  for (const e of table) {
    roll -= e.weight;
    if (roll <= 0) return e.chain;
  }
  return table[table.length - 1]!.chain;
}
