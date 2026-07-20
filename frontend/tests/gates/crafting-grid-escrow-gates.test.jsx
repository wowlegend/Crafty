// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { CraftingTable } from '../../src/ui/panels/CraftingTable.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// B3d — THE CRAFTING GRID EATS YOUR MATERIALS. (18-domain review, HIGH; re-verified against live HEAD.)
//
// CraftingTable places a material by REMOVING it from inventory (handleGridClick) and escrowing it in a
// React-LOCAL `grid` useState. Closing the panel unmounts the component (MenuSystem renders it only while
// showCrafting), discarding that state. Nothing gives the escrowed materials back. A child who drops iron
// in, changes their mind, and presses C to close has permanently destroyed the iron. No undo, no respawn.
//
// THE INVARIANT: the grid is ESCROW, not a sink. Whatever is still in it at teardown must return to
// inventory. A crafted recipe is the ONE exception — doCraft clears the grid before teardown, so its
// consumed inputs are already gone and must NOT come back.
//
// These gates drive the REAL panel + REAL store (real removeFromInventory on place, real unmount modelling
// MenuSystem flipping showCrafting to false). No source-grep, no mock store.
//
// MUTATION-PROOF: neuter the unmount-cleanup call to returnGridToInventory -> THE BUG / mixed / live-cells
// go RED again; refund unconditionally (ignore that doCraft cleared the grid) -> CRAFT SEMANTICS goes RED.

const g = () => useGameStore.getState();

afterEach(() => cleanup());

const gridCells = (c) => c.querySelector('.bg-well').children;
const craftTrigger = (c) => c.querySelector('.h-24').parentElement;
const place = (cells, idx) => idx.forEach((i) => fireEvent.click(cells[i]));

describe('B3d crafting-grid escrow — closing the panel must not destroy what is in the grid', () => {
  it('THE BUG: materials left in the grid on close return to inventory', () => {
    useGameStore.setState({ inventory: { blocks: { stone: 5 }, tools: {}, magic: {} }, selectedBlock: 'stone' });

    const { container, unmount } = render(<CraftingTable onClose={() => {}} />);
    place(gridCells(container), [0, 1, 2]);                 // drop 3 stone into the grid
    expect(g().inventory.blocks.stone).toBe(2);            // debited on place (5 - 3) — intended

    unmount();                                             // player presses C / clicks X -> panel unmounts

    expect(g().inventory.blocks.stone).toBe(5);           // RED before the fix: stayed at 2 (destroyed)
  });

  it('returns EXACTLY what was in the grid across mixed materials — no more, no less', () => {
    useGameStore.setState({ inventory: { blocks: { stone: 5, wood: 5 }, tools: {}, magic: {} }, selectedBlock: 'stone' });

    const { container, unmount } = render(<CraftingTable onClose={() => {}} />);
    const cells = gridCells(container);
    place(cells, [0, 1]);                                  // 2 stone -> stone 3
    act(() => useGameStore.setState({ selectedBlock: 'wood' }));   // switch material, flush the re-render
    place(cells, [2]);                                    // 1 wood  -> wood 4
    expect(g().inventory.blocks.stone).toBe(3);
    expect(g().inventory.blocks.wood).toBe(4);

    unmount();

    expect(g().inventory.blocks.stone).toBe(5);           // both fully restored
    expect(g().inventory.blocks.wood).toBe(5);
  });

  it('only LIVE grid cells are returned — a material clicked back out is not double-counted', () => {
    useGameStore.setState({ inventory: { blocks: { stone: 5 }, tools: {}, magic: {} }, selectedBlock: 'stone' });

    const { container, unmount } = render(<CraftingTable onClose={() => {}} />);
    const cells = gridCells(container);
    place(cells, [0, 1]);                                  // stone 5 -> 3
    fireEvent.click(cells[0]);                             // click a filled cell -> returns 1, cell nulled -> stone 4

    unmount();                                             // only cell 1 still occupied

    expect(g().inventory.blocks.stone).toBe(5);           // 4 + the 1 still in the grid — never 6
  });

  it('CRAFT SEMANTICS: crafting then closing does NOT refund the consumed inputs', () => {
    // Leather Helmet = [['Leather','Leather','Leather'],['Leather',null,'Leather']]. doCraft clears the
    // grid, so the cleanup must find nothing to return.
    useGameStore.setState({ inventory: { blocks: { Leather: 6 }, tools: {}, magic: {} }, selectedBlock: 'Leather' });

    const { container, unmount } = render(<CraftingTable onClose={() => {}} />);
    place(gridCells(container), [0, 1, 2, 3, 5]);          // Leather 6 -> 1
    fireEvent.click(craftTrigger(container));             // craft the helmet
    expect(g().inventory.blocks['Leather Helmet']).toBe(1);
    expect(g().inventory.blocks.Leather).toBe(1);         // inputs consumed

    unmount();

    expect(g().inventory.blocks.Leather).toBe(1);         // still 1 — consumed inputs NOT refunded
    expect(g().inventory.blocks['Leather Helmet']).toBe(1); // output not doubled
  });
});
