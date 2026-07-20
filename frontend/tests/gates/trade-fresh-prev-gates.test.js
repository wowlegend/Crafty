import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// Regression (2026-06-28 audit, MEDIUM): the trade functions used a functional setInventory updater
// but computed the new balance from the STALE render snapshot (currentCount/currentCrystals) and
// absolute-set it — clobbering any concurrent inventory change. The subtraction must read prev.
describe('TradingInterface — subtract from fresh prev, not the render snapshot', () => {
  const src = read('ui/TradingInterface.jsx');

  it('block trade subtracts the cost from prev.blocks (not currentCount)', () => {
    expect(src).toMatch(/\(prev\.blocks\?\.\[blockType\] \|\| 0\) - required/);
    expect(src).not.toMatch(/\[blockType\]: currentCount - required/);
  });

  it('crystal trade subtracts from prev.blocks.crystals (not currentCrystals)', () => {
    // B3b: crystals are spent from the canonical `blocks` bucket (was `magic`, which nothing accumulates into).
    expect(src).toMatch(/\(prev\.blocks\?\.crystals \|\| 0\) - requiredCrystals/);
    expect(src).not.toMatch(/crystals: currentCrystals - requiredCrystals/);
  });
});
