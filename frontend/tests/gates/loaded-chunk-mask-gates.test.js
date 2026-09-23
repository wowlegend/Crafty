import { describe, it, expect, beforeEach } from 'vitest';
import {
  LOADED_MASK_SIZE, buildLoadedMask, loadedMaskGlsl,
  markChunkLoaded, markChunkUnloaded, clearLoadedChunks, loadedChunkSet, loadedChunksVersion,
} from '../../src/world/loadedChunks.js';
import { carriersOf } from './_srcWalk.js';

/**
 * THE FAR FIELD STEPS ASIDE FOR REAL TERRAIN — a mask of loaded chunks the ring's fragment shader discards over
 * (QUEUE R3.9; plan 2026-09-22-crafty-far-horizon Task 3). No fixed sink could be right: the ring must vanish
 * exactly where a chunk IS loaded, and that set changes as the player walks and as the square streams in.
 *
 * The seam this guards is where the JS mask meets the GLSL lookup: a mask built in one convention and read in
 * another hides the far field over the WRONG chunks, which is a hole in the world on one side and a floating
 * impostor on the other. So the generated GLSL is INTERPRETED against a nearest-sampling model of the texture
 * and must discard exactly over the loaded set — on an asymmetric set, so a swapped axis cannot pass.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   K1 plausible-wrong: the mask origin off by one chunk      K2 plausible-wrong: u and v swapped in the lookup
 *   K3 plausible-wrong: floor -> round in the chunk index      K4 out-of-range keys wrap instead of being dropped
 *   K5 the registry bumps its version on a no-op              K6 FarField: the discard not spliced (structural)
 *   K7 Terrain: mount stops registering the chunk (structural)  K9 clearing the set does not bump the version
 *   (K8, an `indexOf('_', 1)` start offset in the key parse, SURVIVED as an equivalent mutant — '-' is never
 *   '_' — so the dead offset was deleted rather than tested.)
 *
 * BLIND SPOT: the texture model encodes three's DataTexture convention (flipY false, NearestFilter, row j at
 * v = (j + 0.5) / size) — verified in node_modules/three/src/textures/DataTexture.js, not by a GPU. Whether the
 * ring really vanishes over loaded ground is judged from the capture A/B.
 */
const S = LOADED_MASK_SIZE;

