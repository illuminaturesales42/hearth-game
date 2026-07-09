/**
 * Economy configuration. Everything here is designed to be remote-config
 * shaped: plain serializable data, no logic, live-tunable in M3.
 */
import type { ChainDef, ChainId, LifeQuestDef, OrderDef } from '../core/types';

export const CHAINS: readonly ChainDef[] = [
  {
    id: 'wood',
    name: 'Timberline',
    levels: ['🌱', '🪵', '🪚', '🔨', '🪑', '🚪', '🏠'],
    levelNames: ['Sapling', 'Log', 'Plank', 'Hammer', 'Chair', 'Door', 'Cottage'],
  },
  {
    id: 'harvest',
    name: 'Harvest',
    levels: ['🌾', '🥖', '🥧', '🎂', '🧺', '🍱', '🏆'],
    levelNames: ['Wheat', 'Loaf', 'Pie', 'Cake', 'Basket', 'Feast', 'Fair Prize'],
  },
  {
    id: 'hearthfire',
    name: 'Hearthfire',
    levels: ['🕯️', '🏮', '🔥', '🌟'],
    levelNames: ['Candle', 'Lantern', 'Hearthfire', 'Beacon'],
  },
  {
    // Chapter 2's story props: Wren's workshop of letters and salvage.
    id: 'keepsake',
    name: 'Keepsakes',
    levels: ['✉️', '📜', '🫖', '🛋️', '✒️', '🪢', '🛶'],
    levelNames: ['Letter', 'Stack of Paper', 'Kettle', 'Bench', 'Writing Desk', 'Fishing Net', 'Rowboat'],
  },

  // ── Resource library ─────────────────────────────────────────────────────
  // Painted art lives in item_<id>_<0..6> (from the clean merge-chain sheet);
  // the emoji are fallbacks only. These extend the world's craftable resources
  // for villager trades, rewards, and future chapters.
  {
    id: 'stone',
    name: 'Stoneworks',
    levels: ['🪨', '🪨', '⛰️', '🧱', '🧱', '🏛️', '🏛️'],
    levelNames: ['Pebbles', 'Rocks', 'Boulder', 'Cut Stone', 'Blocks', 'Wall', 'Arch'],
  },
  {
    id: 'clay',
    name: 'Pottery',
    levels: ['🟤', '🟤', '🔴', '⛰️', '🧱', '🏺', '🏺'],
    levelNames: ['Clay', 'Lump', 'Ball', 'Mound', 'Bricks', 'Kiln', 'Amphora'],
  },
  {
    id: 'seeds',
    name: 'Orchard',
    levels: ['🌰', '🌰', '🥜', '🌱', '🌿', '🪴', '🍎'],
    levelNames: ['Seed', 'Seeds', 'Acorn', 'Sprout', 'Seedling', 'Plant', 'Fruit Bush'],
  },
  {
    id: 'flowers',
    name: 'Blooms',
    levels: ['🌱', '🌼', '🌸', '💐', '🌷', '🌺', '🏵️'],
    levelNames: ['Bud', 'Bloom', 'Posy', 'Bouquet', 'Flower Bed', 'Wildflowers', 'Flower Cart'],
  },
  {
    id: 'water',
    name: 'Waterworks',
    levels: ['💧', '💦', '🥣', '🪣', '🛢️', '🚰', '⛲'],
    levelNames: ['Droplet', 'Splash', 'Bowl', 'Bucket', 'Barrel', 'Trough', 'Fountain'],
  },
  {
    id: 'copper',
    name: 'Coppersmith',
    levels: ['🟫', '🟠', '🪨', '🧱', '📏', '🟧', '🔩'],
    levelNames: ['Ore', 'Nuggets', 'Rubble', 'Ingot', 'Bar', 'Sheet', 'Pipes'],
  },
  {
    id: 'fish',
    name: 'Fishery',
    levels: ['🐟', '🐠', '🎣', '🪣', '🧺', '🐟', '📦'],
    levelNames: ['Fish', 'Pair', 'Catch', 'Pail', 'Basket', 'Rack', 'Crate'],
  },
  {
    id: 'honey',
    name: 'Apiary',
    levels: ['🌼', '🍯', '🐝', '🟨', '🥣', '🍯', '🛢️'],
    levelNames: ['Blossom', 'Comb', 'Honeycomb', 'Slab', 'Bowl', 'Jar', 'Barrel'],
  },
  {
    id: 'herbs',
    name: 'Apothecary',
    levels: ['🌿', '🌿', '🍃', '🪴', '🌱', '🌾', '⚗️'],
    levelNames: ['Leaf', 'Sprig', 'Bunch', 'Pot', 'Bush', 'Drying Rack', 'Apothecary'],
  },
  {
    id: 'wool',
    name: 'Weavery',
    levels: ['🐑', '☁️', '🧶', '🧶', '🧵', '🪡', '🎗️'],
    levelNames: ['Tuft', 'Fleece', 'Bundle', 'Yarn', 'Skeins', 'Bolt', 'Bale'],
  },
  {
    id: 'books',
    name: 'Library',
    levels: ['📝', '📄', '📕', '📗', '📚', '🗄️', '🏛️'],
    levelNames: ['Note', 'Papers', 'Book', 'Tome', 'Volumes', 'Bookcase', 'Library'],
  },
  {
    id: 'music',
    name: 'Conservatory',
    levels: ['🎵', '🎶', '📜', '🪕', '🎻', '🎹', '📻'],
    levelNames: ['Note', 'Notes', 'Score', 'Lute', 'Fiddle', 'Piano', 'Gramophone'],
  },

  // ── Builder's Yard ───────────────────────────────────────────────────────
  // Merge chains that climb from raw materials to a finished building. Crafted
  // in the Workshop; the top-tier structures sell for a premium (sellValue).
  {
    id: 'homestead',
    name: 'The Homestead',
    levels: ['🪵', '🧱', '🏺', '🏚️', '🏠'],
    levelNames: ['Driftwood', 'Cut Stone', 'Kiln', 'Cottage Frame', 'Cottage'],
  },
  {
    id: 'greenhouse',
    name: 'The Greenhouse',
    levels: ['🍎', '🪨', '🪴', '🌱', '🌸', '🏡'],
    levelNames: ['Windfall', 'Rubble', 'Potted Sprout', 'Planter', 'Flower Cart', 'Greenhouse'],
  },
  {
    id: 'smithy',
    name: 'The Smithy',
    levels: ['💧', '🪣', '🌷', '💐', '⛲', '🔥'],
    levelNames: ['Spring', 'Pail', 'Flower Pot', 'Flower Box', 'Well', 'Forge'],
  },
  {
    id: 'apothecary',
    name: 'The Apothecary',
    levels: ['🪨', '🟫', '🧪', '🌾', '🛢️', '⚗️', '🏬'],
    levelNames: ['Ore', 'Copper', 'Mortar', 'Harvest', 'Barrel', 'Tincture', 'Apothecary'],
  },
] as const;

