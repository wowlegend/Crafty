import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('hub render gates', () => {
  const hub = strip(read('render/HubRender.jsx'));
  it('renders via voxelKit Cube (locked toon art direction, NOT PBR)', () => {
    expect(hub).toMatch(/<Cube\b/);
    expect(hub).not.toMatch(/metalness|roughness/);
  });
  it('iterates HUB_BUILDINGS (the deterministic layout)', () => {
    expect(hub).toMatch(/HUB_BUILDINGS/);
  });
  it('any glow self-nulls under capture (the brazier/beacon pattern)', () => {
    if (hub.includes('<Emissive')) expect(hub).toMatch(/!isCaptureMode\(\)/);
  });
  it('Terrain.jsx mounts HubRender next to HomeAnchorRender', () => {
    const terrain = read('world/Terrain.jsx');
    expect(terrain).toMatch(/<HubRender\b/);
  });
});
