import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ASPECT_TREES } from '../../src/game/talentTree.js';
const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('aspect-trees panel gates', () => {
  it('SpellUpgradePanel imports ASPECT_TREES (no inline branches array)', () => {
    // S3-M4 (trap 1): SpellUpgradePanel moved to ui/ — the ASPECT_TREES wiring (no inline branches) follows it.
    const src = read('src/ui/SpellUpgradePanel.jsx');
    expect(/ASPECT_TREES/.test(src)).toBe(true);
    expect(/const\s+branches\s*=\s*\[/.test(src)).toBe(false);
  });
  it('there are 4 aspect trees with the canonical aspects', () => {
    expect(ASPECT_TREES.map((t) => t.aspect)).toEqual(['voidhand', 'wildheart', 'soulbind', 'elemancer']);
  });
});
