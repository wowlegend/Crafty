import { makeSeededRandom } from '../devtest/captureMode.js';

/**
 * mobWander.js — the idle wander re-roll, as a pure function.
 *
 * EXTRACTED SO IT CAN BE TESTED AT ALL. It lived inline in `ai.worker.js`, which assigns `self.onmessage`
 * at module scope, so importing it under vitest throws — the same reason the greedy mesher was pulled out
 * of `terrain.worker.js`. Every claim about this logic rested on reading it, and the claim was wrong.
 *
 * THE DEFECT. `makeSeededRandom(key)` returns a FRESH generator on every call — captureMode.js is a bare
 * `mulberry32(hashKey(key))` with no per-key stream cache — so draw #1 for a given key is a fixed
 * constant. The re-roll keyed on the mob id alone, INSIDE the `if (moveTimer <= 0)` branch, so every
 * re-roll rebuilt the identical sequence: each mob drew one heading and one hop length and repeated them
 * forever, and a mob whose second draw fell below 0.3 never moved at all. A seeded CONSTANT is not
 * determinism, it is paralysis.
 *
 * Folding the roll counter into the key fixes it without giving up reproducibility: run the same capture
 * twice and mob 7's fourth re-roll is the same fourth re-roll, which is the property capture actually
 * needs. Reproducible ACROSS RUNS, varying WITHIN one.
 */

/**
 * @param {object} m
 * @param {string|number} m.id           the mob's stable id
 * @param {number} m.x                   current world x
 * @param {number} m.z                   current world z
 * @param {number} [m.wanderRoll]        how many times this mob has re-rolled (round-trips via the payload)
 * @param {string|number|null} [m.captureSeed]  non-null only under capture; null uses Math.random
 * @param {() => number} [m.rng]         injectable for tests; defaults to Math.random
 * @returns {{moveTimer:number, isMoving:boolean, targetX:number, targetZ:number, wanderRoll:number}}
 */
export function rollWander({ id, x, z, wanderRoll = 0, captureSeed = null, rng = Math.random }) {
  const roll = wanderRoll + 1;
  // PER-MOB stream, not a single shared one: mobs are processed in an order that can change between runs,
  // and a shared sequence would desync the moment it did. Keying by id makes each mob's draw independent
  // of when its turn came; keying by roll makes the mob actually wander.
  const rnd = captureSeed == null ? rng : makeSeededRandom(`${captureSeed}:mob:${id}:${roll}`);
  const moveTimer = 2 + rnd() * 4;
  const isMoving = rnd() > 0.3;
  let targetX = x;
  let targetZ = z;
  if (isMoving) {
    const angle = rnd() * Math.PI * 2;
    const distance = 3 + rnd() * 5;
    targetX = x + Math.cos(angle) * distance;
    targetZ = z + Math.sin(angle) * distance;
  }
  return { moveTimer, isMoving, targetX, targetZ, wanderRoll: roll };
}
