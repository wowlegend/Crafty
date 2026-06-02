import { describe, it, expect, beforeEach } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { normalizeItemName } from '../../src/data/items.js';

// M3-T3 save-normalizer guard: loadWorldData must strip the legacy leading emoji
// from every inventory key so old saves don't carry emoji-prefixed identities into
// the (now emoji-free) registry-keyed runtime. Built with \u escapes so this test
// file's source stays emoji-free where practical (the prefix bytes are DATA here).

const MEAT = '\u{1F969}'; // a meat glyph (legacy Raw Porkchop / Raw Beef prefix)
const HEART = '\u{2764}\u{FE0F}'; // a heart glyph + variation selector (legacy Health Potion prefix)

describe('M3-T3 save normalizer (loadWorldData)', () => {
  beforeEach(() => {
    // Reset only the inventory we care about; loadWorldData replaces it wholesale.
    useGameStore.setState({ terrainWorker: null });
  });

  it('strips a leading emoji from legacy inventory keys on load', () => {
    useGameStore.getState().loadWorldData({
      player_data: {
        inventory: {
          blocks: { [`${MEAT} Raw Porkchop`]: 3, 'Iron Sword': 1, grass: 64 },
          tools: { pickaxe: 1 },
          magic: { wand: 1 },
        },
      },
    });
    const inv = useGameStore.getState().inventory;
    expect(inv.blocks['Raw Porkchop']).toBe(3);
    expect(inv.blocks[`${MEAT} Raw Porkchop`]).toBeUndefined();
    // Already-clean keys pass through untouched.
    expect(inv.blocks['Iron Sword']).toBe(1);
    expect(inv.blocks.grass).toBe(64);
    expect(inv.tools.pickaxe).toBe(1);
    expect(inv.magic.wand).toBe(1);
  });

  it('MERGES quantities when two legacy keys normalize to the same clean name', () => {
    useGameStore.getState().loadWorldData({
      player_data: {
        inventory: {
          // A legacy emoji-prefixed key AND an already-clean key for the same item.
          blocks: { [`${HEART} Health Potion`]: 2, 'Health Potion': 5 },
          tools: {},
          magic: {},
        },
      },
    });
    const inv = useGameStore.getState().inventory;
    expect(inv.blocks['Health Potion']).toBe(7); // 2 + 5 merged
    expect(inv.blocks[`${HEART} Health Potion`]).toBeUndefined();
  });

  it('is safe with missing / empty inventory sections', () => {
    expect(() =>
      useGameStore.getState().loadWorldData({ player_data: { inventory: { blocks: {} } } })
    ).not.toThrow();
    const inv = useGameStore.getState().inventory;
    expect(inv.blocks).toEqual({});
  });

  it('normalizeItemName itself strips a single leading emoji + space', () => {
    expect(normalizeItemName(`${MEAT} Raw Beef`)).toBe('Raw Beef');
    expect(normalizeItemName(`${HEART} Health Potion`)).toBe('Health Potion');
    expect(normalizeItemName('Iron Sword')).toBe('Iron Sword'); // no-op when clean
  });
});
