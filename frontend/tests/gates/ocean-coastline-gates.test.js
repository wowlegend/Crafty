import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEA_LEVEL, BEACH_BAND_TOP } from '../../src/world/oceanProfile.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// World-Design M2: the two shoreline consts must stay distinct (the 28->30 gap is the shoreline),
// and the worker must route the ocean profile through the named module (no leftover magic 28/30 at the
// 4 worldgen sites). (W2: the voxel water mesh is GONE -- the Ocean.jsx Gerstner plane owns the surface
// now, so the old "water mesh does NOT cast shadow" assertion no longer applies.)
describe('Ocean + coastline gates (World-M2)', () => {
  const worker = strip(read('world/terrain.worker.js'));

  it('the two shoreline consts stay distinct (the 28->30 gap is load-bearing)', () => {
    expect(BEACH_BAND_TOP).toBeGreaterThan(SEA_LEVEL);
  });
  it('the worker imports the ocean profile (consts + the seabed curve)', () => {
    expect(worker).toMatch(/from '\.\/oceanProfile\.js'/);
    expect(worker).toMatch(/oceanSurfaceY\(/);
  });
  it('the 4 worldgen sites use the named consts, not magic 28/30', () => {
    expect(worker, 'water fill').toMatch(/y <= SEA_LEVEL/);
    expect(worker, 'foliage gate').toMatch(/surfaceY > SEA_LEVEL/);
    expect(worker, 'beach override').toMatch(/surfaceY < BEACH_BAND_TOP/);
    // the ocean branch routes through the module, not an inline 12 + n*12
    expect(worker).not.toMatch(/targetOceanHeight\s*=\s*12 \+ n \* 12/);
  });
});
