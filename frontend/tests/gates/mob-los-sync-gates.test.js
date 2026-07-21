import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasLineOfSight } from '../../src/game/mobLineOfSight.js';

// ai.worker.js is a CLASSIC Worker (new Worker(url), no {type:'module'}), so it CANNOT import — its
// hasLineOfSight is an inline mirror of game/mobLineOfSight.js. Comparing source is the correct tool
// here (same structural-gate class as archer-kite-steer-gates). This gate (a) pins the behavioral
// reference via the imported pure module and (b) pins the worker's inline mirror to CLAMP its endpoints
// onto the 9x9 window — the fix for the cover-seek OOB read (ai.worker.js:202 passed an unclamped
// player cell to hasLineOfSight, so an off-grid index read undefined -> NaN -> a false "clear" that
// left cover unfindable at range).
const HERE = dirname(fileURLToPath(import.meta.url));
const worker = readFileSync(resolve(HERE, '../../src/workers/ai.worker.js'), 'utf8');
const between = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i + 1); return i >= 0 && j > i ? s.slice(i, j) : ''; };

describe('mob LOS — off-grid endpoints are clamped (worker inline-mirror sync)', () => {
  it('the pure reference clamps an off-grid endpoint so a wall still blocks (no false clear)', () => {
    const g = new Array(81).fill(0); g[4 + 4 * 9] = 5; // tall column at (4,4)
    expect(hasLineOfSight(g, 0, 0, 15, 15)).toBe(false); // (15,15) off-grid -> clamped to (8,8)
  });

  it("the worker's inline hasLineOfSight clamps its endpoints onto the 9x9 grid", () => {
    const region = between(worker, 'function hasLineOfSight', 'self.onmessage');
    expect(region, 'hasLineOfSight region not found — re-anchor this gate').not.toBe('');
    expect(region).toMatch(/clampCell/);
    // the sampled heights must come from the CLAMPED endpoints, not the raw args (the bug read x2/z2 directly)
    expect(region).toMatch(/heightGrid\[bx \+ bz \* cols\]/);
    expect(region).not.toMatch(/heightGrid\[x2 \+ z2 \* cols\]/);
  });
});
