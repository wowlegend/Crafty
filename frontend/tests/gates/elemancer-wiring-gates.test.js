import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip, sourceFiles } from './_srcWalk.js';

const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

/**
 * S2-B4-M4/M5 — the ELEMANCER wiring locks. These assert a PRESENCE (the zone-slow consumer exists, the
 * imbue latch is wired) and one deliberate absence (the dead mobSlowEffects plumbing stays dead). They
 * used to live inside `elemancer-noremesh-gates.test.js`, whose name was therefore true of only half its
 * cases; a no-re-mesh gate and a wiring lock fail for unrelated reasons and belong apart.
 *
 * WHAT THE OLD VERSION COULD NOT SEE, and it matters. The zone-slow lock read
 * `SimplifiedNPCSystem.jsx` and `systems/AIWorkerSystem.jsx`, CONCATENATED them, and matched the speed
 * line against the pair — so it could never say which file carried it. Measured 2026-09-22:
 * `zoneSlowMult` appears in AIWorkerSystem ONLY; SimplifiedNPCSystem has zero occurrences. That is
 * correct (AIWorkerSystem was extracted out of it in the A1.4 de-monolith and is rendered by it), but the
 * gate stayed green straight through the move without anyone learning it had happened — gate-authoring
 * class 6, a guard green while its subject relocates. A concatenation is a way of not asking where.
 *
 * So the lock now asserts the property instead: the speed line exists, AND it is UNIQUE in the whole of
 * `src/`. A second consumer appearing — the real risk, two code paths slowing mobs by different amounts —
 * reds here, which the old form could not have detected either.
 *
 * BLIND SPOT, stated (R7): these are source assertions. Nothing here proves a mob standing in a frost
 * zone actually slows down in a running game; that needs the AI worker and a live world. What they do
 * prove is that exactly one line can make it happen and that line still exists.
 *
 * Mutation-Proof: 3 mutations, recorded on the commit. Denominator asserted (the src walk must find
 * >300 files, or the uniqueness claim is quantifying over nothing).
 */
describe('elemancer zone-slow wiring locks', () => {
  const files = sourceFiles();

  it('the src walk reached the codebase — the uniqueness claim below needs a denominator', () => {
    // R3a: `exactly one file matches` is trivially satisfiable by finding no files at all.
    expect(files.length).toBeGreaterThan(300);
  });

  it('the zone-slow speed line exists, and is the ONLY one in src/', () => {
    const LINE = /e\.speed \* \(e\.zoneSlowMult \|\| 1\)/;
    const carriers = files.filter((f) => LINE.test(strip(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(SRC.length + 1));
    expect(carriers, 'exactly one module may apply the zone slow to mob speed').toEqual([
      'systems/AIWorkerSystem.jsx',
    ]);
  });

  it('the dead mobSlowEffects plumbing stays dead (no resurrection)', () => {
    // Shipped with zero readers, deleted at M4. Both former homes are checked by name because the claim
    // is about those two modules specifically, not about the repo.
    expect(strip(read('EnhancedMagicSystem.jsx'))).not.toMatch(/mobSlowEffects|mobStunEffects/);
    expect(strip(read('store/useGameStore.jsx'))).not.toMatch(/mobSlowEffects|mobStunEffects/);
  });

  it('the imbue latch is wired in Components — decided there, armed there', () => {
    const c = strip(read('Components.jsx'));
    // Call shape, not bare token: `decideImbue` in a comment or an import alone is not a wiring.
    expect(c).toMatch(/decideImbue\s*\(/);
    expect(c).toMatch(/armImbueCast\s*\(/);
  });
});
