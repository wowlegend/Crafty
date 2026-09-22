import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BIOMES } from '../../src/world/biomeTable.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * Phase B M1 — biome-flora wiring: the foliage decorator branches on the biome's `flora` kind, not just
 * the surface block, so grass biomes diverge and mesa stays bare.
 *
 * ENHANCED 2026-09-22, selected by `gate-census.mjs` at 0/5. Every assertion was a grep over a slice of
 * the worker for literals like `surfaceBlock === 1 && flora === 'pine'`. Those pin the WIRING, which is
 * fair — the foliage pass needs noise fields and cannot be executed here — but not one of them touched
 * the property the wiring exists to deliver: that the biomes actually HAVE divergent flora. Rewrite the
 * branch equivalently and the greps red on correct code; set every biome's flora to the same value and
 * they all stay green while the world goes uniform.
 *
 * `BIOMES` is a plain table, so the divergence IS drivable, and the cases below drive it.
 *
 * Mutation-Proof: 3 mutations, denominator asserted (6/6 cases collected on every run).
 *   M1 set taiga.flora to 'forest' (collide with another surfaceBlock-1 biome) -> divergence case RED
 *   M2 give mesa a flora other than 'none'  -> bare-mesa case RED
 *   M3 remove `flora === 'cactus'` from the worker's sand branch -> cactus wiring case RED
 * biomeTable.js / terrain.worker.js restored from cp backups and diffed byte-identical after each.
 *
 * BLIND SPOT, stated (R7): the four wiring assertions are slice-greps over the worker. Nothing here
 * proves a pine is ever PLACED — that needs the noise fields, i.e. a generated chunk, which this gate
 * deliberately does not build.
 */
describe('Biome-flora wiring gate (Phase B M1)', () => {
  const worker = strip(read('world/terrain.worker.js'));
  const start = worker.indexOf('vegRandom(worldX, worldZ, 1) < 0.02');
  const end = worker.indexOf('stampHomeAnchor(blocks');
  const pass = worker.slice(start, end);

  it('the six biomes sharing surfaceBlock 1 have DISTINCT flora — the divergence the wiring delivers', () => {
    // The property, driven. Without this the greps below pass on a world where every grass biome grows
    // the same tree, which is exactly the "six biomes render identically" defect one layer up.
    const grassy = Object.keys(BIOMES).filter((n) => BIOMES[n].surfaceBlock === 1);
    expect(grassy.length).toBe(6); // the denominator, asserted so it cannot quietly change
    expect(new Set(grassy.map((n) => BIOMES[n].flora)).size).toBe(grassy.length);
  });

  it('mesa is the bare one — flora none, so badlands stay badlands', () => {
    expect(BIOMES.mesa.flora).toBe('none');
    // and it is the ONLY bare biome, or "bare mesa" is not a distinguishing trait at all
    expect(Object.keys(BIOMES).filter((n) => BIOMES[n].flora === 'none')).toEqual(['mesa']);
  });

  it('the foliage pass derives the biome flora kind (pickBiome, gen-time pure)', () => {
    expect(pass.length).toBeGreaterThan(200); // R3a — the slice really found the foliage pass
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
