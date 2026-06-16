import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { blightHeartSite, blightHeartChunk } from '../../src/world/blightHeart.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// SOTA M4 #8: the Blight-Heart lair (the climax destination) gets a PHYSICAL landmark -- an obsidian
// monolith + blight-violet beacon -- so it reads from afar (was an invisible coordinate: marker + spawn only).
describe('blight-heart monolith gates (M4 #8)', () => {
  const terrain = read('world/Terrain.jsx');

  it('blightHeartChunk contains the site (pure)', () => {
    const { x } = blightHeartSite();
    expect(blightHeartChunk().cx).toBe(Math.floor(x / 16));
  });
  it('Terrain renders a BlightMonolith + BlightHeartRender, mounted from the lair site', () => {
    expect(terrain).toMatch(/import \{ blightHeartSite, blightHeartChunk \} from '\.\/blightHeart\.js'/);
    expect(terrain).toMatch(/function BlightMonolith\(/);
    expect(terrain).toMatch(/const BlightHeartRender = /);
    expect(terrain).toMatch(/<BlightHeartRender chunks=\{chunks\} \/>/);
  });
  it('mounts only when the lair chunk is loaded + the beacon is real-play-only (capture-safe)', () => {
    expect(terrain).toMatch(/blightHeartChunk\(\)/);
    expect(/c\.cx === bcx && c\.cz === bcz/.test(terrain)).toBe(true);
    expect(/!isCaptureMode\(\) && <Emissive[\s\S]{0,80}#A030F0/.test(terrain)).toBe(true);
  });
});
