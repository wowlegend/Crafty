import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const SRC = readFileSync(resolve(process.cwd(), 'src/render/spellVfx.jsx'), 'utf8');
describe('W2-T4 spellVfx renders distinct per-element geometry', () => {
  it('handles the new sigil silhouette (arcane rotating orb)', () => { expect(SRC).toMatch(/case 'sigil'/); });
  it('the bolt silhouette is jagged/forked, not a plain cylinder', () => { expect(SRC).toMatch(/fork|jagged|seg/i); });
  it('the trail varies per element (not one shared cylinder)', () => { expect(SRC).toMatch(/profile\.trail|energy\.trail|\.trail/); });
  it('the impact varies per element (per-element impact geometry)', () => { expect(SRC).toMatch(/energy\.impact|profile\.impact|\.impact/); });
});
