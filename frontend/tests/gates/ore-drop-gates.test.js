// S6 Slice 3 — mining an ore must drop its (craftable) item. The `block_broken` handler maps the worker
// block code -> an inventory key, then addToInventory(key). GROUNDED: addToInventory uses the string as a raw
// inventory KEY, mined blocks drop LOWERCASE block keys ('stone'/'wood'/'sand'), and recipes.js patterns match
// lowercase 'coal'/'iron'/'gold'/'diamond' (incl. a Gold Helmet recipe) -> the ore drops MUST be those
// lowercase keys, NOT display names like 'Iron Nugget', which would never match a recipe.
//
// ⚠️ REWRITTEN 2026-07-13 (R4a). This gate used to `readFileSync` Terrain.jsx and regex the text of a
// `BLOCK_ID_MAP` object literal:
//     const block = src.slice(src.indexOf('BLOCK_ID_MAP'), ... + 320);
//     expect(/10:\s*'coal'/.test(block)).toBe(true);
// That is a SOURCE-GREP, and it failed exactly as its class always does: R4a DELETED that literal (the
// duplicate id maps were the very bug — a second, drifted copy is what made a placed diamond come out as
// stone), replaced it with a single shared table, and the behaviour became provably CORRECT — at which point
// this gate went RED. A gate that goes red when the code gets fixed is anti-correlated with correctness
// (LOOP-CHARTER §3). It now asserts the BEHAVIOUR through the real resolver, so it survives any refactor and
// still fails if an ore ever stops dropping its item.
import { describe, it, expect } from 'vitest';
import { blockForId, idForBlock } from '../../src/world/blockIds.js';
import { RECIPES } from '../../src/data/recipes.js';

describe('S6 Slice 3 — mined ore drops its (craftable) item', () => {
  it('the 4 ore codes drop their lowercase block keys', () => {
    expect(blockForId(10)).toBe('coal');
    expect(blockForId(11)).toBe('iron');
    expect(blockForId(12)).toBe('gold');
    expect(blockForId(13)).toBe('diamond');
  });

  it('the existing block codes are untouched (no regression)', () => {
    for (const [code, name] of [[1, 'grass'], [3, 'stone'], [4, 'sand'], [6, 'wood'], [8, 'cactus']]) {
      expect(blockForId(code), `${code} -> ${name}`).toBe(name);
    }
  });

  it('an ore drop round-trips: mine(id) -> key -> the same id when placed back', () => {
    // The property the drifted duplicate maps violated. This is what actually protects the player.
    for (const id of [10, 11, 12, 13]) {
      const key = blockForId(id);
      expect(idForBlock(key), `${key} must place back as id ${id}, not stone`).toBe(id);
    }
  });

  it('every BLOCK-type recipe ingredient is a real, placeable block (no phantom materials)', () => {
    // The whole point of dropping lowercase keys: they must match recipe ingredient patterns. This also
    // catches the R4a class in reverse — `cobblestone` is an ingredient of the Stone Sword, so if the engine
    // cannot place/produce cobblestone, a recipe depends on a material the world can never yield.
    const ingredients = new Set(RECIPES.flatMap((r) => (r.pattern ?? []).flat()).filter(Boolean));
    expect(ingredients.size, 'no recipe ingredients found — has recipes.js changed shape?').toBeGreaterThan(0);

    // Ingredients that are BLOCKS (as opposed to crafted items like 'Iron Sword') must resolve to a voxel.
    const blockIngredients = [...ingredients].filter((i) => i === i.toLowerCase());
    for (const ing of blockIngredients) {
      expect(
        idForBlock(ing),
        `'${ing}' is a recipe ingredient but the engine cannot place/produce it`,
      ).not.toBeNull();
    }
  });
});
