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

  it('the worker selects the biome via pickBiome (data-driven), with a REASSIGNABLE surface binding', () => {
    // LOOSENED 2026-09-22, deliberately and with the property kept. This pinned the exact literal
    // `let { surfaceBlock, secondaryBlock } = pickBiome(temperature, moisture, continent)`. Q14 needed
    // the biome's NAME as well as its blocks, so the call became `const picked = pickBiome(...)` followed
    // by `let { surfaceBlock, secondaryBlock } = picked`. The gate fired — correctly, it was doing its
    // job — but what it was defending is that the surface blocks stay REASSIGNABLE for the beach override
    // below, not that the destructure sits on the same line as the call.
    //
    // So the assertion now names the property: pickBiome is called with the climate triple, and
    // surfaceBlock/secondaryBlock arrive through a `let`. Re-pinning the new literal would just move the
    // brittleness one edit into the future.
    expect(worker).toMatch(/from '\.\/biomeTable\.js'/);
    expect(worker).toMatch(/pickBiome\(temperature, moisture, continent\)/);
    expect(worker).toMatch(/let \{ surfaceBlock, secondaryBlock \}/);
    // and the reassignment it exists to permit is still there
    expect(worker).toMatch(/surfaceBlock = 4;/);
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
