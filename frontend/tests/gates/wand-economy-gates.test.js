import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// B7 — wand/crystal economy wiring. The wand FOCUS math is unit-tested in game/wandFocus.test.js;
// this pins that it's actually WIRED at the single cast-time mana chokepoint (the dead-sink bug was
// that nothing consumed `wand` — this gate stops it silently regressing back to dead).
describe('B7 wand-economy wiring (the wand is consumed at cast)', () => {
  const ems = read('EnhancedMagicSystem.jsx');

  it('imports applyWandFocus', () => {
    expect(ems).toMatch(/import\s*\{\s*applyWandFocus\s*\}\s*from\s*['"]\.\/game\/wandFocus['"]/);
  });
  it('applies the wand focus to the resolved mana cost using the owned wand count', () => {
    expect(ems).toMatch(/applyWandFocus\(\s*baseManaCost\s*,[\s\S]*?inventory\?\.magic\?\.wand/);
  });
  it('the focused manaCost (not the base) is what useMana charges', () => {
    // manaCost is the focused value; useMana(manaCost) deducts it.
    expect(ems).toMatch(/const manaCost = applyWandFocus\(/);
    expect(ems).toMatch(/useMana\(manaCost\)/);
  });

  // The trade UI surfaces the payoff so the crystals→wand trade is no longer a mystery purchase.
  it('the trade panel shows the live wand mana-discount', () => {
    const trade = read('ui/TradingInterface.jsx');
    expect(trade).toMatch(/wandManaMultiplier/);
    expect(trade).toMatch(/spell mana/);
  });
});
