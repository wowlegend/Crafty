import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

// M3b-T2: night siege wiring. The night-danger mood is delivered by the existing dusk
// floor in moodTarget (night term) + the escalating siege spawn-ramp; the BOSS bridge
// is the SOLE writer of dangerLevel (obsidian = boss signature). A review caught that a
// separate night->setDangerLevel(1) write was a no-op for mood AND could stomp an active
// boss's dangerLevel=2 at a transition, so it was REMOVED. These static gates lock that
// removal (single dangerLevel authority) + the nightCount single-SoT wiring.

describe('night siege state (single dangerLevel authority)', () => {
  // S3-M4 p2 (trap 1): useSurvivalMode moved to world/survivalSystem.js — its assertions follow it.
  const src = read('src/world/survivalSystem.js');

  it('useSurvivalMode does NOT write dangerLevel from isDay (no night-vs-boss double-writer)', () => {
    expect(/setDangerLevel\(\s*isDay\b/.test(src)).toBe(false);
  });

  it('nightCount comes from the store (single source of truth, not local useState)', () => {
    // The hook reads the store's nightCount and bumps it via incrementNight; it must
    // NOT re-introduce a local useState(0) for nightCount (that would desync the
    // spawn system from the survival hook).
    expect(/useGameStore\(\(s\)\s*=>\s*s\.nightCount\)/.test(src)).toBe(true);
    expect(/incrementNight\(\)/.test(src)).toBe(true);
  });
});

describe('night siege wired into the spawn system (SimplifiedNPCSystem)', () => {
  const src = read('src/SimplifiedNPCSystem.jsx');

  it('imports the pure siegeParams helper', () => {
    expect(/import\s*\{\s*siegeParams\s*\}\s*from\s*'\.\/game\/dayNight\.js'/.test(src)).toBe(true);
  });

  it('drives the night hostile bias from siegeParams(store.nightCount) (no literal 0.7)', () => {
    // S7: siegeParams now takes an optional zoneTier 2nd arg -> accept it ([^;]* spans the nested
    // zoneTier(x,z) parens). Intent unchanged: hostileChance is DRIVEN by siegeParams + live nightCount.
    expect(/siegeParams\(store\.nightCount[^;]*\)\.hostileChance/.test(src)).toBe(true);
    // the old literal hostile bias must be gone
    expect(/Math\.random\(\)\s*<\s*0\.7/.test(src)).toBe(false);
  });

  it('drives the night max-mob cap from siegeParams (no literal const maxMobs = 16)', () => {
    expect(/siegeParams\(store\.nightCount[^;]*\)\.maxMobs/.test(src)).toBe(true);
    expect(/const\s+maxMobs\s*=\s*16\s*;/.test(src)).toBe(false);
  });
});
