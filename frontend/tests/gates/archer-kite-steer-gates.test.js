import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { steerGoalCell } from '../../src/game/mobSteering.js';

// ai.worker.js is a CLASSIC Worker (instantiated with `new Worker(url)`, no {type:'module'}), so it CANNOT
// import — its Step-3 A* steer-goal math is an inline mirror of game/mobSteering.js steerGoalCell. Comparing
// source is therefore the CORRECT tool here (the same structural-gate class as attack-telegraph-gates), not a
// vacuous grep of behaviour that could be tested. This gate (a) pins the behavioral reference via the imported
// pure module and (b) pins the worker's inline mirror to resolve the A* goal from the TACTICAL target, not the
// player — the archer-kite regression (ai.worker.js:302): a retreating archer steered from playerX gets
// re-targeted straight back into melee, so the archer archetype never kites.
const HERE = dirname(fileURLToPath(import.meta.url));
const worker = readFileSync(resolve(HERE, '../../src/workers/ai.worker.js'), 'utf8');
const between = (s, a, b) => { const i = s.indexOf(a); const j = s.indexOf(b, i + 1); return i >= 0 && j > i ? s.slice(i, j) : ''; };

describe('archer kite — Step-3 steers toward the tactical target (worker inline-mirror sync)', () => {
  it('the pure reference kites: a retreat target (away from the player) yields an away-side goal cell', () => {
    // mob (10,10), player east; retreat target (8,10) -> goal gx<4 (west/away). Full matrix in mobSteering.test.js.
    expect(steerGoalCell(8, 10, 10, 10).gx).toBeLessThan(4);
  });

  // REWRITTEN 2026-08-02: the worker no longer mirrors steerGoalCell, it imports it (the "classic Worker
  // cannot import" premise was false; the built bundle has zero bare imports because Vite inlines them).
  // So there is no second copy to pin — assert the import and that Step-3 CALLS it with the tactical
  // target rather than the player. Both anchors are syntactic, which gate-shape.mjs verifies cannot be
  // satisfied by a comment alone.
  it('the worker IMPORTS steerGoalCell and calls it with the TACTICAL target, not the player', () => {
    expect(worker, 'ai.worker must import steerGoalCell from game/mobSteering.js').toMatch(
      /import\s*\{[^}]*\bsteerGoalCell\b[^}]*\}\s*from\s*['"][^'"]*mobSteering\.js['"]/
    );
    const step3 = between(worker, 'Step 3: Voxel Height-Aware', 'if (path && path.length');
    expect(step3, 'Step-3 region not found — re-anchor this gate').not.toBe('');
    // the goal comes from (targetX, targetZ) — the mob's tactical decision, which points AWAY for a
    // retreating archer — and never from (playerX, playerZ), which is the kite regression.
    expect(step3).toMatch(/steerGoalCell\(\s*targetX\s*,\s*targetZ\s*,/);
    expect(step3).not.toMatch(/steerGoalCell\(\s*playerX/);
  });
});
