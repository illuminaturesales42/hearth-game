/**
 * The Market: coins buy beauty and comfort, never power (a hard pillar).
 * Board skins are purely cosmetic — a soft wash of colour over the play field —
 * so nothing here touches energy, spawns, or merge odds.
 */
export interface BoardSkin {
  id: string;
  name: string;
  note: string;
  cost: number; // coins; 0 = free/default
  /** Swatch shown in the shop. */
  swatch: string;
  /** Overlay colour blended over the board (transparent = no wash). */
  tint: string;
}

export const BOARD_SKINS: readonly BoardSkin[] = [
  { id: 'classic', name: 'Meadow', note: 'The village green.', cost: 0, swatch: '#8aa03a', tint: 'transparent' },
  { id: 'autumn', name: 'Autumn Harvest', note: 'Warm amber over the field.', cost: 150, swatch: '#c8792a', tint: 'rgba(210, 120, 40, 0.30)' },
  { id: 'twilight', name: 'Harbour Dusk', note: 'Cool indigo, lamps just lit.', cost: 220, swatch: '#4a5aa8', tint: 'rgba(70, 92, 180, 0.32)' },
  { id: 'rose', name: 'Festival Bloom', note: 'A festival flush of rose.', cost: 260, swatch: '#c85a8c', tint: 'rgba(210, 90, 140, 0.28)' },
  { id: 'frost', name: 'Winter Harbour', note: 'A cool hush of frost.', cost: 300, swatch: '#8fb8d8', tint: 'rgba(150, 195, 230, 0.30)' },
  { id: 'ember', name: 'Deep Ember', note: 'The forge-glow of the hearth.', cost: 340, swatch: '#b8481a', tint: 'rgba(200, 80, 30, 0.30)' },
] as const;

export function skinById(id: string): BoardSkin {
  return BOARD_SKINS.find((s) => s.id === id) ?? BOARD_SKINS[0]!;
}
