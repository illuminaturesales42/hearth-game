/**
 * Game orchestrator: owns GameState, exposes actions, notifies subscribers.
 * UI layers subscribe; core stays DOM-free.
 */
import type { GameState, Item } from './types';
import { createBoard, dropItem, emptyIndices, findItem, findMergePair, itemAt, withEmpty, withItem } from './board';
import { accrueRegen, canSpend, grant, initialEnergy, spend } from './energy';
import { BOARD_COLS, BOARD_ROWS, CHAPTERS, ENERGY, ORDERS, PRODUCER_INDEX, SPAWN_TABLE, stageFor } from '../data/economy';
import { appendEntry, composeEntry, rolloverStats } from './chronicle';
import { newlyEarned } from './achievements';
import { questsForDay } from '../data/daily-quests';
import { CURRENT_VERSION, defaultPrefs, loadState, saveState } from './save';
import { applySnapshot, initialLedger } from '../health/health-energy';
import type { HealthSnapshot } from '../health/health-provider';
import { advanceDay, canDoAction, initialActionState, recordAction, rolloverActions, streakMultiplier } from './actions';
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
import type { ActionState, ChainId, GratitudeEntry, GratitudeState, RepositoryItem, Settings, SocialState } from './types';

export type GameEvent =
  | { type: 'state' }
  | { type: 'spawn'; index: number }
  | { type: 'merge'; index: number; item: Item }
  | { type: 'reject'; index: number; reason: 'energy' | 'full' | 'invalid' }
  | { type: 'delivered'; orderId: string; resolution: string; rewardEnergy: number; rewardCoins: number }
  | { type: 'action'; actionId: string; energy: number }
  | { type: 'chest'; coins: number }
  | { type: 'health'; energy: number; fromSteps: number; fromStairs: number; fromSleep: number; sleepFullNight: boolean }
  | { type: 'social' }
  | { type: 'friendJoined'; name: string; energy: number }
  | { type: 'help'; from: string; count: number }
  | { type: 'daily'; energy: number; streak: number }
  | { type: 'newDay'; streak: number; energy: number; chestCoins: number }
  | { type: 'gratitude'; energy: number; multiplier: number }
  | { type: 'flashback'; text: string; energy: number }
  | { type: 'stargaze'; energy: number; moon: string }
  | { type: 'kindness'; energy: number; selfie: boolean }
  | { type: 'achievement'; id: string; title: string; icon: string }
  | { type: 'questDone'; label: string; coins: number }
  | { type: 'chronicle'; day: string }
  | { type: 'settings' }
  | { type: 'duelEnd'; won: boolean; streak: number; multiplier: number; coins: number; itemCount: number }
  | { type: 'chapterComplete'; chapter: number; title: string; cliffhanger: string; hasNext: boolean };

type Listener = (ev: GameEvent) => void;

