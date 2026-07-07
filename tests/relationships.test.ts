import { describe, expect, it } from 'vitest';
import {
  bondFor,
  deliveryMemory,
  greetingFor,
  hearts,
  initialRelationships,
  isDear,
  recordMemory,
  restoreMemory,
} from '../src/core/relationships';
import { villagerIdFor } from '../src/data/villagers';
import { Game } from '../src/core/game';
import { ORDERS } from '../src/data/economy';
import { migrateState } from '../src/core/save';
import { findItem, withItem } from '../src/core/board';

describe('relationships core (Codex Book III)', () => {
  it('starts empty; unknown villagers have no bond', () => {
    const s = initialRelationships();
    expect(bondFor(s, 'bran').points).toBe(0);
    expect(hearts(bondFor(s, 'bran').points)).toBe(0);
  });

  it('records memories newest-first and accrues bond points (immutably)', () => {
    const s0 = initialRelationships();
    const s1 = recordMemory(s0, 'bran', deliveryMemory('2026-07-07', 'Bran', 'Bread'));
    const s2 = recordMemory(s1, 'bran', restoreMemory('2026-07-08', 'Bran’s Bakery'));
    expect(s0).toEqual({}); // original untouched
    expect(s2.bran!.points).toBe(2 + 3);
    expect(s2.bran!.memories[0]!.text.toLowerCase()).toContain('bakery');
    expect(s2.bran!.memories[1]!.text.toLowerCase()).toContain('bran');
  });

  it('hearts cap at 5 but points keep climbing (dear friends)', () => {
    let s = initialRelationships();
    for (let i = 0; i < 20; i++) s = recordMemory(s, 'wren', deliveryMemory('2026-07-07', 'Wren', 'Letter'));
    expect(hearts(bondFor(s, 'wren').points)).toBe(5);
    expect(isDear(s, 'wren')).toBe(true);
    expect(bondFor(s, 'wren').points).toBe(40);
  });

  it('keeps at most 8 memories', () => {
    let s = initialRelationships();
    for (let i = 0; i < 12; i++) s = recordMemory(s, 'joss', deliveryMemory('2026-07-07', 'Joss', `Net ${i}`));
    expect(s.joss!.memories).toHaveLength(8);
    expect(s.joss!.memories[0]!.text).toContain('net 11');
  });

  it('greeting warms with the bond and resurfaces the latest memory', () => {
    const cold = greetingFor(initialRelationships(), 'sorin');
    expect(cold).toContain('still getting to know');
    let s = initialRelationships();
    for (let i = 0; i < 12; i++) s = recordMemory(s, 'sorin', deliveryMemory('2026-07-07', 'Sorin', 'Keepsake'));
    const warm = greetingFor(s, 'sorin');
    expect(warm).toContain('lights up');
    expect(warm).toContain('They remember');
  });

  it('maps order givers to villager ids', () => {
    expect(villagerIdFor('Bran the baker')).toBe('bran');
    expect(villagerIdFor('Fisher Joss')).toBe('joss');
    expect(villagerIdFor('Old Keeper Sorin')).toBe('sorin');
    expect(villagerIdFor('Wren the postmistress')).toBe('wren');
    expect(villagerIdFor('The whole village')).toBeNull();
  });
});

describe('relationships integrate with delivery', () => {
  // Put the item the first order needs on the board, then deliver it.
  function deliverFirstOrder(g: Game): string {
    const order = ORDERS[g.snapshot.orderIndex]!;
    // seed a matching item into an empty cell
    const board = g.snapshot.board;
    const empty = board.cells.findIndex((c) => c.kind === 'empty');
    const seeded = withItem(board, empty, { chain: order.need.chain, level: order.need.level, uid: 9999 });
    // reach into the game via a fresh delivery: use the public API by crafting state
    (g as unknown as { state: typeof g.snapshot }).state = { ...g.snapshot, board: seeded };
    g.deliver();
    return order.who;
  }

  it('a delivery grows the giver’s bond and is remembered', () => {
    const g = new Game(1000);
    const who = deliverFirstOrder(g);
    const vid = villagerIdFor(who);
    expect(vid).not.toBeNull();
    if (!vid) return;
    const b = g.bond(vid);
    expect(b.points).toBeGreaterThanOrEqual(2);
    expect(g.snapshot.relationships[vid]!.memories.length).toBeGreaterThan(0);
  });

  it('emits a bond event on delivery', () => {
    const g = new Game(1000);
    const events: string[] = [];
    g.subscribe((ev) => { if (ev.type === 'bond') events.push(ev.villagerId); });
    deliverFirstOrder(g);
    expect(events.length).toBeGreaterThan(0);
  });

  it('relationships survive the save round-trip and migrate from v11', () => {
    const g = new Game(1000);
    deliverFirstOrder(g);
    const revived = migrateState(JSON.parse(JSON.stringify(g.snapshot)));
    expect(revived).not.toBeNull();
    expect(Object.keys(revived!.relationships).length).toBeGreaterThan(0);

    const v11 = { ...(JSON.parse(JSON.stringify(g.snapshot)) as Record<string, unknown>), version: 11 };
    delete (v11 as Record<string, unknown>).relationships;
    const up = migrateState(v11);
    expect(up).not.toBeNull();
    expect(up!.version).toBeGreaterThanOrEqual(12);
    expect(up!.relationships).toEqual({});
  });

  // sanity: findItem still resolves what we seeded (guards the helper)
  it('seed helper places a deliverable item', () => {
    const g = new Game(1000);
    const order = ORDERS[0]!;
    const board = withItem(g.snapshot.board, g.snapshot.board.cells.findIndex((c) => c.kind === 'empty'), {
      chain: order.need.chain, level: order.need.level, uid: 1,
    });
    expect(findItem(board, order.need.chain, order.need.level)).toBeGreaterThanOrEqual(0);
  });
});
