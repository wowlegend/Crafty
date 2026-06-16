import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// M6 #17 (brand conformance): first-impression UI must be built on the LOCKED bold-flat design system
// (Panel/Button/Toast primitives + theme tokens), NOT raw off-brand Tailwind palette classes
// (bg-gray-800 / bg-green-600 / text-blue-400 / rounded-lg). The AuthModal was the last raw-Tailwind
// holdout reachable from the title menu; this pins it conformant + catches a regression to raw palette.
describe('M6 #17 AuthModal bold-flat conformance', () => {
  const auth = read('AuthComponents.jsx');

  it('is built on the locked primitives (Panel/Button/Toast)', () => {
    expect(auth).toMatch(/from '\.\/ui\/primitives\/index\.js'/);
    expect(auth).toMatch(/<Panel\b/);
    expect(auth).toMatch(/<Button\b/);
  });

  it('uses theme tokens, not raw off-brand palette classes', () => {
    // raw numeric Tailwind palette utilities are off-brand (the bold-flat system uses semantic tokens)
    const offBrand = /\b(?:bg|text|border|ring)-(?:gray|slate|zinc|blue|green|red|indigo|purple|yellow)-\d{2,3}\b/;
    expect(offBrand.test(auth)).toBe(false);
    // and the bold-flat tokens are present
    expect(auth).toMatch(/text-accent/);
    expect(auth).toMatch(/bg-panel-inset/);
  });

  it('dropped the dead unexported UserProfile (raw-Tailwind dead code)', () => {
    expect(auth).not.toMatch(/UserProfile/);
  });
});
