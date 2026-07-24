/** Shared domain types. Keep this file dependency-free. */

export type ChainId =
  | 'wood'
  | 'harvest'
  | 'hearthfire'
  | 'keepsake'
  // Resource library from the clean merge-chain sheet (art in item_<id>_<n>).
  | 'stone'
  | 'clay'
  | 'seeds'
  | 'flowers'
  | 'water'
  | 'copper'
  | 'fish'
  | 'seaweed'
  | 'honey'
  | 'herbs'
  | 'wool'
  | 'books'
  | 'music'
  // Builder's Yard: chains that climb from materials to a finished building.
  | 'homestead'
  | 'greenhouse'
  | 'smithy'
  | 'apothecary';

export interface ChainDef {
  id: ChainId;
  name: string;
  /** Item display per level, index = level (0-based). Placeholder emoji art until the M2 art pass. */
  levels: readonly string[];
  levelNames: readonly string[];
}

export interface Item {
  chain: ChainId;
  level: number;
  /** Unique instance id for animation tracking. */
  uid: number;
  /** Pinned by the player: can't be dragged, auto-merged, or bulk-discarded. */
  locked?: boolean;
}

/** A board cell is empty, an item, or the producer crate. */
export type Cell = { kind: 'empty' } | { kind: 'item'; item: Item } | { kind: 'producer' };

export interface BoardState {
  cols: number;
  rows: number;
  cells: readonly Cell[];
}

export interface OrderDef {
  id: string;
  /** Villager asking. */
  who: string;
  /** chain+level required. */
  need: { chain: ChainId; level: number };
  text: string;
  /** Story beat shown on delivery. */
  resolution: string;
  rewardEnergy: number;
  rewardCoins: number;
}

export interface EnergyState {
  current: number;
  /** epoch ms of last time-regen accrual. */
  lastRegenAt: number;
}

export type ActionKind = 'sensor' | 'photo' | 'motion' | 'selfReport';

export interface EnergyAction {
  id: string;
  label: string;
  sublabel: string;
  icon: string;
  energy: number;
  timesPerDay: number;
  kind: ActionKind;
  /** featured actions appear in TODAY'S ENERGY; others under "More ways". */
  featured: boolean;
  photoPrompt?: string;
  photoWindow?: 'sunrise' | 'sunset' | 'day';
  motionReps?: number;
  motionVerb?: string;
  sensor?: 'steps' | 'stairs' | 'sleep';
}

export interface ActionState {
  day: string; // YYYY-MM-DD local; resets counts at midnight
  counts: Record<string, number>;
  /** consecutive active days. Positive framing only — never punished. */
  streak: number;
  lastActiveDay: string | null;
  /** active days accrued toward the next chest. */
  chestProgress: number;
  /** Earned "hearthstones" that auto-save a streak across a single missed day. */
  freezes?: number;
}

export interface HealthLedgerState {
  day: string;
  /** Energy already granted today from each source, so tiers pay only the delta. */
  stepsGranted: number;
  stairsGranted: number;
  sleepGranted: number;
}

export interface Friend {
  id: string;
  name: string;
  avatar: number; // 1-6, selects a palette for the placeholder portrait
  status: 'pending' | 'joined';
  /** local day key of the last "ask for help", for the once-per-day cooldown. */
  askedDay?: string;
}

export interface Gift {
  id: string;
  from: string;
  chain: ChainId;
  level: number;
}

export interface SocialState {
  friends: readonly Friend[];
  gifts: readonly Gift[];
  /** friend ids that have already paid their one-time join bonus. */
  joinBonusGiven: readonly string[];
  nextId: number;
}

export interface GratitudeEntry {
  id: string;
  day: string; // YYYY-MM-DD local
  text: string;
  createdAt: number;
}

export interface GratitudeState {
  entries: readonly GratitudeEntry[];
  /** local day key of the last flashback claimed, so it resurfaces once a day. */
  lastFlashbackDay: string | null;
}

export interface Settings {
  /** Automatically merge matching items on the board. */
  autoMerge: boolean;
}

/** User preferences (Settings screen). Added in save v9. */
export interface Prefs {
  musicVol: number; // 0..1
  sfxVol: number; // 0..1
  textScale: number; // 0.9 | 1 | 1.12
  highContrast: boolean;
  forceReducedMotion: boolean;
  /** Cosmetic board skin id (Market purchase; defaults to 'classic'). */
  boardSkin?: string;
  /** Board skins the player has bought (re-equipping is free). */
  ownedSkins?: readonly string[];
  /** Opt-in: one warm daily notification. Off by default (never nags). */
  notifyDaily?: boolean;
  /** Hour of day (0..23) the daily notification fires. */
  notifyHour?: number;
}

/** An item held in the Repository (won from duels), usable to progress the story. */
export interface RepositoryItem {
  chain: ChainId;
  level: number;
  count: number;
}

/** One remembered day in the Chronicle (auto-written prose, never raw stats). */
export interface ChronicleEntry {
  day: string; // YYYY-MM-DD local
  text: string;
  stage: number; // homestead stage that day
  streak: number;
}

export interface ChronicleState {
  entries: readonly ChronicleEntry[];
}

