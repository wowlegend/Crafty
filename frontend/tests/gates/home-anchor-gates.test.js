import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// World-Design M1: the Hearth render must stay in the locked art direction (voxelKit flat-toon,
// NOT PBR), its brazier glow must self-null under capture (determinism), and the worker plinth
// must be deterministic + correctly ordered (player edits win). Strict source-literal gates.
describe('Home Anchor (the Hearth) gates', () => {
  const terrain = strip(read('world/Terrain.jsx'));
  const start = terrain.indexOf('const HomeAnchorRender');
  const block = start > -1 ? terrain.slice(start, start + 2500) : '';

  it('HomeAnchorRender exists in Terrain.jsx', () => {
    expect(start, 'const HomeAnchorRender = ...').toBeGreaterThan(-1);
  });
  it('renders via voxelKit (Cube), not PBR (no metalness/roughness in its own JSX)', () => {
    expect(block).toMatch(/<Cube\b/);
    expect(block).not.toMatch(/metalness|roughness/);
  });
  it('the brazier glow self-nulls under capture (Emissive downstream of !isCaptureMode())', () => {
    const guard = block.indexOf('!isCaptureMode()');
    const emissive = block.indexOf('<Emissive');
    expect(emissive, 'an Emissive brazier exists').toBeGreaterThan(-1);
    expect(guard, 'a capture guard exists').toBeGreaterThan(-1);
    expect(guard).toBeLessThan(emissive);
  });
  it('is mounted in MinecraftWorld (sibling of the chest renderer)', () => {
    expect(terrain).toMatch(/<HomeAnchorRender\s*\/>/);
  });

  it('homeAnchor.js uses no Math.random (deterministic plinth)', () => {
    expect(read('world/homeAnchor.js')).not.toMatch(/Math\.random/);
  });
  it('the worker stamps the Hearth BEFORE the player-mod replay (player edits win)', () => {
    const w = strip(read('world/terrain.worker.js'));
    const stamp = w.indexOf('stampHomeAnchor(blocks');
    // anchor on the replay-unique form (`.get(modKey)` alone also appears in the block-update handler)
    const mods = w.indexOf('const mods = chunkModifications.get(modKey)');
    expect(stamp, 'stampHomeAnchor is called').toBeGreaterThan(-1);
    expect(mods, 'player-mod replay exists').toBeGreaterThan(-1);
    expect(stamp).toBeLessThan(mods);
  });
});
