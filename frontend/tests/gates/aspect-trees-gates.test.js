import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASPECT_TREES } from '../../src/game/talentTree.js';
const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('aspect-trees panel gates', () => {
  const src = read('src/AdvancedGameFeatures.jsx');
  it('SpellUpgradePanel imports ASPECT_TREES (no inline branches array)', () => {
    expect(/ASPECT_TREES/.test(src)).toBe(true);
    expect(/const\s+branches\s*=\s*\[/.test(src)).toBe(false);
  });
  it('there are 4 aspect trees with the canonical aspects', () => {
    expect(ASPECT_TREES.map((t) => t.aspect)).toEqual(['voidhand', 'wildheart', 'soulbind', 'elemancer']);
  });
});
