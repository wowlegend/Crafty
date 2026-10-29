// S6 Slice 3 — mining an ore must drop its item. The `block_broken` handler maps the worker block code -> an
// inventory key, then addToInventory(key). GROUNDED: addToInventory uses the string as a raw inventory KEY, mined
// blocks drop LOWERCASE block keys ('stone'/'wood'/'sand'), and Mara's Forge prices in lowercase 'iron'/'gold'/
// 'diamond' (game/forge.js) -> the ore drops MUST be those lowercase keys, NOT display names like 'Iron Nugget',
// which no price names.
//
// ⚠️ REWRITTEN 2026-07-13 (R4a). This gate used to `readFileSync` Terrain.jsx and regex the text of a
// `BLOCK_ID_MAP` object literal:
//     const block = src.slice(src.indexOf('BLOCK_ID_MAP'), ... + 320);
//     expect(/10:\s*'coal'/.test(block)).toBe(true);
// That is a SOURCE-GREP, and it failed exactly as its class always does: R4a DELETED that literal (the
// duplicate id maps were the very bug — a second, drifted copy is what made a placed diamond come out as
// stone), replaced it with a single shared table, and the behaviour became provably CORRECT — at which point
// this gate went RED. A gate that goes red when the code gets fixed is anti-correlated with correctness
// (CLAUDE.md, Invariants). It now asserts the BEHAVIOUR through the real resolver, so it survives any refactor and
// still fails if an ore ever stops dropping its item.
import { describe, it, expect } from 'vitest';
import { blockForId, idForBlock } from '../../src/world/blockIds.js';
import { forgeOffers } from '../../src/game/forge.js';

describe('S6 Slice 3 — mined ore drops its item', () => {
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

  it('every block a Forge price takes is a real, placeable block (no phantom materials)', () => {
    // The whole point of dropping lowercase keys: they must match the keys Mara's Forge prices in. This also catches
    // the R4a class in reverse: if the engine cannot place or produce a block a price names, the Forge asks for a
    // material the world can never yield. Every blade and both relic tiers are listed, so every price is read.
    const states = [null, 'sword', 'Stone Sword', 'Iron Sword'].flatMap((weapon) => [1, 2].map((tier) => ({
      inventory: { blocks: {}, tools: {}, magic: {} }, coins: 0, equipment: { weapon, relic: 'Ember Fang' }, relicTiers: { 'Ember Fang': tier },
    })));
    const priced = new Set(states.flatMap((s) => forgeOffers(s).flatMap((o) => Object.keys(o.price.blocks))));
    expect([...priced].sort(), 'the Forge prices in a different set of blocks; re-read what this gate walks').toEqual(['diamond', 'gold', 'iron', 'sand', 'stone', 'wood']);
    for (const key of priced) {
      expect(idForBlock(key), `'${key}' is in a Forge price but the engine cannot place/produce it`).not.toBeNull();
    }
  });
});
