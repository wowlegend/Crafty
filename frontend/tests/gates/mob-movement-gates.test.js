import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip } from './_srcWalk.js';
import {
  movementGoal, flankSide,
  FLANK_WIDTH, FLANK_COMMIT_DIST, FLANK_FULL_DIST, SHOULDER_OVERSHOOT, SHOULDER_CHARGE_DIST,
} from '../../src/game/mobMovement.js';
import { archetypeFor } from '../../src/game/mobArchetypes.js';

const dist = (g, px, pz) => Math.hypot(g.targetX - px, g.targetZ - pz);

/**
 * C5/Q25 — HOW a mob approaches, as data. Five of seven hostiles shared one movement.
 *
 * `ai.worker.js` had exactly two typed arms, `skeleton` (archery) and `spider` (leap); zombie,
 * skitterling, duskhound, moss_brute and emberhusk all fell through to beeline-and-bonk. The archetype
 * table had already moved the per-type NUMBERS and its own docblock named this as the next slice — "a
 * brute that shoulders through, a hound that flanks" — but the distinctions it draws do not survive
 * contact with play while every one of them walks at you in a straight line.
 *
 * THE SAFETY PROPERTY IS THE POINT, and it is the first case below: a kind with no entry reproduces
 * today's behaviour EXACTLY. `beeline` is the current `else` branch expressed as data, not a new
 * approach, so nothing changes for a type until someone names it. That is what made the numbers table
 * shippable and it is what makes this shippable.
 *
 * BLIND SPOT, stated (R7): this drives the pure goal function. It does not prove the worker's pathing
 * reaches the goal, that a hound visibly arcs on screen, or that a brute's charge is dodgeable in
 * practice — the last is a FEEL question and the honest instrument for it is a person playing. The
 * worker wiring is asserted structurally at the end, which is the weak kind by this repo's standard.
 *
 * Mutation-Proof: 5 mutations, recorded on the commit.
 */
describe('C5 mob movement archetypes', () => {
  it('an UNNAMED movement is byte-identical to beeline — the safety property', () => {
    // If this ever fails, every undesigned mob type silently changed behaviour.
    const ctx = { x: 3, z: -4, playerX: 40, playerZ: 17, id: 'z-1' };
    const plain = { targetX: 40, targetZ: 17 };
    for (const kind of ['beeline', undefined, null, '', 'not-a-kind', 42]) {
      expect(movementGoal(kind, ctx), `movement '${kind}' diverged from beeline`).toEqual(plain);
    }
  });

  it('a FLANK arcs wide when far and CONVERGES when close — or the hound never engages', () => {
    const p = { playerX: 0, playerZ: 0, id: 'hound-a' };
    const far = movementGoal('flank', { ...p, x: -40, z: 0 });
    const mid = movementGoal('flank', { ...p, x: -8, z: 0 });
    const close = movementGoal('flank', { ...p, x: -FLANK_COMMIT_DIST + 0.5, z: 0 });
    expect(dist(far, 0, 0), 'a distant flanker must aim off to the side').toBeCloseTo(FLANK_WIDTH, 6);
    expect(dist(mid, 0, 0), 'the arc must narrow as it closes').toBeLessThan(dist(far, 0, 0));
    // And the arc must be WIDE across most of the approach, not only at the last moment. The first
    // version saturated at 8 blocks while the duskhound's aggro range is 28, so the flank was real and
    // almost never visible. Pinned against the archetype's own reach.
    const atAggro = movementGoal('flank', { ...p, x: -24, z: 0 });
    expect(dist(atAggro, 0, 0), 'a hound must already be arcing when it picks you up').toBeCloseTo(FLANK_WIDTH, 6);
    expect(FLANK_FULL_DIST, 'the arc saturates too close to be seen').toBeGreaterThan(FLANK_COMMIT_DIST * 2);
    expect(dist(close, 0, 0), 'inside the commit distance it must aim AT the player, or it circles forever')
      .toBeCloseTo(0, 6);
  });

  it('the flank side is DETERMINISTIC per mob and a pack SPLITS', () => {
    // No RNG: the AI runs in a worker and capture determinism forbids one. And if every hound picked the
    // same side, four flankers would re-form a single beeline — the defect this is meant to cure.
    expect(flankSide('hound-a')).toBe(flankSide('hound-a'));
    const sides = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].map(flankSide);
    expect(new Set(sides).size, 'every mob flanks the same way — a pack would re-form a beeline').toBe(2);
    for (const s of sides) expect(Math.abs(s)).toBe(1);
  });

  it('a SHOULDER charge aims PAST the player, and only inside the charge band', () => {
    const p = { playerX: 0, playerZ: 0, id: 'brute-1' };
    const walking = movementGoal('shoulder', { ...p, x: -(SHOULDER_CHARGE_DIST + 5), z: 0 });
    expect(walking, 'outside the band a brute must walk normally').toEqual({ targetX: 0, targetZ: 0 });

    const charging = movementGoal('shoulder', { ...p, x: -6, z: 0 });
    expect(charging.targetX, 'the charge stops AT the player — it cannot be sidestepped').toBeGreaterThan(0);
    expect(dist(charging, 0, 0)).toBeCloseTo(SHOULDER_OVERSHOOT, 6);
    // The overshoot must continue the APPROACH direction, not point anywhere else.
    expect(charging.targetZ).toBeCloseTo(0, 6);
  });

  it('degenerate geometry returns a FINITE goal — a NaN goal is a mob that walks nowhere, silently', () => {
    const onTop = { x: 5, z: 5, playerX: 5, playerZ: 5, id: 'x' };
    for (const kind of ['flank', 'shoulder', 'beeline']) {
      const g = movementGoal(kind, onTop);
      expect(Number.isFinite(g.targetX) && Number.isFinite(g.targetZ), `${kind} produced a NaN goal`).toBe(true);
    }
    const bad = movementGoal('flank', { x: NaN, z: 0, playerX: 0, playerZ: 0, id: 'x' });
    expect(Number.isFinite(bad.targetX) && Number.isFinite(bad.targetZ)).toBe(true);
  });

  it('the two designed mobs actually GOT the movements the table argues for', () => {
    expect(archetypeFor('moss_brute').movement, 'the brute is not shouldering').toBe('shoulder');
    expect(archetypeFor('duskhound').movement, 'the pack hunter is not flanking').toBe('flank');
    expect(archetypeFor('zombie').movement, 'an undesigned type must stay on beeline').toBe('beeline');
  });

  it('the worker CONSUMES the archetype movement — it is not computed and dropped', () => {
    // The weak, structural half, and it guards the exact shape this repo keeps shipping: a value
    // computed, compiling, and never reaching the thing it was for.
    const w = strip(readFileSync(resolve(SRC, 'workers/ai.worker.js'), 'utf8'));
    expect(w, 'the worker no longer resolves a movement from the archetype').toMatch(/movement: MOVEMENT/);
    expect(w, 'the goal is computed but not assigned to the path target')
      .toMatch(/const goal = movementGoal\(MOVEMENT,[\s\S]{0,120}targetX = goal\.targetX;[\s\S]{0,40}targetZ = goal\.targetZ;/);
    expect(w, 'the hardcoded beeline is back alongside the archetype goal')
      .not.toMatch(/targetX = goal\.targetX;[\s\S]{0,80}targetX = playerX;/);
  });
});