/** Lifetime + per-day counters for achievements and daily quests. */
export interface StatsState {
  merges: number;
  duelWins: number;
  flashbacks: number;
  day: string; // YYYY-MM-DD local; day* counters reset when it changes
  dayMerges: number;
  dayDelivers: number;
  dayActions: number;
  /** Rewarded duel wins today (caps the duel coin/spoil faucet). Optional so
   *  older saves load without a migration; absent reads as 0. */
  dayDuelWins?: number;
}

export interface FlagsState {
  ftueDone: boolean;
  windDownShown: boolean;
}

/** Long-arc wellbeing signals the living world responds to (save v11). */
export interface WellbeingState {
  /** Last local day the player meditated — the sea remembers. */
  lastCalmDay: string | null;
}

/**
 * A remembered moment with a villager (Codex Book III: "People remember
 * people, not quest givers"). Memories resurface in greetings.
 */
export interface Memory {
  day: string; // YYYY-MM-DD local
  text: string;
  warmth: number; // bond points this moment was worth
}

/** The player's standing with one villager: bond points + what they remember. */
export interface VillagerBond {
  points: number;
  memories: readonly Memory[];
}

/** villagerId -> bond. Absent = not yet met meaningfully. (save v12) */
export type RelationshipState = Record<string, VillagerBond>;

/** A wish surfaced by the Wishing Well — a villager's small hope (save v14). */
export interface Wish {
  id: string;
  who: string;
  text: string;
  day: string; // YYYY-MM-DD local it was drawn
}

/**
 * Village Life: the post-story mini-game layer (save v14). Buildings "open their
 * doors" once the story is complete; attempts come from a daily token pool that
 * living well tops up — never bought. Energy is the entry cost (the late-game
 * sink). Rewards bank into the Repository + coins, with capped daily embers.
 */
export interface MinigameState {
  /** Mini-game ids the player has opened (one may open per day). */
  unlocked: readonly string[];
  /** Local day a game was last opened, so only one opens per day. */
  lastUnlockDay: string | null;
  /** Day the token/ember pool belongs to (resets at midnight). */
  day: string;
  /** Attempts available across all games today (living well tops this up). */
  tokens: number;
  /** Energy granted from mini-games today (capped, so play never out-earns life). */
  emberToday: number;
  /** Villager wishes drawn at the well, kept as small keepsakes. */
  wishes: readonly Wish[];
  /** Personal best per game id (higher = better; a warm memento, never a leaderboard). */
  bests?: Record<string, number>;
}

/** A player-placed decoration on the town map (normalized coords). */
export interface DecorPiece {
  id: number;
  art: string;
  x: number;
  y: number;
}

/** Player avatar block stored on the save (v19). Portrait-first: the player picks
 *  a painted bust (see data/avatar-portraits) that fits Emberhollow's style.
 *  `created` stays false until the picker is used once, so existing players carry
 *  a neutral traveller portrait until they choose to become themselves. */
export interface AvatarConfig {
  created: boolean;
  name?: string;
  pronouns?: string;
  /** Portrait def id (data/avatar-portraits). */
  portrait: string;
}

export interface GameState {
  version: number;
  /** Player avatar / identity (save v19). Optional: absent on pre-v19 saves and
   *  seeded neutral by migration, so the presence guard deliberately skips it.
   *  Distinct from Friend.avatar (a 1-6 palette index) — this is the player. */
  avatar?: AvatarConfig;
  healthLedger?: HealthLedgerState;
  chronicle: ChronicleState;
  stats: StatsState;
  achievements: readonly string[];
  /** Daily-quest ids claimed today (rotate with stats.day). */
  questsClaimed: readonly string[];
  /** Streak-milestone ids already celebrated (never re-awarded). */
  milestonesSeen?: readonly string[];
  /** Town-request ids fulfilled today (rotate/reset with stats.day). */
  requestsFilled?: readonly string[];
  /** Highest tier ever merged per chain (drives collection progress). */
  maxTier?: Record<string, number>;
  /** Collection ids already completed + rewarded (never re-awarded). */
  collectionsClaimed?: readonly string[];
  flags: FlagsState;
  board: BoardState;
  energy: EnergyState;
  actions: ActionState;
  social: SocialState;
  gratitude: GratitudeState;
  settings: Settings;
  prefs: Prefs;
  wellbeing: WellbeingState;
  /** How each villager remembers the player (Codex Book III). */
  relationships: RelationshipState;
  /** Building art id -> upgrade tier (0 = base L1, 1 = L2, 2 = L3). Coins buy pride, never power. */
  buildingUpgrades: Record<string, number>;
  /** Player-placed town decorations (coins buy beauty, never power). */
  decor: readonly DecorPiece[];
  nextDecorId: number;
  /** Village Life mini-games: unlock + daily attempt state (save v14). */
  minigames: MinigameState;
  /** The Keeper's Almanac: stamp id -> times found (0/absent = undiscovered). */
  almanac: Record<string, number>;
  /** Feature-ids the player has engaged with — clears their discovery glow for
   *  good (see core/discovery). Absent on old saves = nothing discovered yet. */
  discovered?: readonly string[];
  /** Items won from duels, spendable to progress the story. */
  repository: readonly RepositoryItem[];
  /** Consecutive duel wins → reward multiplier. */
  duelStreak: number;
  coins: number;
  /** Producer mode: 'story' goods or 'workshop' craft resources (defaults story). */
  producerMode?: 'story' | 'workshop';
  xp: number;
  orderIndex: number;
  storySeen: readonly string[];
  nextUid: number;
}
