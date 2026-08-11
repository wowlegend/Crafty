import { describe, it, expect } from 'vitest';
import { rollWander } from './mobWander.js';

// A SEEDED CONSTANT IS NOT DETERMINISM, IT IS PARALYSIS.
//
// `makeSeededRandom(key)` returns a FRESH generator on every call — captureMode.js is a bare
// `mulberry32(hashKey(key))` with no per-key stream cache — so draw #1 for a given key is a fixed
// constant. The re-roll keyed on the mob id alone, inside `if (moveTimer <= 0)`, so every re-roll rebuilt
// the identical sequence: each mob drew ONE heading and ONE hop length and repeated them for its whole
// life, and a mob whose second draw fell below 0.3 never moved at all.
//
// This was untestable until the logic came out of ai.worker.js, which assigns self.onmessage at module
// scope so importing it under vitest throws. Every claim about it rested on reading it, and the claim was
// wrong — which is the same reason the greedy mesher was extracted from terrain.worker.js.
const SEED = 'capture-ai';
const at = (extra = {}) => ({ id: 7, x: 10, z: -4, captureSeed: SEED, ...extra });

/** Run `n` consecutive re-rolls the way the worker does, threading the counter back in. */
function sequence(n, base = {}) {
  const out = [];
  let roll = 0;
  for (let i = 0; i < n; i++) {
    const w = rollWander(at({ ...base, wanderRoll: roll }));
    roll = w.wanderRoll;
    out.push(w);
  }
  return out;
}

describe('rollWander — seeded, and actually wandering', () => {
  it('successive re-rolls DIFFER — the defect was that they did not', () => {
    const seq = sequence(6);
    const headings = new Set(seq.map((w) => `${w.targetX.toFixed(6)},${w.targetZ.toFixed(6)}`));
    expect(headings.size, 'every re-roll produced the same target — the mob repeats one hop forever').toBeGreaterThan(3);
    const timers = new Set(seq.map((w) => w.moveTimer.toFixed(6)));
    expect(timers.size, 'every re-roll produced the same timer').toBeGreaterThan(3);
  });

  it('the mob does not freeze — over many rolls it sometimes moves and sometimes rests', () => {
    // The cruellest form of the bug: a mob whose second draw was <= 0.3 had isMoving false on EVERY roll
    // and stood still for its entire life, which reads as an AI bug rather than an RNG bug.
    const moving = sequence(40).filter((w) => w.isMoving).length;
    expect(moving, 'the mob never moves').toBeGreaterThan(0);
    expect(moving, 'the mob never rests either — the draw is not being consulted').toBeLessThan(40);
  });

  it('is REPRODUCIBLE across runs — the property capture actually needs', () => {
    // Varying WITHIN a run and identical ACROSS runs are not in tension; the old code had neither.
    expect(sequence(5)).toEqual(sequence(5));
  });

  it('two mobs re-rolling at the same moment do not march in lockstep', () => {
    // Processing order can change between runs, which is why the stream is keyed per mob in the first
    // place. Different ids must give different draws or the whole herd shares one heading.
    const a = rollWander({ id: 1, x: 0, z: 0, wanderRoll: 3, captureSeed: SEED });
    const b = rollWander({ id: 2, x: 0, z: 0, wanderRoll: 3, captureSeed: SEED });
    expect(a.moveTimer).not.toBeCloseTo(b.moveTimer, 6);
  });

  it('advances the counter by exactly one, so the caller can thread it back', () => {
    expect(rollWander(at({ wanderRoll: 0 })).wanderRoll).toBe(1);
    expect(rollWander(at({ wanderRoll: 41 })).wanderRoll).toBe(42);
    expect(rollWander(at({ wanderRoll: undefined })).wanderRoll).toBe(1);
  });

  it('outside capture it uses the injected rng and never touches the seeded path', () => {
    const draws = [0.5, 0.9, 0.25, 0.5];
    let i = 0;
    const w = rollWander({ id: 1, x: 0, z: 0, captureSeed: null, rng: () => draws[i++ % draws.length] });
    expect(w.moveTimer).toBeCloseTo(2 + 0.5 * 4, 10);
    expect(w.isMoving).toBe(true); // 0.9 > 0.3
    expect(i, 'the four draws were not all consumed — the shape changed').toBe(4);
  });

  it('a resting mob keeps its position as its target rather than emitting NaN', () => {
    const w = rollWander({ id: 1, x: 12, z: -8, captureSeed: null, rng: () => 0.1 }); // 0.1 <= 0.3 -> rest
    expect(w.isMoving).toBe(false);
    expect(w.targetX).toBe(12);
    expect(w.targetZ).toBe(-8);
  });

  it('stays inside the declared hop range so a re-roll cannot teleport a mob', () => {
    for (const w of sequence(30).filter((r) => r.isMoving)) {
      const d = Math.hypot(w.targetX - 10, w.targetZ + 4);
      expect(d).toBeGreaterThanOrEqual(3 - 1e-9);
      expect(d).toBeLessThanOrEqual(8 + 1e-9);
    }
  });
});
