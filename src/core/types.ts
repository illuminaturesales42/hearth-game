/** Shared domain types. Keep this file dependency-free. */

export type ChainId =
  | 'wood' | 'harvest' | 'hearthfire' | 'keepsake'
  // Resource library from the clean merge-chain sheet (art in item_<id>_<n>).
  | 'stone' | 'clay' | 'seeds' | 'flowers' | 'water' | 'copper'
  | 'fish' | 'honey' | 'herbs' | 'wool' | 'books' | 'music';

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

export interface LifeQuestDef {
  id: 'steps' | 'sleep' | 'water';
  label: string;
  energy: number;
  /** How the grant is sourced in production. Self-report in M1. */
  source: 'healthkit' | 'self-report';
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

/** A player-placed decoration on the town map (normalized coords). */
export interface DecorPiece {
  id: number;
  art: string;
  x: number;
  y: number;
}

export interface GameState {
  version: number;
  healthLedger?: HealthLedgerState;
  chronicle: ChronicleState;
  stats: StatsState;
  achievements: readonly string[];
  /** Daily-quest ids claimed today (rotate with stats.day). */
  questsClaimed: readonly string[];
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
