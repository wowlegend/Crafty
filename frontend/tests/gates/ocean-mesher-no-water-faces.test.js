import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const SRC = readFileSync(resolve(process.cwd(), 'src/world/terrain.worker.js'), 'utf8');
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
