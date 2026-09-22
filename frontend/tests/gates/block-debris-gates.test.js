import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { carriersOf } from './_srcWalk.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// Regression (2026-06-28 audit, HIGH): @react-three/rapier 2.2 REMOVED the positions/rotations/scales
// array props on <InstancedRigidBodies> and requires a single `instances` prop. The old code passed the
// legacy arrays -> 0 rigid bodies created -> the forwarded ref defaulted to [] -> api.current.at(idx)
// was undefined -> `.setTranslation` threw a TypeError on EVERY block mined (debris dead + console spam).
// Also the old scales were [0,0,0] (invisible) and never scaled up, so debris was invisible even with bodies.
/*
 * ENHANCED 2026-09-22, selected by `gate-census.mjs` at 0/5.
 *
 * The removed-props check is now REPO-WIDE. It was scoped to `BlockParticleSystem.jsx`, but the rapier
 * 2.2 breakage is a property of the API, not of that file: any component passing the removed
 * positions/rotations/scales arrays to <InstancedRigidBodies> creates zero rigid bodies and throws a
 * TypeError on first use. A second such call site was invisible to the old scope.
 *
 * BLIND SPOT, stated (R7): source text throughout. Nothing here creates a rigid body, mines a block, or
 * observes debris. The original defect had TWO halves — no bodies created, AND a [0,0,0] scale that made
 * debris invisible even when bodies existed — and the second half is exactly the kind that a structural
 * check cannot see the consequence of. A green result here means the API shape is right, not that
 * anything is visible on screen.
 *
 * Mutation-Proof: 3 mutations, recorded on the commit.
 */
describe('block-break debris — rapier 2.2 InstancedRigidBodies API', () => {
  const src = read('world/BlockParticleSystem.jsx');

  it('the subject was read — two cases below are negative assertions', () => {
    // R3a: `not.toMatch` over an empty read reports the defect as fixed.
    expect(src.length).toBeGreaterThan(1000);
    expect(src).toContain('InstancedRigidBodies');
  });

  it('uses the rapier-2.2 `instances` prop', () => {
    expect(src).toMatch(/instances=\{/);
  });

  it('NO module in src/ passes the removed array props — the API broke, not one file', () => {
    // Repo-wide. rapier 2.2 removed these; any caller still passing them creates zero bodies and throws
    // on first use. Scoping this to one file made a second call site invisible.
    for (const prop of ['positions', 'rotations', 'scales']) {
      expect(carriersOf(new RegExp(`\\n\\s*${prop}=\\{`)),
        `a component still passes the rapier-2.2-removed \`${prop}\` prop`).toEqual([]);
    }
  });

  it('builds MAX_PARTICLES instances, each with a key and a VISIBLE (non-zero) scale', () => {
    expect(src).toMatch(/key:\s*i/);
    expect(src).toMatch(/scale:\s*\[1,\s*1,\s*1\]/); // was [0,0,0] -> debris never visible
  });
});
