import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// World-Design M4a: the snow biome must grow pines (was barren), deterministically, reusing the
// existing wood/leaves blocks — NO new block ids (palette is M4b).
describe('Biome foliage gate (World-M4a)', () => {
  const worker = strip(read('world/terrain.worker.js'));
  // isolate the foliage pass (between the gate and the home-anchor stamp) to scope the assertions
  const start = worker.indexOf('vegRandom(worldX, worldZ, 1) < 0.02');
  const end = worker.indexOf('stampHomeAnchor(blocks');
  const pass = worker.slice(start, end);

  it('the snow biome (surfaceBlock===5) now grows pines (no longer barren)', () => {
    expect(pass).toMatch(/surfaceBlock === 5/);
    expect(worker).toMatch(/from '\.\/foliage\.js'/);
    expect(pass).toMatch(/pineShape\(/);
  });
  it('the pine is deterministic (vegRandom, never Math.random) and reuses wood/leaves (no new block id)', () => {
    const snow = pass.slice(pass.indexOf('surfaceBlock === 5'));
    expect(snow).toMatch(/vegRandom\(worldX, worldZ, 4\)/);
    expect(snow).not.toMatch(/Math\.random/);
    expect(snow).toMatch(/= 6;/);  // trunk = wood
    expect(snow).toMatch(/= 7;/);  // needles = leaves
    expect(snow).not.toMatch(/= 1[0-9];/); // no block id >= 10 (palette is M4b)
  });
  it('foliage.js uses no Math.random (deterministic shapes)', () => {
    expect(read('world/foliage.js')).not.toMatch(/Math\.random/);
  });
});
