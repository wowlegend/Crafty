import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// Phase B M1 — biome-flora render-wiring: the foliage decorator branches on the biome's `flora`
// kind (biomeTable), not just the surface block, so grass biomes diverge + mesa stays bare.
describe('Biome-flora wiring gate (Phase B M1)', () => {
  const worker = strip(read('world/terrain.worker.js'));
  const start = worker.indexOf('vegRandom(worldX, worldZ, 1) < 0.02');
  const end = worker.indexOf('stampHomeAnchor(blocks');
  const pass = worker.slice(start, end);

  it('the foliage pass derives the biome flora kind (pickBiome, gen-time pure)', () => {
    expect(pass).toMatch(/pickBiome\(/);
    expect(pass).toMatch(/\.flora/);
  });
  it('taiga (grass + flora pine) grows pines, not broadleaf oaks', () => {
    expect(pass).toMatch(/surfaceBlock === 1 && flora === 'pine'/);
  });
  it('cacti are gated to the cactus flora (mesa flora none stays bare; no cacti on every sand column)', () => {
    expect(pass).toMatch(/surfaceBlock === 4 && flora === 'cactus'/);
  });
  it('flora wiring adds no Math.random (deterministic gen)', () => {
    // the whole foliage pass stays vegRandom-only
    expect(pass).not.toMatch(/Math\.random/);
  });
});
