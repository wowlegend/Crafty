// R4a — BLOCK ID ROUND-TRIP. The hotbar must not lie.
//
// THE BUG THIS LOCKS: Terrain.jsx kept TWO independent hand-written maps — name->id for the PLACE path
// (:724) and id->name for the MINE path (:585). They drifted, and the game shipped a hotbar where selecting
// Diamond and clicking placed a grey STONE block:
//     diamond/gold/iron/coal -> 3 (stone)  instead of 13/12/11/10
//     water                  -> 4 (SAND)   instead of 9
//     glass/cobblestone/lava -> 3 (stone)  -- these have NO engine id at all
//     unmapped               -> `|| 1`     (grass)
// 4 of the 9 HOTBAR_BLOCKS placed the wrong material. In a voxel BUILDER, the palette is the product.
//
// The invariant, stated once: for every block the engine can place, place(x) must read back as x.
// This is a PROPERTY test over the whole block set, not a spot-check — and it is BEHAVIORAL (it exercises
// the real resolvers), not a source-grep (LOOP-CHARTER §3).
import { describe, it, expect } from 'vitest';
import { BLOCK_ID, BLOCK_NAME, BLOCK_ALIAS, UNPLACEABLE, idForBlock, blockForId } from '../../src/world/blockIds.js';
import { BLOCK_TYPES, HOTBAR_BLOCKS } from '../../src/world/Blocks.js';

describe('R4a — block id round-trip (the hotbar must not lie)', () => {
  it('every engine-supported block round-trips: place(x) -> read back == x', () => {
    const names = Object.keys(BLOCK_ID).filter((n) => n !== 'air');
    for (const name of names) {
      const id = idForBlock(name);
      expect(id, `${name} must resolve to an id`).not.toBeNull();
      expect(blockForId(id), `${name} must round-trip (placed id ${id} reads back as ${name})`).toBe(name);
    }
  });

  it('the ORES keep their identity — a placed diamond is NOT stone', () => {
    // The headline bug. These were all collapsed to 3 (stone).
    expect(idForBlock('diamond')).toBe(13);
    expect(idForBlock('gold')).toBe(12);
    expect(idForBlock('iron')).toBe(11);
    expect(idForBlock('coal')).toBe(10);
    expect(idForBlock('stone')).toBe(3);
    // ...and none of them may collide with stone.
    for (const ore of ['diamond', 'gold', 'iron', 'coal']) {
      expect(idForBlock(ore), `${ore} must not be stone`).not.toBe(idForBlock('stone'));
    }
  });

  it('water is water, not sand (they used to collide on id 4)', () => {
    expect(idForBlock('water')).toBe(9);
    expect(idForBlock('sand')).toBe(4);
    expect(idForBlock('water')).not.toBe(idForBlock('sand'));
  });

  it('the id space is INJECTIVE — no two distinct blocks share an id', () => {
    const ids = Object.entries(BLOCK_ID).filter(([n]) => n !== 'air').map(([, id]) => id);
    expect(new Set(ids).size, 'two blocks share a voxel id — that is how diamond became stone').toBe(ids.length);
  });

  it('a block the engine CANNOT place is REFUSED (null), never silently substituted', () => {
    // The old code turned these into stone (id 3) and an unmapped name into grass (`|| 1`). A silent
    // substitution is how a builder lies to its player. Refusing is honest; the caller must handle it.
    for (const name of UNPLACEABLE) {
      expect(idForBlock(name), `${name} has no engine id — it must be refused, not turned into stone`).toBeNull();
    }
    expect(idForBlock('definitely_not_a_block')).toBeNull();
    expect(idForBlock(undefined)).toBeNull();
    expect(idForBlock('')).toBeNull();
  });

  it('declared aliases resolve to their voxel (deliberate, not accidental)', () => {
    for (const [alias, target] of Object.entries(BLOCK_ALIAS)) {
      expect(idForBlock(alias), `${alias} -> ${target}`).toBe(BLOCK_ID[target]);
    }
  });

  it('every name in BLOCK_ID/ALIAS/UNPLACEABLE is a real block in BLOCK_TYPES (no phantom entries)', () => {
    const known = new Set(Object.keys(BLOCK_TYPES));
    const declared = [
      ...Object.keys(BLOCK_ID).filter((n) => n !== 'air'),
      ...Object.keys(BLOCK_ALIAS),
      ...UNPLACEABLE,
    ];
    for (const name of declared) {
      // snow/cactus are worldgen-only voxels (no BLOCK_TYPES entry) — allow those two explicitly.
      if (name === 'snow' || name === 'cactus') continue;
      expect(known.has(name), `${name} is declared in blockIds but is not a BLOCK_TYPES entry`).toBe(true);
    }
  });

  // THE PLAYER-FACING CONTRACT. This is the one that matters: the hotbar is what the player is PROMISED.
  it('⚠️ every HOTBAR block must actually place itself (this is the promise the UI makes)', () => {
    const broken = HOTBAR_BLOCKS.filter((name) => {
      const id = idForBlock(name);
      if (id === null) return true; // engine cannot place it at all
      const back = blockForId(id);
      const expected = BLOCK_ALIAS[name] || name;
      return back !== expected;
    });
    expect(
      broken,
      'these hotbar blocks do not place what they promise — selecting them puts a DIFFERENT material in the world',
    ).toEqual([]);
  });
});