export const BOARD_COLS = 6;
export const BOARD_ROWS = 7;
/** Cell index of the producer crate. */
export const PRODUCER_INDEX = 21; // row 3, col 3

/** Which chains the producer can spawn, with weights. */
export const SPAWN_TABLE: readonly { chain: ChainId; weight: number }[] = [
  { chain: 'wood', weight: 34 },
  { chain: 'harvest', weight: 34 },
  { chain: 'hearthfire', weight: 14 },
  { chain: 'keepsake', weight: 18 },
];

/**
 * The Workshop side-economy. Once unlocked, the producer can be switched to
 * "workshop" mode to spawn craft resources instead of story goods — kept fully
 * separate from SPAWN_TABLE so it never dilutes order pacing. Resources are
 * earned into coins (sold or via Town Requests), never into energy or power.
 */
export const RESOURCE_SPAWN_TABLE: readonly { chain: ChainId; weight: number }[] = [
  { chain: 'stone', weight: 20 },
  { chain: 'clay', weight: 16 },
  { chain: 'flowers', weight: 14 },
  { chain: 'water', weight: 14 },
  { chain: 'herbs', weight: 12 },
  { chain: 'wool', weight: 12 },
  // Builder's Yard — rarer, a longer climb to a sellable building.
  { chain: 'homestead', weight: 6 },
  { chain: 'greenhouse', weight: 6 },
  { chain: 'smithy', weight: 6 },
  { chain: 'apothecary', weight: 6 },
];

/** Chains that climb to a building — their top tiers sell for a premium. */
export const BUILDER_CHAINS: ReadonlySet<ChainId> = new Set(['homestead', 'greenhouse', 'smithy', 'apothecary']);

/** Deliveries completed before the Workshop mode unlocks (mid Chapter 1). */
export const WORKSHOP_UNLOCK_AT = 6;

