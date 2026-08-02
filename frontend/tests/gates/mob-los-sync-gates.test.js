import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasLineOfSight } from '../../src/game/mobLineOfSight.js';

// REWRITTEN 2026-08-02. ai.worker.js used to hand-mirror game/mobLineOfSight.js, justified by a comment
// claiming a classic Worker cannot import. It was false — src/world/terrain.worker.js imports ten modules,
// and the built ai.worker bundle now contains zero bare imports because Vite inlines them. The worker
// imports the module directly, so there is no second copy left to pin.
//
// The old sync half of this gate could not have detected drift anyway: it asserted that certain regexes
// were PRESENT in each file, never that the two implementations AGREE. A differential fuzz against a
// deliberately-drifted copy produced 21,655 mismatches in 200,000 randomized grids with all four
// assertions green.
//
// What remains: the behavioural test on the pure module (the real guard), plus an assertion that the
// worker still IMPORTS it and has not re-grown a local copy. That second one is anchored to the import
// SPECIFIER, so scripts/ci/gate-shape.mjs can confirm a comment alone cannot satisfy it.
const HERE = dirname(fileURLToPath(import.meta.url));
const worker = readFileSync(resolve(HERE, '../../src/workers/ai.worker.js'), 'utf8');

describe('mob LOS — off-grid endpoints are clamped', () => {
  it('the pure reference clamps an off-grid endpoint so a wall still blocks (no false clear)', () => {
    const g = new Array(81).fill(0); g[4 + 4 * 9] = 5; // tall column at (4,4)
    expect(hasLineOfSight(g, 0, 0, 15, 15)).toBe(false); // (15,15) off-grid -> clamped to (8,8)
  });

  it('a wall between two on-grid endpoints blocks, and open ground does not', () => {
    const wall = new Array(81).fill(0); wall[4 + 4 * 9] = 5;
    expect(hasLineOfSight(wall, 0, 4, 8, 4)).toBe(false); // straight through the tall column
    expect(hasLineOfSight(new Array(81).fill(0), 0, 4, 8, 4)).toBe(true); // flat ground is clear
  });

  it('the worker IMPORTS the shared module and keeps no local copy of it', () => {
    expect(worker, 'ai.worker must import hasLineOfSight from game/mobLineOfSight.js').toMatch(
      /import\s*\{[^}]*\bhasLineOfSight\b[^}]*\}\s*from\s*['"][^'"]*mobLineOfSight\.js['"]/
    );
    expect(worker, 'a local hasLineOfSight definition means the mirror has grown back').not.toMatch(
      /function\s+hasLineOfSight\s*\(/
    );
  });
});
