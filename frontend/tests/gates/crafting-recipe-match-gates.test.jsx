// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup, act } from '@testing-library/react';
import { CraftingTable } from '../../src/ui/panels/CraftingTable.jsx';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { RECIPES } from '../../src/data/recipes.js';
import { matchRecipe, normalizeGrid, trimGrid } from '../../src/game/crafting.js';

// B3a — THE ENTIRE SWORD TREE WAS UNCRAFTABLE. (18-domain review, CRITICAL; re-derived from live code.)
//
// The 3x3 grid matched by trimming the PLAYER grid to its bounding box (normalizeGrid) and comparing against
// the RAW recipe pattern (RECIPES.find(gridsEqual)). Every sword is a null-bordered middle column — Iron
// Sword = [[null,'iron',null],[null,'iron',null],[null,'wood',null]]. A player's placement trims to the 3x1
// column [['iron'],['iron'],['wood']] and is compared against the padded 3x3 pattern; gridsEqual bails on
// the row-length mismatch (1 !== 3). Stone / Iron / Iron(Nuggets) / Diamond Sword could never match.
//
// FIX = a pure seam (src/game/crafting.js) whose matchRecipe trims BOTH sides. Idempotent for the 22
// already-tight non-sword patterns; the 4 swords finally match. This gate drives the seam AND the real
// panel, so it cannot drift from what the game does.
//
// MUTATION-PROOF: in matchRecipe, revert `gridsEqual(normalized, trimGrid(r.pattern))` to
// `gridsEqual(normalized, r.pattern)` (trim only the player grid, like the bug) — the sword gates + the
// end-to-end craft go RED while every non-sword stays green.

const SWORDS = ['Stone Sword', 'Iron Sword', 'Iron Sword (Nuggets)', 'Diamond Sword'];

const flatFromPattern = (pattern) => {
  const flat = Array(9).fill(null);
  for (let y = 0; y < pattern.length; y++) {
    for (let x = 0; x < pattern[y].length; x++) flat[y * 3 + x] = pattern[y][x] ?? null;
  }
  return flat;
};

describe('B3a crafting matcher — the sword tree exists again', () => {
  it('trimGrid strips fully-null outer columns (the exact mechanism the panel was missing)', () => {
    const iron = RECIPES.find((r) => r.name === 'Iron Sword');
    expect(iron.pattern[0].length).toBe(3);                                  // raw pattern is a padded 3-wide row
    expect(trimGrid(iron.pattern)).toEqual([['iron'], ['iron'], ['wood']]);  // ...trimmed to the column
    expect(normalizeGrid(flatFromPattern(iron.pattern))).toEqual([['iron'], ['iron'], ['wood']]);
  });

  it('every sword recipe matches its placed pattern (all four were uncraftable)', () => {
    for (const name of SWORDS) {
      const recipe = RECIPES.find((r) => r.name === name);
      expect(recipe, `${name} missing from RECIPES`).toBeTruthy();
      const match = matchRecipe(flatFromPattern(recipe.pattern), RECIPES);
      expect(match, `${name} is uncraftable`).toBeTruthy();
      expect(match.name).toBe(name);
    }
  });
});

describe('B3a regression — every recipe is still reachable (drift-proof over the whole set)', () => {
  // Adding a recipe auto-extends this gate: place each pattern, expect matchRecipe to return THAT recipe.
  it.each(RECIPES.map((r) => [r.name, r]))('%s matches its own placed pattern', (name, recipe) => {
    const match = matchRecipe(flatFromPattern(recipe.pattern), RECIPES);
    expect(match, `${name} became uncraftable`).toBeTruthy();
    expect(match.name, `${name}'s pattern matched ${match?.name} instead`).toBe(name);
  });
});

// The pure seam is only half the fix — the panel must actually CALL it. Drive the REAL CraftingTable
// through the REAL store. If someone extracts the seam but forgets to wire it, this goes RED.
const gridCells = (c) => c.querySelector('.bg-well').children;
const craftTrigger = (c) => c.querySelector('.h-24').parentElement;
const g = () => useGameStore.getState();

describe('B3a wiring — the real panel crafts a sword end-to-end', () => {
  afterEach(() => cleanup());

  it('placing iron/iron/wood down the middle column crafts an Iron Sword', () => {
    useGameStore.setState({
      inventory: { blocks: { iron: 2, wood: 1 }, tools: {}, magic: {} },
      selectedBlock: 'iron',
    });
    const { container } = render(<CraftingTable onClose={() => {}} />);
    const cells = gridCells(container);
    expect(cells.length).toBe(9);

    fireEvent.click(cells[1]);   // iron — top-middle
    fireEvent.click(cells[4]);   // iron — center
    act(() => useGameStore.setState({ selectedBlock: 'wood' }));   // switch material, flush the re-render
    fireEvent.click(cells[7]);   // wood — bottom-middle
    expect(g().inventory.blocks.iron).toBe(0);   // materials consumed by placement
    expect(g().inventory.blocks.wood).toBe(0);

    fireEvent.click(craftTrigger(container));     // the result slot now holds Iron Sword

    expect(g().inventory.blocks['Iron Sword']).toBe(1);   // RED before the fix: swords never matched
  });
});