/**
 * Coins a sold item is worth. Ordinary items are a modest sink-clear; a
 * finished Builder's-Yard structure is a real payday (the reward for the long
 * climb) — coins only, never energy or power.
 */
export function sellValue(chain: ChainId, level: number): number {
  if (BUILDER_CHAINS.has(chain)) return 12 + level * level * 6; // steep: the building is the prize
  return 2 + level * 2;
}

export const ENERGY = {
  /** Starting balance for a fresh save. */
  initial: 12,
  /** Passive regen: 1 energy per this many ms. */
  regenMs: 3 * 60_000,
  /** Regen only accrues up to this cap; life-quest energy can exceed it. */
  regenCap: 30,
  /** Cost to tap the producer once. */
  spawnCost: 1,
} as const;

export const LIFE_QUESTS: readonly LifeQuestDef[] = [
  { id: 'steps', label: '4,200 steps', energy: 6, source: 'self-report' },
  { id: 'sleep', label: '7.5h sleep', energy: 8, source: 'self-report' },
  { id: 'water', label: 'Drink a glass of water', energy: 2, source: 'self-report' },
] as const;

/**
 * Chapter 1: The Letter. 12 orders; the order chain doubles as the story
 * spine, and every 3rd delivery advances a village restoration stage.
 */
export const ORDERS: readonly OrderDef[] = [
  {
    id: 'c1-01', who: 'Bran the baker',
    need: { chain: 'wood', level: 2 },
    text: 'Welcome to Emberhollow. The storm took half the square and the post office took the other half. Cut me planks and we’ll start with the notice board.',
    resolution: 'The notice board goes up. Pinned dead centre: a letter addressed to nobody, postmarked seventeen years ago.',
    rewardEnergy: 3, rewardCoins: 15,
  },
  {
    id: 'c1-02', who: 'Bran the baker',
    need: { chain: 'wood', level: 3 },
    text: 'That letter is Marta’s hand, I’d swear it on my ovens. Speaking of which, mine died the night it arrived. Bring a hammer and I’ll show you what it was hiding.',
    resolution: 'Inside the oven flue: a brass key, and a note. "Don’t trust the lighthouse keeper."',
    rewardEnergy: 4, rewardCoins: 20,
  },
  {
    id: 'c1-03', who: 'Wren the postmistress',
    need: { chain: 'hearthfire', level: 1 },
    text: 'A letter with no name wants reading by proper light. Bring me a lantern and keep your voice down.',
    resolution: 'Wren reads twice, then folds it fast. "It’s dated three days from now. That’s not possible."',
    rewardEnergy: 4, rewardCoins: 25,
  },
  {
    id: 'c1-04', who: 'Bran the baker',
    need: { chain: 'harvest', level: 2 },
    text: 'The keeper won’t talk to strangers. Everyone talks over pie. Bake one.',
    resolution: 'The keeper eats in silence, then whispers: "Marta didn’t drown. She rowed north."',
    rewardEnergy: 5, rewardCoins: 30,
  },
  {
    id: 'c1-05', who: 'Old Keeper Sorin',
    need: { chain: 'wood', level: 4 },
    text: 'You want the rest of it, you sit like a guest. My last chair went into the stove the winter the light went out.',
    resolution: 'Sorin sits, finally. "The light didn’t fail that night. Somebody shuttered it. I kept the bolt they used."',
    rewardEnergy: 5, rewardCoins: 35,
  },
  {
    id: 'c1-06', who: 'Old Keeper Sorin',
    need: { chain: 'hearthfire', level: 2 },
    text: 'If she rowed north she followed the old light. Kindle a hearthfire so she can find her way back.',
    resolution: 'The fire takes. Far out on the water, something answers with a flash. The square lamps come on for the first time in years.',
    rewardEnergy: 6, rewardCoins: 40,
  },
  {
    id: 'c1-07', who: 'Wren the postmistress',
    need: { chain: 'harvest', level: 4 },
    text: 'Half the village saw that flash and now they’re all in my post office asking questions. Feed them. A full basket buys us an hour of quiet.',
    resolution: 'Over bread and quiet, Wren lays out the letters. Nine of them. All Marta’s hand. All dated after she vanished.',
    rewardEnergy: 6, rewardCoins: 45,
  },
  {
    id: 'c1-08', who: 'Bran the baker',
    need: { chain: 'wood', level: 5 },
    text: 'The bakery cellar has a door I nailed shut the year she left. I’m ready to open it. Build me a new one first, so I can close it again if I’m wrong.',
    resolution: 'Behind the old door: an oilskin chart of the northern shoals, marked in Marta’s ink. One cove is circled twice.',
    rewardEnergy: 7, rewardCoins: 55,
  },
  {
    id: 'c1-09', who: 'Old Keeper Sorin',
    need: { chain: 'hearthfire', level: 3 },
    text: 'That cove sits behind the black rocks. A hearthfire won’t reach it. Build me a beacon and I’ll aim it myself.',
    resolution: 'The beacon sweeps the shoals. On the third pass it catches a rowboat, hauled above the tideline. Recently.',
    rewardEnergy: 8, rewardCoins: 65,
  },
  {
    id: 'c1-10', who: 'Wren the postmistress',
    need: { chain: 'harvest', level: 5 },
    text: 'If she’s coming in off that water she’ll be hungrier than pride allows. Set a proper feast. We’ll do the asking after.',
    resolution: 'Nobody comes to the feast. But in the morning a tenth letter is on the notice board. It says: "Fix the cottage. Please."',
    rewardEnergy: 8, rewardCoins: 75,
  },
  {
    id: 'c1-11', who: 'Old Keeper Sorin',
    need: { chain: 'wood', level: 6 },
    text: 'She’ll need a roof when she lands. The old cottage went to ruin the year she left. Build it back.',
    resolution: 'At dawn, smoke rises from the cottage chimney. Someone is home.',
    rewardEnergy: 9, rewardCoins: 90,
  },
  {
    id: 'c1-12', who: 'Marta',
    need: { chain: 'harvest', level: 3 },
    text: 'Seventeen missed birthdays. We are fixing one of them tonight. Make a cake.',
    resolution: 'Marta sets a slice by the window, "for whoever is still out there." Behind her, unread, the eleventh letter.',
    rewardEnergy: 10, rewardCoins: 120,
  },

  // ============================================================
  // Chapter 2 — Shadows in the Sand (from the season-arc sheet).
  // The villagers search the shoreline and the past for the next clues.
  // ============================================================
  {
    id: 'c2-01', who: 'Wren the postmistress',
    need: { chain: 'hearthfire', level: 1 },
    text: 'Bring me a lantern. The square gets dark early.',
    resolution: 'Its light reveals faint bootprints in the sand — leading to the north cove.',
    rewardEnergy: 4, rewardCoins: 25,
  },
  {
    id: 'c2-02', who: 'Bran the baker',
    need: { chain: 'harvest', level: 1 },
    text: 'Bake a loaf of bread. My hands are full.',
    resolution: 'He shares that Marta used to leave notes in his flour sacks.',
    rewardEnergy: 4, rewardCoins: 30,
  },
  {
    id: 'c2-03', who: 'Old Keeper Sorin',
    need: { chain: 'keepsake', level: 3 },
    text: 'I’ll need a sturdy bench. The old one won’t do.',
    resolution: 'Underneath it, he finds a rusted coin from a ship called The Marigold.',
    rewardEnergy: 5, rewardCoins: 35,
  },
  {
    id: 'c2-04', who: 'Wren the postmistress',
    need: { chain: 'keepsake', level: 0 },
    text: 'Sort through these letters with me.',
    resolution: 'One is addressed to Marta… but the postmark is yesterday.',
    rewardEnergy: 5, rewardCoins: 40,
  },
  {
    id: 'c2-05', who: 'Bran the baker',
    need: { chain: 'harvest', level: 2 },
    text: 'Bring me a pie. Something to warm the belly.',
    resolution: 'He remembers the night of the storm — a stranger argued with Marta.',
    rewardEnergy: 6, rewardCoins: 45,
  },
  {
    id: 'c2-06', who: 'Fisher Joss',
    need: { chain: 'keepsake', level: 5 },
    text: 'I need a fishing net. The tide’s been strange.',
    resolution: 'He caught a torn scrap of oilskin with the letters A.V. stitched inside.',
    rewardEnergy: 6, rewardCoins: 50,
  },
  {
    id: 'c2-07', who: 'Wren the postmistress',
    need: { chain: 'keepsake', level: 4 },
    text: 'A writing desk would help.',
    resolution: 'Inside the drawer: a tide chart with hidden markings.',
    rewardEnergy: 7, rewardCoins: 55,
  },
  {
    id: 'c2-08', who: 'Old Keeper Sorin',
    need: { chain: 'keepsake', level: 2 },
    text: 'A kettle. The tea here is worse than the weather.',
    resolution: 'He softens, and admits the old keeper wasn’t alone that night.',
    rewardEnergy: 7, rewardCoins: 60,
  },
  {
    id: 'c2-09', who: 'Bran the baker',
    need: { chain: 'harvest', level: 3 },
    text: 'Bake a cake for the workers.',
    resolution: 'Overheard: two men whisper about payments and silence.',
    rewardEnergy: 8, rewardCoins: 70,
  },
  {
    id: 'c2-10', who: 'Wren the postmistress',
    need: { chain: 'keepsake', level: 1 },
    text: 'A stack of paper. I’ll copy these letters.',
    resolution: 'One page has invisible ink — the name Alden Vale appears.',
    rewardEnergy: 8, rewardCoins: 80,
  },
  {
    id: 'c2-11', who: 'Old Keeper Sorin',
    need: { chain: 'keepsake', level: 6 },
    text: 'Help me fix the rowboat.',
    resolution: 'He shows where it was locked away — and why: someone followed her.',
    rewardEnergy: 9, rewardCoins: 90,
  },
  {
    id: 'c2-12', who: 'The whole village',
    need: { chain: 'harvest', level: 5 },
    text: 'Prepare a feast for the village. We’ve come far.',
    resolution: 'Trust grows. Marta opens the eleventh letter… but not yet.',
    rewardEnergy: 10, rewardCoins: 150,
  },

  // ============================================================
  // Chapter 3 — The Ninth Night. The town is whole again; now the
  // truth of the storm surfaces. Alden Vale paid to shutter the light
  // and wreck the ships. Marta came home to relight the true beacon —
  // and the village stands with her. Warm, hopeful, resolved.
  // ============================================================
  {
    id: 'c3-01', who: 'Marta',
    need: { chain: 'keepsake', level: 2 },
    text: 'Boil the kettle. I’ll tell it properly this time — from the ninth night on.',
    resolution: 'She sets the eleventh letter on the sill, still sealed. "Not until it’s finished."',
    rewardEnergy: 10, rewardCoins: 160,
  },
  {
    id: 'c3-02', who: 'Wren the postmistress',
    need: { chain: 'keepsake', level: 1 },
    text: 'Copy the nine letters out, in order. I think they’re not letters at all.',
    resolution: 'Laid in a row, they read as a keeper’s log — a warning, written forward, night by night.',
    rewardEnergy: 11, rewardCoins: 175,
  },
  {
    id: 'c3-03', who: 'Old Keeper Sorin',
    need: { chain: 'hearthfire', level: 2 },
    text: 'Kindle the old brazier. I’ll say aloud what I’ve carried too long.',
    resolution: 'Sorin confesses: he took Vale’s coin to shutter the light, told the ships were empty. They were not.',
    rewardEnergy: 11, rewardCoins: 190,
  },
  {
    id: 'c3-04', who: 'Fisher Joss',
    need: { chain: 'harvest', level: 2 },
    text: 'Bake something for the tide — I’m rowing the shoals where the light should have been.',
    resolution: 'Joss finds the wreck Vale profited from, and a strongbox chained to the keel.',
    rewardEnergy: 12, rewardCoins: 205,
  },
  {
    id: 'c3-05', who: 'Bran the baker',
    need: { chain: 'harvest', level: 4 },
    text: 'The divers work cold water. A full basket keeps them down long enough.',
    resolution: 'The strongbox comes up. Inside: Vale’s ledgers — names, payments, every shuttered night.',
    rewardEnergy: 12, rewardCoins: 220,
  },
  {
    id: 'c3-06', who: 'Wren the postmistress',
    need: { chain: 'keepsake', level: 5 },
    text: 'The tide’s taking loose pages. Bring a net — we save every word.',
    resolution: 'Netted from the surf: the ledger’s last page, and a threat in Vale’s own hand.',
    rewardEnergy: 13, rewardCoins: 235,
  },
  {
    id: 'c3-07', who: 'Marta',
    need: { chain: 'wood', level: 4 },
    text: 'Build a chair for the square. When Vale comes, he’ll sit and hear the town.',
    resolution: 'Vale arrives, all charm and warning. The chair waits. So does Emberhollow.',
    rewardEnergy: 13, rewardCoins: 255,
  },
  {
    id: 'c3-08', who: 'Old Keeper Sorin',
    need: { chain: 'hearthfire', level: 3 },
    text: 'Build the true beacon — the one I should have lit. Let every ship see it.',
    resolution: 'The beacon blazes over the shoals. No wreck will be made in the dark again.',
    rewardEnergy: 14, rewardCoins: 280,
  },
  {
    id: 'c3-09', who: 'Marta',
    need: { chain: 'keepsake', level: 6 },
    text: 'Mend the rowboat I came home in. I want it seaworthy — but I’m staying.',
    resolution: 'She names it for the harbour. A boat to leave in is a boat that chooses to stay.',
    rewardEnergy: 14, rewardCoins: 300,
  },
  {
    id: 'c3-10', who: 'The whole village',
    need: { chain: 'harvest', level: 5 },
    text: 'Set the feast. Whatever tonight brings, we meet it together — and fed.',
    resolution: 'The revenue men take Vale, undone by his own ledgers. The square lets out a long breath.',
    rewardEnergy: 15, rewardCoins: 320,
  },
  {
    id: 'c3-11', who: 'Wren the postmistress',
    need: { chain: 'keepsake', level: 3 },
    text: 'A bench by the window. Somewhere to read a thing seventeen years unread.',
    resolution: 'Marta sits, and at last breaks the seal on the eleventh letter.',
    rewardEnergy: 15, rewardCoins: 340,
  },
  {
    id: 'c3-12', who: 'Marta',
    need: { chain: 'harvest', level: 6 },
    text: 'One more, and it’s a proper fair. The whole harbour, out under the light.',
    resolution: 'The eleventh letter was to Emberhollow itself: "Keep the light. I’m coming home." She is. The fair blazes till dawn.',
    rewardEnergy: 16, rewardCoins: 400,
  },

  // ============================================================
  // Chapter 4 — New Sails. With the true beacon lit, the ships and
  // people the storm once scattered begin finding their way back.
  // Emberhollow isn’t only restored now — it’s growing. A warm arc
  // about homecoming, welcome, and a town that outlasts its worst night.
  // ============================================================
  {
    id: 'c4-01', who: 'Wren the postmistress',
    need: { chain: 'hearthfire', level: 1 },
    text: 'A sail on the horizon, holding to the light. Hang a lantern so they know they’re seen.',
    resolution: 'It’s the Marigold’s lost crew — carried off the night of the storm, guided home at last.',
    rewardEnergy: 16, rewardCoins: 410,
  },
  {
    id: 'c4-02', who: 'Fisher Joss',
    need: { chain: 'harvest', level: 2 },
    text: 'They’re half-starved and salt-worn. Something hot in their hands first.',
    resolution: 'Over the food they talk: they sailed north with Marta, all those years, and never stopped hoping.',
    rewardEnergy: 16, rewardCoins: 425,
  },
  {
    id: 'c4-03', who: 'Old Keeper Sorin',
    need: { chain: 'wood', level: 4 },
    text: 'Their eldest can barely stand. Build a chair by my fire for him.',
    resolution: 'He was the keeper before Sorin. The two old men sit late, and forgive each other everything.',
    rewardEnergy: 17, rewardCoins: 445,
  },
  {
    id: 'c4-04', who: 'Bran the baker',
    need: { chain: 'harvest', level: 3 },
    text: 'There’s a child among them — born at sea, never seen a harbour. Bake her a cake.',
    resolution: 'The town’s first cake for its newest arrival. Emberhollow remembers how to celebrate a beginning.',
    rewardEnergy: 17, rewardCoins: 465,
  },
  {
    id: 'c4-05', who: 'Marta',
    need: { chain: 'keepsake', level: 4 },
    text: 'A writing desk. I’ll send to every family the light might reach.',
    resolution: 'The letters go out — no longer warnings, but invitations. Come home. The light is lit.',
    rewardEnergy: 18, rewardCoins: 485,
  },
  {
    id: 'c4-06', who: 'Wren the postmistress',
    need: { chain: 'keepsake', level: 1 },
    text: 'Copies for every harbour down the coast. Paper — a great deal of it.',
    resolution: 'Word runs the coastline like a tide. More sails turn toward Emberhollow.',
    rewardEnergy: 18, rewardCoins: 505,
  },
  {
    id: 'c4-07', who: 'Fisher Joss',
    need: { chain: 'keepsake', level: 5 },
    text: 'The fleet’s growing faster than our nets. Bring more — good, strong ones.',
    resolution: 'The harbour bustles as it hasn’t in a generation. Joss can’t stop grinning.',
    rewardEnergy: 18, rewardCoins: 525,
  },
  {
    id: 'c4-08', who: 'Bran the baker',
    need: { chain: 'harvest', level: 4 },
    text: 'A basket of provisions for the newcomers’ first week. No one arrives hungry here.',
    resolution: 'The town shares what the storm nearly took from it. It’s enough. It’s always enough now.',
    rewardEnergy: 19, rewardCoins: 550,
  },
  {
    id: 'c4-09', who: 'Old Keeper Sorin',
    need: { chain: 'hearthfire', level: 2 },
    text: 'The square’s too full for one fire. Kindle a second hearth.',
    resolution: 'Two fires burning now, and room around both. Warmth to spare, and to give.',
    rewardEnergy: 19, rewardCoins: 570,
  },
  {
    id: 'c4-10', who: 'Marta',
    need: { chain: 'wood', level: 6 },
    text: 'The old keeper’s family need a home. Build a cottage where the ruin stood.',
    resolution: 'A warm-windowed cottage rises on the last bare plot. Not a shell — a home.',
    rewardEnergy: 20, rewardCoins: 600,
  },
  {
    id: 'c4-11', who: 'The whole village',
    need: { chain: 'harvest', level: 5 },
    text: 'A welcome feast — every soul who found their way back, at one long table.',
    resolution: 'Strangers become neighbours over shared bread. By dessert, no one’s a stranger at all.',
    rewardEnergy: 20, rewardCoins: 640,
  },
  {
    id: 'c4-12', who: 'Marta',
    need: { chain: 'harvest', level: 6 },
    text: 'Make it a fair to remember. The Beacon Fair — from now on, every autumn.',
    resolution: 'Emberhollow isn’t just restored — it’s growing. The light stays lit, and it reaches further than anyone dreamed.',
    rewardEnergy: 22, rewardCoins: 750,
  },
] as const;

