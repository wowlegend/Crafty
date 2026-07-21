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
  it('EVERY glow self-nulls under capture (per-Emissive, not just once anywhere)', () => {
    // HubRender HAS glows (forge fire + lookout lantern); each must be `!isCaptureMode() && <Emissive>`
    // so none leaks into a deterministic baseline. MUTATION-PROOF: add an UNguarded <Emissive> and the
    // count-match goes RED (the old `if (includes) toMatch(/!isCaptureMode/)` stayed green — it only
    // needed the guard string to appear once, and was vacuous if Emissive were removed entirely).
    const emissives = hub.match(/<Emissive\b/g) || [];
    expect(emissives.length).toBeGreaterThan(0);
    const guarded = hub.match(/!isCaptureMode\(\)\s*&&\s*<Emissive\b/g) || [];
    expect(guarded.length).toBe(emissives.length);
  });
  it('Terrain.jsx mounts HubRender next to HomeAnchorRender', () => {
    const terrain = read('world/Terrain.jsx');
    expect(terrain).toMatch(/<HubRender\b/);
  });
});
