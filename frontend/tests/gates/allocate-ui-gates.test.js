import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('allocate-attribute UI gates', () => {
  const src = read('src/ui/GamePanels.jsx');
  it('the Inventory selector exposes attributePoints + allocateAttribute', () => {
    expect(/allocateAttribute/.test(src)).toBe(true);
    expect(/attributePoints/.test(src)).toBe(true);
  });
  it('allocate buttons call allocateAttribute for str/agi/int', () => {
    expect(/allocateAttribute\(\s*['"]strength['"]\s*\)/.test(src)).toBe(true);
    expect(/allocateAttribute\(\s*['"]agility['"]\s*\)/.test(src)).toBe(true);
    expect(/allocateAttribute\(\s*['"]intellect['"]\s*\)/.test(src)).toBe(true);
  });
  it('the allocate affordance is gated on attributePoints > 0 (keeps the 0-point fixture stable)', () => {
    expect(/attributePoints\s*>\s*0/.test(src)).toBe(true);
  });
});