// Run the generated snippet in JS. It is a flat list of `float a = expr;` plus one `if (...) discard;`, over
// vFarXZ.x/.y, uMaskOrigin.x/.y, floor and one texture() read — the generator emits only that on purpose.
function runMask(src, x, z, mask) {
  const tex = (u, v) => {
    const i = Math.floor(u * mask.size), j = Math.floor(v * mask.size);
    return { r: mask.data[j * mask.size + i] / 255 };
  };
  const js = src
    .replace(/\bfloat\s+/g, 'let ')
    .replace(/\bfloor\(/g, 'Math.floor(')
    .replace(/vFarXZ\.x/g, 'X').replace(/vFarXZ\.y/g, 'Z')
    .replace(/uMaskOrigin\.x/g, 'OX').replace(/uMaskOrigin\.y/g, 'OZ')
    .replace(/texture\(uLoadedMask, vec2\(([^;]*?)\)\)\.r/g, 'TEX($1).r')
    .replace(/\bdiscard;/g, 'return true;');
  return new Function('X', 'Z', 'OX', 'OZ', 'TEX', `${js}; return false;`)(x, z, mask.originX, mask.originZ, tex);
}

describe('buildLoadedMask — which texel is which chunk', () => {
  it('centres on the given chunk and marks exactly the keys inside it', () => {
    const keys = new Set(['-3_5', '0_0', '2_-7', '40_0', '-17_0']); // the last two fall outside a 32 mask at 0,0
    const m = buildLoadedMask(keys, 0, 0);
    expect([m.originX, m.originZ, m.size]).toEqual([-S / 2, -S / 2, S]);
    const at = (cx, cz) => m.data[(cz - m.originZ) * S + (cx - m.originX)];
    expect(at(-3, 5)).toBe(255);
    expect(at(0, 0)).toBe(255);
    expect(at(2, -7)).toBe(255);
    expect(at(5, -3), 'the transpose of a loaded chunk is marked — the axes are swapped').toBe(0);
    let marked = 0;
    for (const v of m.data) if (v) marked++;
    expect(marked, 'a key outside the mask was folded back in, or one inside was dropped').toBe(3);
  });

  it('reuses the caller\'s buffer and clears what was marked before', () => {
    const out = new Uint8Array(S * S);
    buildLoadedMask(new Set(['1_1']), 0, 0, S, out);
    const m = buildLoadedMask(new Set(['4_4']), 10, 10, S, out);
    expect(m.data).toBe(out);
    let marked = 0;
    for (const v of out) if (v) marked++;
    expect(marked).toBe(1);
  });
});

describe('the GLSL lookup reads the mask in the SAME convention it was built in', () => {
  const G = loadedMaskGlsl();

  it('discards exactly over loaded chunks, swept across chunk edges and negative coordinates', () => {
    // Asymmetric on purpose: an L of chunks plus one outlier, none mirrored across the diagonal.
    const keys = new Set(['0_0', '1_0', '2_0', '0_1', '-4_3', '6_-2']);
    for (const [ccx, ccz] of [[0, 0], [3, -1], [-9, 12]]) {
      const m = buildLoadedMask(keys, ccx, ccz);
      let checked = 0, hits = 0;
      for (let x = -80; x <= 120; x += 3.7) {
        for (let z = -60; z <= 60; z += 2.9) {
          const want = keys.has(`${Math.floor(x / 16)}_${Math.floor(z / 16)}`)
            && Math.floor(x / 16) - m.originX >= 0 && Math.floor(x / 16) - m.originX < S
            && Math.floor(z / 16) - m.originZ >= 0 && Math.floor(z / 16) - m.originZ < S;
          expect(runMask(G, x, z, m), `(${x.toFixed(1)}, ${z.toFixed(1)}) centred ${ccx},${ccz}`).toBe(want);
          checked++;
          if (want) hits++;
        }
      }
      expect(checked).toBeGreaterThan(2000);
      expect(hits, 'no sample landed on a loaded chunk — the discard was never exercised').toBeGreaterThan(20);
    }
  });

  it('a chunk\'s own edges: x = 16 is chunk 1, x = 16 - 1e-3 is chunk 0', () => {
    const m = buildLoadedMask(new Set(['1_0']), 0, 0);
    expect(runMask(G, 16, 8, m)).toBe(true);
    expect(runMask(G, 16 - 1e-3, 8, m)).toBe(false);
    expect(runMask(G, 31.999, 15.999, m)).toBe(true);
    expect(runMask(G, 32, 8, m)).toBe(false);
  });

  it('declares nothing but what the far-field material provides', () => {
    for (const name of ['vFarXZ', 'uMaskOrigin', 'uLoadedMask']) expect(G).toContain(name);
    expect(G, 'a backtick would end the shader template literal it is spliced into').not.toContain('`');
  });
});

describe('the registry — Terrain\'s mounted set, versioned so the far field rebuilds only on a change', () => {
  beforeEach(() => clearLoadedChunks());

  it('a real change bumps the version; a repeat does not', () => {
    const v0 = loadedChunksVersion();
    markChunkLoaded('3_4');
    const v1 = loadedChunksVersion();
    expect(v1).toBeGreaterThan(v0);
    markChunkLoaded('3_4');
    expect(loadedChunksVersion(), 'a no-op re-mark bumped the version (a rebuild every frame)').toBe(v1);
    markChunkUnloaded('9_9');
    expect(loadedChunksVersion()).toBe(v1);
    markChunkUnloaded('3_4');
    expect(loadedChunksVersion()).toBeGreaterThan(v1);
    expect(loadedChunkSet().size).toBe(0);
  });

  it('clearing a non-empty set bumps the version (a save load wipes the world)', () => {
    markChunkLoaded('1_1');
    const v = loadedChunksVersion();
    clearLoadedChunks();
    expect(loadedChunkSet().size).toBe(0);
    expect(loadedChunksVersion()).toBeGreaterThan(v);
  });
});

describe('wired: Terrain feeds it, the far field reads it (weak, structural)', () => {
  it('Terrain registers mounts and unmounts, clears it on a save load, and hands it out as getGeneratedChunks', () => {
    expect(carriersOf(/markChunkLoaded\(key\);/)).toEqual(['world/Terrain.jsx']);
    expect(carriersOf(/markChunkUnloaded\(key\);/)).toEqual(['world/Terrain.jsx']);
    expect(carriersOf(/clearLoadedChunks\(\);/)).toEqual(['world/Terrain.jsx']);
    expect(carriersOf(/setGetGeneratedChunks\(loadedChunkSet\)/)).toEqual(['world/Terrain.jsx']);
    expect(carriersOf(/chunksRef/), 'a second, private copy of the loaded set is back').toEqual([]);
  });

  it('the far field splices the generated lookup and rebuilds the mask from the registry', () => {
    expect(carriersOf(/\$\{LOADED_MASK_GLSL\}/)).toEqual(['world/FarField.jsx']);
    expect(carriersOf(/buildLoadedMask\(loadedChunkSet\(\),/)).toEqual(['world/FarField.jsx']);
  });
});
