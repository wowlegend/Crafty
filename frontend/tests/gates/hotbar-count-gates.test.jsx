// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { GameUI } from '../../src/ui/GameHud.jsx';
import { HOTBAR_BLOCKS } from '../../src/world/Blocks.js';

// EVERY PLACEMENT SPENDS A BLOCK (DECISIONS 2026-10-28 W1-H item 4), so the hotbar's count is the player's only read of
// what is left. A slot holding one block and a slot holding none must not look alike: every count is drawn, and an
// empty slot's swatch is dimmed.
//
// WHAT THIS DOES NOT CHECK: how the dimmed swatch looks (the visual baselines), or the touch layout's scaling.
//
// Mutation-Proof: see the commit trailer (the count drawn only above one; the empty slot left undimmed).
afterEach(cleanup);

const hud = (blocks) => ({
  selectedBlock: 'grass', inventory: { blocks },
  setSelectedBlock: () => {}, setShowSettings: () => {}, setShowInventory: () => {}, setShowCrafting: () => {},
  setShowMagic: () => {}, setShowBuildingTools: () => {},
});
const slot = (block) => document.querySelector(`[data-hotbar-block="${block}"]`);
const count = (block) => slot(block)?.querySelector('[data-hotbar-count]')?.textContent ?? null;
const dimmed = (block) => /\bopacity-/.test(slot(block)?.querySelector('[data-hotbar-swatch]')?.className ?? '');

describe('the hotbar tells a last block from none', () => {
  it('draws the count of every slot, 0 and 1 included, and dims only the empty ones', () => {
    render(<GameUI gameState={hud({ grass: 5, dirt: 1, stone: 0, sand: 1200 })} />);
    expect(HOTBAR_BLOCKS.every((b) => slot(b)), 'SETUP: not every hotbar slot rendered').toBe(true);
    expect(count('grass'), 'a stack of 5 shows the wrong count').toBe('5');
    expect(count('dirt'), 'a last block shows no count').toBe('1');
    expect(count('stone'), 'an empty slot shows no count').toBe('0');
    expect(count('wood'), 'a block the inventory does not list shows no count').toBe('0');
    expect(count('sand'), 'a large stack is not capped for the slot').toBe('999+');
    expect(dimmed('grass') || dimmed('dirt') || dimmed('sand'), 'a slot with blocks in it is dimmed').toBe(false);
    expect(dimmed('stone') && dimmed('wood'), 'an empty slot is not dimmed').toBe(true);
  });
});