/** Chapters: metadata over the flat ORDERS spine. */
export const CHAPTERS: readonly {
  id: number;
  title: string;
  start: number; // first order index
  end: number; // one past the last order index
  cliffhanger: string;
}[] = [
  {
    id: 1, title: 'The Letter', start: 0, end: 12,
    cliffhanger: 'A name is found in the sand — the same as on the letters.',
  },
  {
    id: 2, title: 'Shadows in the Sand', start: 12, end: 24,
    cliffhanger: 'A smuggler’s log reveals a payment made just before the storm.',
  },
  {
    id: 3, title: 'The Ninth Night', start: 24, end: 36,
    cliffhanger: 'The true beacon is lit, Vale is undone, and Marta is home for good.',
  },
  {
    id: 4, title: 'New Sails', start: 36, end: 48,
    cliffhanger: 'The beacon reaches further than anyone dreamed — and more are coming home.',
  },
] as const;

/** Homestead art stage (0–4) spread across the whole MVP story. */
export function stageFor(orderIndex: number): number {
  const thresholds = [0, 5, 10, 16, 22];
  let s = 0;
  for (let k = 0; k < thresholds.length; k++) if (orderIndex >= thresholds[k]!) s = k;
  return s;
}

export function chapterFor(orderIndex: number) {
  return CHAPTERS.find((c) => orderIndex >= c.start && orderIndex < c.end) ?? CHAPTERS[CHAPTERS.length - 1]!;
}

/** Village restoration stages, unlocked by delivered-order count (spans both chapters). */
export const ZONE_STAGES: readonly { at: number; label: string }[] = [
  { at: 0, label: 'Storm-struck square' },
  { at: 3, label: 'Notice board and lamplight' },
  { at: 6, label: 'Bakery breathing again' },
  { at: 9, label: 'Beacon on the shoals' },
  { at: 12, label: 'Emberhollow, restored' },
  { at: 15, label: 'The workshop repaired' },
  { at: 20, label: 'The lighthouse path cleared' },
  { at: 24, label: 'The docks, revealed' },
] as const;

/**
 * Deliveries that fully rebuild Emberhollow (all buildings + zones restored).
 * Restoration % is capped here so later story chapters — which continue past a
 * fully-restored town — never make the "% restored" bar regress.
 */
export const RESTORE_ORDERS = Math.max(...ZONE_STAGES.map((z) => z.at));
