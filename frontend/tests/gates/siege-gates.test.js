import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

// M3b-T2: the night -> dangerLevel bridge (night raises the obsidian danger mood)
// MUST be capture-guarded so the explore-night visual baseline stays dusk-mood
// (dangerLevel=0). These static gates lock that wiring + its capture-guard, and
// that the spawn system reads siege intensity from store.nightCount (single SoT),
// so a future edit can't silently re-break "explore-night stays calm in the gate".

describe('night -> dangerLevel bridge (useSurvivalMode)', () => {
  const src = read('src/AdvancedGameFeatures.jsx');

  it('useSurvivalMode bridges isDay to setDangerLevel (0 day / 1 night)', () => {
    expect(/setDangerLevel\(\s*isDay\s*\?\s*0\s*:\s*1\s*\)/.test(src)).toBe(true);
  });

  it('the night-danger bridge is capture-guarded (keeps explore-night baseline stable)', () => {
    const idx = src.indexOf('setDangerLevel(isDay');
    expect(idx).toBeGreaterThan(-1);
    const before = src.slice(Math.max(0, idx - 220), idx);
    expect(/isCaptureMode\(\)\s*\)?\s*return/.test(before)).toBe(true);
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
    expect(/siegeParams\(store\.nightCount\)\.hostileChance/.test(src)).toBe(true);
    // the old literal hostile bias must be gone
    expect(/Math\.random\(\)\s*<\s*0\.7/.test(src)).toBe(false);
  });

  it('drives the night max-mob cap from siegeParams (no literal const maxMobs = 16)', () => {
    expect(/siegeParams\(store\.nightCount\)\.maxMobs/.test(src)).toBe(true);
    expect(/const\s+maxMobs\s*=\s*16\s*;/.test(src)).toBe(false);
  });
});
