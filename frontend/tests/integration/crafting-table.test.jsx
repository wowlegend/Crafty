// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { CraftingTable } from '../../src/ui/panels/CraftingTable.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';

// The audit flagged "crafting recipe -> inputs-consumed/output-added never E2E'd". CraftingTable is a
// 3x3 pattern matcher: clicking a grid cell with a selected material places one (and consumes it from
// inventory); a useEffect normalizes the grid to its minimal sub-grid and matches it against RECIPES;
// clicking the result slot crafts (adds the output). This renders the REAL panel, places a real recipe
// pattern by clicking the REAL grid cells, and crafts via the REAL result slot — asserting the store
// mutated. The cells/craft trigger are <div onClick> (not buttons), so we select them structurally:
// the grid Panel carries `.bg-well` (its 9 children are the cells, in index order) and the result Slot
// carries `.h-24` (its parent is the doCraft onClick div). Pure-DOM panel — no SoundProvider needed
// (the craft beat goes through the window.playCraft guard).
const g = () => useGameStore.getState();
const ORIGINAL = { inventory: g().inventory, selectedBlock: g().selectedBlock };

afterEach(() => {
  cleanup();
  useGameStore.setState({ ...ORIGINAL });
});

const gridCells = (container) => container.querySelector('.bg-well').children;
const craftTrigger = (container) => container.querySelector('.h-24').parentElement;

describe('CraftingTable (jsdom) — real grid pattern crafts and mutates inventory', () => {
  beforeEach(() => {
    // Leather Helmet = [['Leather','Leather','Leather'],['Leather',null,'Leather']] — every edge row/col
    // has content so it survives normalizeGrid's bounding-box trim (unlike the null-bordered swords).
    useGameStore.setState({
      inventory: { blocks: { Leather: 6 }, tools: {}, magic: {} },
      selectedBlock: 'Leather',
    });
  });

  it('placing a recipe pattern consumes the materials and crafting adds the output', () => {
    const { container } = render(<CraftingTable onClose={() => {}} />);
    const cells = gridCells(container);
    expect(cells.length).toBe(9);

    // place Leather at indices 0,1,2 (top row) and 3,5 (bottom row, leaving 4 empty)
    [0, 1, 2, 3, 5].forEach((i) => fireEvent.click(cells[i]));
    expect(g().inventory.blocks.Leather).toBe(1); // 6 - 5 placed

    fireEvent.click(craftTrigger(container)); // result is now the Leather Helmet recipe

    expect(g().inventory.blocks['Leather Helmet']).toBe(1); // output added
    expect(g().inventory.blocks.Leather).toBe(1); // materials stay consumed (not refunded)
  });

  it('clicking the result slot with no valid pattern does not craft', () => {
    const { container } = render(<CraftingTable onClose={() => {}} />);
    const cells = gridCells(container);

    // a single block is not a recipe -> result stays null -> doCraft early-returns
    fireEvent.click(cells[0]);
    expect(g().inventory.blocks.Leather).toBe(5); // one placed
    fireEvent.click(craftTrigger(container));

    expect(g().inventory.blocks['Leather Helmet']).toBeUndefined(); // nothing crafted
  });

  it('clicking a filled cell returns the material to inventory', () => {
    const { container } = render(<CraftingTable onClose={() => {}} />);
    const cells = gridCells(container);

    fireEvent.click(cells[0]); // place -> Leather 5
    expect(g().inventory.blocks.Leather).toBe(5);
    fireEvent.click(cells[0]); // click filled cell -> returns it -> Leather 6
    expect(g().inventory.blocks.Leather).toBe(6);
  });
});
