import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');

// S2-B4-M3: the ELEMANCER no-re-mesh gate — the 4th clone of the proven stencil. The Aspect's
// v1 promise is ZERO voxel edits / ZERO worker traffic / ZERO re-mesh (the design's central
// deliverable); these files are gated FROM BIRTH, before any render existed. The regex matches
// literal tokens anywhere (comments included) — by design: cheap and unbluffable.
describe('elemancer no-re-mesh gate', () => {
  const FORBIDDEN = /setWorldBlocks|terrain\.worker|createChunk|setBlock|postMessage|update_block/;
  const GATED = [
    'game/elemancer.js',        // the imbue latch
    'game/resonance.js',        // the build-verb economy
    'game/elementZones.js',     // the chemistry core (registry + overlap rules)
    'game/elemancerChannel.js', // the zone request transient
    'world/ElementZoneSystem.jsx', // the M4 bridge (chemistry -> combat)
    // M6 adds the overlay render — extend IN PLACE.
  ];

  for (const rel of GATED) {
    it(`${rel} references no voxel-edit / chunk-worker seam`, () => {
      const src = readFileSync(resolve(SRC, rel), 'utf8');
      const m = src.match(FORBIDDEN);
      expect(m, `forbidden voxel seam "${m && m[0]}" in ${rel}`).toBe(null);
    });
  }
});

// S2-B4-M4: the wiring locks — the frozen-slow consumer exists at the ONE mobsData speed
// line, and the dead mobSlowEffects plumbing (shipped with zero readers; deleted M4) STAYS dead.
describe('elemancer zone-slow wiring locks', () => {
  const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');
  it('the mobsData speed line consumes zoneSlowMult (the ONE consumer)', () => {
    expect(read('SimplifiedNPCSystem.jsx')).toMatch(/e\.speed \* \(e\.zoneSlowMult \|\| 1\)/);
  });
  it('the dead mobSlowEffects plumbing stays dead (no resurrection)', () => {
    expect(read('EnhancedMagicSystem.jsx')).not.toMatch(/mobSlowEffects|mobStunEffects/);
    expect(read('store/useGameStore.jsx')).not.toMatch(/mobSlowEffects|mobStunEffects/);
  });
  // S2-B4-M5: the verb wiring stays wired (the latch decides in Components; the cast-arm handoff exists).
  it('the imbue latch is wired in Components (decideImbue + armImbueCast)', () => {
    const c = read('Components.jsx');
    expect(c).toMatch(/decideImbue\(/);
    expect(c).toMatch(/armImbueCast\(/);
  });
});
