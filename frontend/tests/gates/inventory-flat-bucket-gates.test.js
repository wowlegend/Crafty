import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// M5 #15: the inventory is a FLAT bucket -- the Inventory panel renders inventory.blocks, and NO panel
// renders inventory.magic/tools. So every player-facing acquired item MUST land in `blocks` or it is
// invisible + unusable. This pins the trade paths (which used to dump bought items into `magic`).
describe('M5 #15 flat-bucket invariant (acquired items land in the rendered bucket)', () => {
  const panels = read('ui/GamePanels.jsx');
  const trade = read('ui/TradingInterface.jsx');

  it('the Inventory panel renders the blocks bucket', () => {
    expect(panels).toMatch(/Object\.entries\(gameState\.inventory\.blocks\)\.map/);
  });

  it('block-trade + crystal-trade route the BOUGHT item into blocks (not the unrendered magic bucket)', () => {
    expect(trade).toMatch(/\[resultItem\]: \(prev\.blocks\[resultItem\] \|\| 0\) \+ resultCount/);
    expect(trade).toMatch(/\[magicItem\]: \(prev\.blocks\[magicItem\] \|\| 0\) \+ resultCount/);
    // the old bug -- bought items written into magic[...] -- is gone
    expect(trade.includes('[resultItem]: (prev.magic[resultItem]')).toBe(false);
    expect(trade.includes('[magicItem]: (prev.magic[magicItem]')).toBe(false);
  });
});
