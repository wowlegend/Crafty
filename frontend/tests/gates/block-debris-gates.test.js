import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// Regression (2026-06-28 audit, HIGH): @react-three/rapier 2.2 REMOVED the positions/rotations/scales
// array props on <InstancedRigidBodies> and requires a single `instances` prop. The old code passed the
// legacy arrays -> 0 rigid bodies created -> the forwarded ref defaulted to [] -> api.current.at(idx)
// was undefined -> `.setTranslation` threw a TypeError on EVERY block mined (debris dead + console spam).
// Also the old scales were [0,0,0] (invisible) and never scaled up, so debris was invisible even with bodies.
describe('block-break debris — rapier 2.2 InstancedRigidBodies API', () => {
  const src = read('world/BlockParticleSystem.jsx');

  it('uses the rapier-2.2 `instances` prop', () => {
    expect(src).toMatch(/instances=\{/);
  });

  it('does NOT pass the removed positions/rotations/scales array props to InstancedRigidBodies', () => {
    expect(src).not.toMatch(/\n\s*positions=\{/);
    expect(src).not.toMatch(/\n\s*rotations=\{/);
    expect(src).not.toMatch(/\n\s*scales=\{/);
  });

  it('builds MAX_PARTICLES instances, each with a key and a VISIBLE (non-zero) scale', () => {
    expect(src).toMatch(/key:\s*i/);
    expect(src).toMatch(/scale:\s*\[1,\s*1,\s*1\]/); // was [0,0,0] -> debris never visible
  });
});
