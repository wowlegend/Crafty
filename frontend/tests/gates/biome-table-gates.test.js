import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// World-Design M3: biome selection must stay data-driven (pickBiome) with a `let` binding so the
// beach override can still reassign to sand AFTER the pick — and the old inline branch must be gone.
describe('Biome table gate (World-M3)', () => {
  const worker = strip(read('world/terrain.worker.js'));

  it('the worker selects the biome via pickBiome (data-driven), with a let binding for the beach override', () => {
    expect(worker).toMatch(/from '\.\/biomeTable\.js'/);
    expect(worker).toMatch(/let \{ surfaceBlock, secondaryBlock \} = pickBiome\(temperature, moisture, continent\)/);
  });
  it('the inline temperature/moisture biome branch is GONE (moved into pickBiome)', () => {
    expect(worker).not.toMatch(/if \(temperature > 0\.7 && moisture < 0\.3\)/);
    expect(worker).not.toMatch(/else if \(temperature < 0\.3\)/);
  });
  it('the beach override still runs (sand band preserved, AFTER the biome pick)', () => {
    const pick = worker.indexOf('pickBiome(temperature');
    const beach = worker.indexOf('surfaceY < BEACH_BAND_TOP');
    expect(pick).toBeGreaterThan(-1);
    expect(beach).toBeGreaterThan(pick); // beach override comes after the biome pick
  });
});
