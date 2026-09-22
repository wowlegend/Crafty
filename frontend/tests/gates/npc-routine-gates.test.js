import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip, carriersOf } from './_srcWalk.js';
import { routinePosition, routinePositionInto } from '../../src/game/npcRoutine.js';

const read = (rel) => strip(readFileSync(resolve(SRC, rel), 'utf8'));

/**
 * NPC ambient routine — patrol by day, retreat home at night, frozen under capture.
 *
 * REWRITTEN 2026-09-22, selected by `gate-census.mjs` at 0/5. All three assertions were bare-token greps
 * over two CONCATENATED files (`/routinePosition/`, `/isCaptureMode\\(\\)/`, `/isDay/`). The last is very
 * nearly unfalsifiable — `isDay` appears in almost any file that knows about time — and the
 * concatenation meant none of them could say which file carried what, in a pair the A1.4 de-monolith had
 * already moved code between.
 *
 * The routine MATH is not re-tested here: `routinePosition` is pure and already has two driven test
 * files (`src/game/npcRoutine.test.js`, `tests/data/npcRoutine.test.js`). Duplicating it would be a
 * third, weaker copy. This gate owns the two things those cannot see.
 *
 * THE FIRST IS A REAL DRIFT RISK THE OLD GATE COULD NOT HAVE FOUND. `npcRoutine.js` carries the patrol
 * rule TWICE — `routinePosition` returns a fresh object, `routinePositionInto` writes into one for the
 * per-frame loop — and the two implementations are independent copies of the same arithmetic. The file's
 * own comment deletes a different helper for precisely this reason ("Two expressions of one rule is one
 * that can drift") and then keeps two expressions of the patrol rule. Nothing compared them until now.
 * If they drift, an NPC moves differently depending on which caller reached it, which reads as a
 * physics glitch rather than as a bug.
 *
 * BLIND SPOT, stated (R7): the wiring half is still source text. Nothing here proves the ambient tick
 * RUNS in a live game or that an NPC visibly walks — that needs a booted world, and the repo's scar list
 * has four cases of exactly this shape shipping green (a feature compiled, gated and never reached).
 * What is proven is that the two routine implementations cannot disagree, and that the tick's capture
 * guard is inside the tick rather than somewhere else in the file.
 *
 * Mutation-Proof: 4 mutations, recorded on the commit.
 */
describe('npc ambient routine', () => {
  it('the two implementations of the patrol rule AGREE — they are copies, and copies drift', () => {
    const out = { x: 0, z: 0 };
    let checked = 0;
    for (const home of [{ x: 0, z: 0 }, { x: -13.5, z: 402 }, { x: 7, z: -7 }]) {
      for (const t of [0, 0.5, 1, 6.28, 25.13, 1000, 1e6]) {
        for (const isDay of [true, false]) {
          const a = routinePosition(home, t, isDay);
          const b = routinePositionInto(out, home.x, home.z, t, isDay);
          expect([b.x, b.z], `the two routines disagree at home=${home.x},${home.z} t=${t} isDay=${isDay}`)
            .toEqual([a.x, a.z]);
          checked++;
        }
      }
    }
    expect(checked, 'the sweep must actually run, or this passes over nothing').toBe(42);
  });

  it('night is RETREAT: the NPC sits exactly on its home anchor, at any time', () => {
    // The gameplay rule, driven. A patrol offset surviving into night is what "retreat" means failing.
    for (const t of [0, 3.1, 99.9]) {
      expect(routinePosition({ x: 5, z: -5 }, t, false)).toEqual({ x: 5, z: -5 });
    }
  });

  it('day is PATROL: the NPC leaves its anchor, and stays on a small radius around it', () => {
    const home = { x: 100, z: 200 };
    const radii = [0, 1, 2, 3, 4, 5].map((t) => {
      const p = routinePosition(home, t, true);
      return Math.hypot(p.x - home.x, p.z - home.z);
    });
    // Every sample is on the patrol circle — a constant radius is the invariant, not a sampled value.
    for (const r of radii) expect(r).toBeCloseTo(radii[0], 10);
    expect(radii[0], 'the patrol radius collapsed to zero — NPCs would stand still all day')
      .toBeGreaterThan(0.5);
    expect(radii[0], 'the patrol radius grew past "hovering near their post"').toBeLessThan(5);
  });

  it('the per-frame ambient tick uses the ALLOCATION-FREE variant, and is the only caller shape', () => {
    // routinePositionInto exists because the object-returning form allocated two literals per NPC per
    // RENDER frame. A caller reverting to routinePosition in that loop is a silent perf regression.
    const ai = read('systems/AIWorkerSystem.jsx');
    expect((ai.match(/routinePositionInto\s*\(/g) || []).length,
      'the ambient tick no longer calls the allocation-free routine').toBeGreaterThan(0);
    expect(ai, 'the per-frame loop is allocating a routine object again').not.toMatch(/=\s*routinePosition\s*\(/);
  });

  it('the ambient routine is capture-suppressed, and the guard is in the file that ticks', () => {
    // Anchored to the file that owns the tick rather than a concatenation of two, so a relocation is
    // visible instead of absorbed.
    expect(read('systems/AIWorkerSystem.jsx'), 'NPCs would wander during capture and break byte-stable frames')
      .toMatch(/isCaptureMode\s*\(\s*\)/);
    // Exactly one module DRIVES the routine, named rather than counted. A count could not tell the
    // definition site from a call site — `export function routinePositionInto(` matches the same regex —
    // which is the definition-vs-invocation confusion this repo has shipped before. Listing both makes
    // the expectation legible and reds if a second consumer appears.
    expect(carriersOf(/routinePositionInto\s*\(/), 'a second module now drives the ambient routine')
      .toEqual(['game/npcRoutine.js', 'systems/AIWorkerSystem.jsx']);
  });
});
