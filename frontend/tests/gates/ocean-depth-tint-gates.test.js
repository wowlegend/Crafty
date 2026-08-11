import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '../../src');
const read = (rel) => readFileSync(resolve(SRC, rel), 'utf8');

// W2-T2: the voxel-water render path is RETIRED. The Ocean.jsx Gerstner plane owns the animated
// water surface now, and the mesher emits no blockType-9 faces (color.g/color.b are hardwired to 0),
// so the old in-mesher water depth-tint / shore-foam / bioluminescence shader path in Terrain.jsx is
// dead and was removed. This gate guards against its REINTRODUCTION (a stale water path would be
// unreachable dead code at best, and a double-rendered surface at worst).
describe('Ocean voxel-water render path is retired (W2-T2)', () => {
  const t = read('world/Terrain.jsx');
  it('the per-vertex foam/depth varyings are gone (the mesher no longer bakes them)', () => {
    expect(t).not.toMatch(/varying float vFoam;/);
    expect(t).not.toMatch(/varying float vDepthB;/);
  });
  it('the M5a water depth-tint block is gone', () => {
    expect(t).not.toMatch(/M5a depth-tint/);
    expect(t).not.toMatch(/isWaterPixel/);
  });
  it('the water bioluminescence + Fresnel sheen + shore-foam ring is gone', () => {
    expect(t).not.toMatch(/bioluminescence/);
    expect(t).not.toMatch(/shore foam/i);
  });
  it('Ocean.jsx is the surviving water surface owner', () => {
    const ocean = read('render/Ocean.jsx');
    // Re-anchored 2026-08-08: this asserted /gerstnerHeight/, which the real-Gerstner rewrite left
    // present only in a COMMENT once the surface moved to gerstnerDisplace -- gate-shape caught that the
    // assertion had gone vacuous, which is the whole reason that checker exists. Anchored to the IMPORT
    // SPECIFIER and the CALL, so deleting the code cannot leave it green.
    // Re-anchored again 2026-08-11: the per-vertex loop moved to the ALLOCATION-FREE variants, because
    // the object-returning pair allocated a literal and an array per vertex per frame -- ~18,800
    // short-lived allocations at display refresh, in the one loop that must not stutter. The gate follows
    // the surface to where it is computed rather than pinning the older spelling.
    expect(ocean).toMatch(/import \{[^}]*\bgerstnerDisplaceInto\b[^}]*\} from '\.\.\/world\/oceanProfile\.js'/);
    expect(ocean).toMatch(/gerstnerDisplaceInto\(_d, wx, wz, t\)/);
    expect(ocean).toMatch(/gerstnerNormalInto\(_n, wx, wz, t\)/);
    // And the loop must not go back to allocating: no `new THREE.Vector3` and no object literal returned
    // per vertex inside the frame callback.
    expect(/const d = gerstner/.test(ocean), 'the per-vertex loop allocates again').toBe(false);
  });
});
