import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Reads BOTH halves of the mesh pipeline. `generateMesh` moved to src/world/mesher.js on 2026-08-05 so it
// could be tested behaviourally at all; this gate's third assertion silently pointed at the file the code
// had LEFT, which is a gate guarding an empty room. Concatenating the two keeps the original intent — these
// symbols must not exist anywhere in the mesh pipeline — and survives the code moving between them again.
const SRC = ['src/world/terrain.worker.js', 'src/world/mesher.js']
  .map((f) => readFileSync(resolve(process.cwd(), f), 'utf8'))
  .join('\n');
describe('W2-T2 mesher no longer emits water faces (Ocean.jsx owns water)', () => {
  it('the water-top unmerge + foam/depth bake is gone', () => {
    expect(SRC).not.toMatch(/isWaterTopFace/);
  });
  it('the per-column seabed-depth bake is gone', () => {
    expect(SRC).not.toMatch(/seabedDepthT\(/);
  });
  it('the `blockA > 0 && blockB === 0` branch excludes water (water top no longer drawn)', () => {
    // the surviving top-face branch must guard against water
    expect(SRC).toMatch(/blockA > 0 && blockA !== 9 && blockB === 0/);
  });
});
