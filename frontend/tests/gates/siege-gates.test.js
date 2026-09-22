import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip, sourceFiles, carriersOf } from './_srcWalk.js';
import { useGameStore } from '../../src/store/useGameStore';
import { CYCLE_UNITS } from '../../src/game/dayNight.js';

const read = (rel) => strip(readFileSync(resolve(SRC, rel), 'utf8'));

/**
 * M3b-T2 night siege wiring — one authority for dangerLevel, and the ramp DRIVEN by siegeParams.
 *
 * The boss bridge is the sole writer of `dangerLevel` (obsidian = boss signature). A review caught that
 * a separate night -> setDangerLevel(1) write was a no-op for mood AND could stomp an active boss's
 * dangerLevel=2 at a transition, so it was removed; these gates lock the removal.
 *
 * REWRITTEN 2026-09-22, selected by `gate-census.mjs` at 0/5.
 *
 * WHAT THIS GATE DELIBERATELY DOES NOT DO: re-test siegeParams. It is a pure function with thirteen
 * driven cases in `tests/store/siegeParams.test.js` — the ramp rate, both caps, monotonicity in night
 * and in zoneTier, and the nullish/NaN clamps. Duplicating any of that here in regex form would be a
 * second, weaker copy of coverage that already exists. THIS gate's whole job is the WIRING: that the
 * spawn system calls that function with the LIVE night count instead of carrying its own literals. Pure
 * math and its call site are two different claims and they belong to two different files.
 *
 * The concatenation is gone. Both cases previously read `SimplifiedNPCSystem.jsx` and
 * `systems/SpawnerSystem.jsx` joined into one string, so neither could say which file carried the line —
 * and the A1.3 de-monolith had already moved it between them. A concatenation is a way of not asking
 * where.
 *
 * The two "the old literal is gone" claims are now repo-wide. They were scoped to the concatenated pair,
 * so the literal bias reappearing in any third file — which is precisely how a hardcoded difficulty
 * knob comes back — was invisible.
 *
 * BLIND SPOT, stated (R7): source assertions throughout. Nothing here proves a siege actually escalates
 * in a running game; it proves the only numbers in the spawn path come from the tested function. The
 * spawn loop needs a live world and no harness in this repo drives one.
 *
 * Mutation-Proof: 5 mutations, recorded on the commit. Denominator asserted on the src walk.
 */
describe('night siege state (single dangerLevel authority)', () => {
  const files = sourceFiles();

  it('the src walk reached the codebase', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('no module writes dangerLevel from isDay — the night-vs-boss double-writer stays removed', () => {
    // Repo-wide: the removed write could come back anywhere, and the boss bridge is the only authority.
    expect(carriersOf(/setDangerLevel\(\s*isDay\b/, files),
      'a night-driven dangerLevel write is back; it stomps an active boss at the transition').toEqual([]);
  });

  it('nightCount comes from the store, and the survival hook does NOT bump it', () => {
    const src = read('world/survivalSystem.js');
    expect(src, 'nightCount is no longer read from the store').toMatch(/useGameStore\(\(s\)\s*=>\s*s\.nightCount\)/);
    // B2f: the hook used to advance the ratchet from a reactive isDay edge, which cannot tell a real
    // nightfall from a LOAD — so resuming a night save added a phantom siege night on every reload. The
    // assertion is that it stays out of the ratchet. Repo-wide, because the bump coming back anywhere
    // outside the clock is the same bug.
    expect(carriersOf(/incrementNight\s*\(/, files),
      'something outside the clock advances the siege night — a load will ratchet it').toEqual([]);
  });

  it('the CLOCK is the sole night ratchet — driven through the real store', () => {
    // THIS CASE REPLACES ONE THAT ASSERTED THE OPPOSITE OF THE TRUTH AND PASSED. The old gate required
    // `incrementNight()` to appear in survivalSystem.js. It does not appear there, or anywhere — the
    // call was deleted in B2f. The gate was green because it read the file WITHOUT stripping comments,
    // and the comment EXPLAINING the removal contains the token. A gate satisfiable by the prose
    // documenting its own obsolescence is this repo's most-repeated defect, and here it inverted the
    // claim entirely.
    //
    // The store is importable, so the real invariant is driven instead of described: advancing the clock
    // across a genuine crossing into night bumps nightCount by exactly one, and advancing it within a
    // phase does not.
    const before = useGameStore.getState();
    try {
      useGameStore.setState({ gameTime: 0, isDay: true, nightCount: 0 });
      const DAY = CYCLE_UNITS;
      useGameStore.getState().setGameTime(DAY * 0.3); // still day -> no crossing
      expect(useGameStore.getState().nightCount, 'a within-phase tick advanced the siege').toBe(0);
      useGameStore.getState().setGameTime(DAY * 0.6); // crosses into night -> exactly one bump
      expect(useGameStore.getState().nightCount, 'crossing into night did not advance the siege').toBe(1);
      useGameStore.getState().setGameTime(DAY * 0.7); // deeper into the same night -> no second bump
      expect(useGameStore.getState().nightCount, 'the siege double-counted inside one night').toBe(1);
      // THE DISCRIMINATOR, added after a mutation survived. Replacing the whole condition with `true`
      // left the three cases above reading 0, 1, 1 — identical to correct behaviour — because none of
      // them crosses into DAY. A half-cycle crossing that ends in daylight must not advance the siege,
      // and that is the only sequence that separates "bumps on a crossing into night" from "bumps on
      // any crossing". Without it this case asserted the weaker claim while appearing to assert this one.
      useGameStore.getState().setGameTime(DAY * 1.1); // crosses back into DAY -> still no bump
      expect(useGameStore.getState().nightCount, 'dawn advanced the siege — the bump is not gated on night')
        .toBe(1);
    } finally {
      useGameStore.setState({ gameTime: before.gameTime, isDay: before.isDay, nightCount: before.nightCount });
    }
  });
});

describe('night siege wired into the spawn system', () => {
  const files = sourceFiles();
  // Read separately, not concatenated: A1.3 moved the spawn wiring out of the host, and a gate that
  // joins both files cannot notice the next move either.
  const spawner = read('systems/SpawnerSystem.jsx');

  it('SpawnerSystem imports the pure siegeParams helper', () => {
    expect(spawner, 'the spawn system no longer imports siegeParams')
      .toMatch(/import\s*\{[^}]*\bsiegeParams\b[^}]*\}\s*from\s*'\.\.?\/game\/dayNight\.js'/);
  });

  it('both siege knobs are DRIVEN by siegeParams(store.nightCount), in SpawnerSystem', () => {
    expect(spawner, 'the hostile bias is no longer driven by siegeParams')
      .toMatch(/siegeParams\(store\.nightCount[^;]*\)\.hostileChance\b/);
    expect(spawner, 'the mob cap is no longer driven by siegeParams')
      .toMatch(/siegeParams\(store\.nightCount[^;]*\)\.maxMobs\b/);
  });

  it('the hardcoded difficulty literals stay gone from ALL of src/', () => {
    // Scoped to two files before. A literal knob comes back wherever someone is working, not where the
    // gate happens to be looking.
    expect(carriersOf(/Math\.random\(\)\s*<\s*0\.7/, files),
      'the literal 0.7 hostile bias is back — the siege ramp is being bypassed').toEqual([]);
    expect(carriersOf(/const\s+maxMobs\s*=\s*16\s*;/, files),
      'the literal mob cap is back — the siege ramp is being bypassed').toEqual([]);
  });
});
