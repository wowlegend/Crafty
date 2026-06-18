import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

describe('radial-minimap gates', () => {
  const mm = read('ui/RadialMinimap.jsx');
  it('is circular-clipped (border-radius/clip / arc full-circle mask)', () => {
    expect(mm).toMatch(/borderRadius|rounded-full|clip/);
  });
  it('plots destination blips for HOME + nearest SHRINE + BLIGHT HEART', () => {
    expect(mm).toMatch(/nearestLandmark/);
    expect(mm).toMatch(/blightHeartSite/);
  });
  it('plots mob + NPC blips from the store mirrors', () => {
    expect(mm).toMatch(/mobEntities/);
    expect(mm).toMatch(/npcEntities/);
  });
  it('does NOT use the off-brand Orbitron font (W2/Art lock)', () => {
    expect(mm).not.toMatch(/Orbitron/);
  });
  it('HUD mounts RadialMinimap instead of the legacy square Minimap', () => {
    const hud = read('HUD.jsx');
    expect(hud).toMatch(/RadialMinimap/);
  });
});
