/**
 * Village Life catalogue: which building opens which mini-game, and the pool of
 * villager wishes the Wishing Well surfaces. Data only — the engine lives in
 * ../core/minigames. Wave 1 ships three; the rest follow one building at a time.
 */

export interface MinigameDef {
  id: string;
  /** Town building (art id) whose card offers this game. */
  buildingArt: string;
  title: string;
  /** Play-button verb, e.g. "Drop a light". */
  verb: string;
  blurb: string;
  /** 'story' opens once the tale is told; 'l2' asks the building be cared for first. */
  unlock: 'story' | 'l2';
}

export const MINIGAMES: readonly MinigameDef[] = [
  {
    id: 'wishing-well',
    buildingArt: 'prop_well',
    title: 'The Wishing Well',
    verb: 'Drop a pebble',
    blurb: 'Drop a pebble, hear it clink, and a villager’s small wish rises with the ripples. Every wish takes root as a seed.',
    unlock: 'story',
  },
  {
    id: 'beacon-drop',
    buildingArt: 'prop_lighthouse',
    title: 'Beacon Drop',
    verb: 'Drop a light',
    blurb: 'Send a light-ember tumbling from the lantern room down to the boats below. Where it lands, the catch follows.',
    unlock: 'story',
  },
  {
    id: 'forge-strike',
    buildingArt: 'town_blacksmith',
    title: 'Strike While Hot',
    verb: 'Take up the hammer',
    blurb: 'The forge blooms with heat — strike each glowing spot before it cools. No harm in a miss; the copper still comes.',
    unlock: 'l2',
  },
];

export const MINIGAME_BY_ID: Record<string, MinigameDef> = Object.fromEntries(
  MINIGAMES.map((m) => [m.id, m]),
);

export function minigameForBuilding(art: string): MinigameDef | undefined {
  return MINIGAMES.find((m) => m.buildingArt === art);
}

/**
 * The wishes the well can surface — small, hopeful, in-world. Drawing one is a
 * delight, never a task; it may later seed an optional micro-quest.
 */
export const WISHES: readonly { who: string; text: string }[] = [
  { who: 'Marta', text: 'wishes the roses along the cottage wall would bloom again.' },
  { who: 'Bran', text: 'wishes for one quiet morning before the oven’s lit.' },
  { who: 'Wren', text: 'wishes a letter would come that isn’t bad news for once.' },
  { who: 'Sorin', text: 'wishes he’d kept the lamp burning all those years.' },
  { who: 'Joss', text: 'wishes the tide would bring back the little blue boat.' },
  { who: 'A child', text: 'wishes for a dog that would follow them home.' },
  { who: 'The baker’s wife', text: 'wishes the square would fill with music on Sundays again.' },
  { who: 'An old sailor', text: 'wishes to see the beacon lit just once more before the frost.' },
];