export class Game {
  private state: GameState;
  private listeners: Listener[] = [];

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
      { i: 8, chain: 'wood', level: 0 }, { i: 10, chain: 'wood', level: 0 },
      { i: 14, chain: 'wood', level: 1 }, { i: 26, chain: 'wood', level: 1 },
      { i: 27, chain: 'harvest', level: 0 }, { i: 29, chain: 'harvest', level: 0 },
      { i: 33, chain: 'hearthfire', level: 0 }, { i: 35, chain: 'hearthfire', level: 0 },
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
      stats: { merges: 0, duelWins: 0, flashbacks: 0, day: localDayKey(now), dayMerges: 0, dayDelivers: 0, dayActions: 0 },
      achievements: [],
      questsClaimed: [],
      flags: { ftueDone: false, windDownShown: false },
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
    return { code: res.friend.id.toUpperCase() + Math.abs(hashCode(res.friend.id)).toString(36).slice(0, 4).toUpperCase(), name };
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
    const order = ORDERS[this.state.orderIndex];
    const chain: ChainId = order ? order.need.chain : 'wood';
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
      for (const q of questsForDay(this.state.stats.day)) {
        if (!this.state.questsClaimed.includes(q.id) && q.progress(this.state) >= q.target) {
          this.state = {
            ...this.state,
            questsClaimed: [...this.state.questsClaimed, q.id],
            coins: this.state.coins + q.coins,
          };
          extra.push({ type: 'questDone', label: q.label, coins: q.coins });
        }
      }
      for (const a of newlyEarned(this.state)) {
        this.state = { ...this.state, achievements: [...this.state.achievements, a.id] };
        extra.push({ type: 'achievement', id: a.id, title: a.title, icon: a.icon });
      }
      this.processing = false;
    }
    saveState(this.state);
    for (const l of this.listeners) l(ev);
    for (const e of extra) for (const l of this.listeners) l(e);
    if (ev.type !== 'state') for (const l of this.listeners) l({ type: 'state' });
  }

  /**
   * Day boundary: before any counts roll over, yesterday writes itself into
   * the Chronicle; per-day stats and claimed quests reset. Idempotent.
   */
  private beginDay(now: number): void {
    const today = localDayKey(now);
    if (this.state.actions.day !== today) {
      const a = this.state.actions;
      const entry = composeEntry(a.day, a.counts, a.streak, stageFor(this.state.orderIndex), this.state.stats.dayDelivers);
      this.state = { ...this.state, chronicle: { entries: appendEntry(this.state.chronicle.entries, entry) } };
      this.emit({ type: 'chronicle', day: entry.day });
    }
    if (this.state.stats.day !== today) {
      this.state = { ...this.state, stats: rolloverStats(this.state.stats, today), questsClaimed: [] };
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
    const chain = pickSpawnChain(Math.random);
    const index = empties[Math.floor(Math.random() * empties.length)]!;
    const item: Item = { chain, level: 0, uid: this.state.nextUid };
    this.state = {
      ...this.state,
      energy: spend(this.state.energy, ENERGY.spawnCost),
      board: withItem(this.state.board, index, item),
      nextUid: this.state.nextUid + 1,
    };
    this.emit({ type: 'spawn', index });
  }

  drop(from: number, to: number): void {
    this.beginDay(Date.now());
    const res = dropItem(this.state.board, from, to, this.state.nextUid);
    if (res.board === this.state.board) {
      this.emit({ type: 'reject', index: to, reason: 'invalid' });
      return;
    }
    this.state = {
      ...this.state,
      board: res.board,
      nextUid: res.merged ? this.state.nextUid + 1 : this.state.nextUid,
      xp: res.merged ? this.state.xp + (res.result?.level ?? 0) : this.state.xp,
    };
    if (res.merged) {
      this.bumpStat({ merges: this.state.stats.merges + 1, dayMerges: this.state.stats.dayMerges + 1 });
    }
    if (res.merged && res.result) this.emit({ type: 'merge', index: to, item: res.result });
    else this.emit({ type: 'state' });
  }

  /** Index of the board item satisfying the current order, or -1. */
  deliverableIndex(): number {
    const order = ORDERS[this.state.orderIndex];
    if (!order) return -1;
    return findItem(this.state.board, order.need.chain, order.need.level);
  }

  deliver(): void {
    this.beginDay(Date.now());
    const order = ORDERS[this.state.orderIndex];
    const idx = this.deliverableIndex();
    if (!order || idx < 0) {
      this.emit({ type: 'reject', index: -1, reason: 'invalid' });
      return;
    }
    this.bumpStat({ dayDelivers: this.state.stats.dayDelivers + 1 });
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
    this.emitChapterBoundary();
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
    this.emit({ type: 'newDay', streak: adv.state.streak, energy: adv.dailyBonus, chestCoins: adv.chestCoins });
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
    if (res.energy > 0) this.bumpStat({ dayActions: this.state.stats.dayActions + 1 });
    this.emit({ type: 'action', actionId, energy: res.energy });
    if (res.dailyBonus > 0) this.emit({ type: 'daily', energy: res.dailyBonus, streak: res.state.streak });
    if (res.chestCoins > 0) this.emit({ type: 'chest', coins: res.chestCoins });
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
    const order = ORDERS[this.state.orderIndex];
    if (!order) return false;
    return this.state.repository.some(
      (r) => r.chain === order.need.chain && r.level === order.need.level && r.count > 0,
    );
  }

  /** Spend a Repository item to complete the current order — duels feeding the story. */
  deliverFromRepository(): void {
    this.beginDay(Date.now());
    const order = ORDERS[this.state.orderIndex];
    if (!order) return;
    const idx = this.state.repository.findIndex(
      (r) => r.chain === order.need.chain && r.level === order.need.level && r.count > 0,
    );
    if (idx < 0) {
      this.emit({ type: 'reject', index: -1, reason: 'invalid' });
      return;
    }
    this.bumpStat({ dayDelivers: this.state.stats.dayDelivers + 1 });
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
    this.emitChapterBoundary();
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

export function pickSpawnChain(rand: () => number): Item['chain'] {
  const total = SPAWN_TABLE.reduce((s, e) => s + e.weight, 0);
  let roll = rand() * total;
  for (const e of SPAWN_TABLE) {
    roll -= e.weight;
    if (roll <= 0) return e.chain;
  }
  return SPAWN_TABLE[SPAWN_TABLE.length - 1]!.chain;
}
