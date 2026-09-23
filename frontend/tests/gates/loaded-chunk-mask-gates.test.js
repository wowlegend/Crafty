import { describe, it, expect, beforeEach } from 'vitest';
import {
  LOADED_MASK_SIZE, buildLoadedMask, loadedMaskGlsl,
  markChunkLoaded, markChunkUnloaded, loadedChunkSet, loadedChunksVersion, chunkOf,
} from '../../src/world/loadedChunks.js';
import { FAR_OUTER } from '../../src/world/farField.js';
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
 *   K7 Terrain: mount stops registering the chunk (structural)  K9 (retired with clearLoadedChunks, R4.3)
 *   (review #4:) K14 the streamer indexes chunks with its own Math.floor again
 *   (review #5:) K15 the save's block replay divides by a typed 16 again
 *   (review #3:) K10 the mask back to 32 texels   K11 registration back in a passive useEffect   K12 the early clear
 *   restored   K13 plausible-wrong: chunkOf rounds instead of floors
 *   (K8, an `indexOf('_', 1)` start offset in the key parse, SURVIVED as an equivalent mutant — '-' is never
 *   '_' — so the dead offset was deleted rather than tested.)
 *
 * BLIND SPOT: the texture model encodes three's DataTexture convention (flipY false, NearestFilter, row j at
 * v = (j + 0.5) / size) — verified in node_modules/three/src/textures/DataTexture.js, not by a GPU. Whether the
 * ring really vanishes over loaded ground is judged from the capture A/B.
 */
const S = LOADED_MASK_SIZE;

// Run the generated snippet in JS. It is a flat list of `float a = expr;` plus one `if (...) discard;`, over
// vWorldPos.x/.z, uMaskOrigin.x/.y, floor and one texture() read — the generator emits only that on purpose.
function runMask(src, x, z, mask) {
  const tex = (u, v) => {
    const i = Math.floor(u * mask.size), j = Math.floor(v * mask.size);
    return { r: mask.data[j * mask.size + i] / 255 };
  };
  const js = src
    .replace(/\bfloat\s+/g, 'let ')
    .replace(/\bfloor\(/g, 'Math.floor(')
    .replace(/vWorldPos\.x/g, 'X').replace(/vWorldPos\.z/g, 'Z')
    .replace(/uMaskOrigin\.x/g, 'OX').replace(/uMaskOrigin\.y/g, 'OZ')
    .replace(/texture\(uLoadedMask, vec2\(([^;]*?)\)\)\.r/g, 'TEX($1).r')
    .replace(/\bdiscard;/g, 'return true;');
  return new Function('X', 'Z', 'OX', 'OZ', 'TEX', `${js}; return false;`)(x, z, mask.originX, mask.originZ, tex);
}

describe('buildLoadedMask — which texel is which chunk', () => {
  it('centres on the given chunk and marks exactly the keys inside it', () => {
    const keys = new Set(['-3_5', '0_0', '2_-7', '40_0', '-40_0']); // the last two fall outside the mask at 0,0
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
    for (const name of ['vWorldPos', 'uMaskOrigin', 'uLoadedMask']) expect(G).toContain(name);
    expect(G, 'a backtick would end the shader template literal it is spliced into').not.toContain('`');
  });
});

describe('the registry — Terrain\'s mounted set, versioned so the far field rebuilds only on a change', () => {
  beforeEach(() => { for (const k of [...loadedChunkSet()]) markChunkUnloaded(k); });

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

  it('the mask reaches past the whole far-field ring (review #3, R4.3: at 32 texels a far chunk left after a teleport sat outside it)', () => {
    expect((LOADED_MASK_SIZE / 2) * 16, 'a mounted chunk inside the ring can fall outside the mask').toBeGreaterThanOrEqual(FAR_OUTER + 16);
  });

  it('chunkOf is the chunk a coordinate falls in — the one definition both sides of the mask use (R4.9)', () => {
    expect([chunkOf(0), chunkOf(15.99), chunkOf(16), chunkOf(-0.01), chunkOf(-16), chunkOf(-16.01)]).toEqual([0, 0, 1, -1, -1, -2]);
  });
});

describe('wired: Terrain feeds it, the far field reads it (weak, structural)', () => {
  it('Terrain registers mounts and unmounts, clears it on a save load, and hands it out as getGeneratedChunks', () => {
    expect(carriersOf(/markChunkLoaded\(key\);/)).toEqual(['world/Terrain.jsx']);
    expect(carriersOf(/markChunkUnloaded\(key\);/)).toEqual(['world/Terrain.jsx']);
    // In a LAYOUT effect, so the registry changes at the commit that draws or removes the chunk, not after paint
    // (review #3, R4.3); and no early clear — each unmount unregisters itself.
    expect(carriersOf(/React\.useLayoutEffect\(\(\) => \{\s*if \(empty\) return undefined;/)).toEqual(['world/Terrain.jsx']);
    expect(carriersOf(/clearLoadedChunks/), 'an early clear is back (it ran before the unmount commit)').toEqual([]);
    expect(carriersOf(/setGetGeneratedChunks\(loadedChunkSet\)/)).toEqual(['world/Terrain.jsx']);
    expect(carriersOf(/chunksRef/), 'a second, private copy of the loaded set is back').toEqual([]);
  });

  it('the far field splices the generated lookup and rebuilds the mask from the registry', () => {
    expect(carriersOf(/\$\{LOADED_MASK_GLSL\}/)).toEqual(['world/FarField.jsx']);
    expect(carriersOf(/buildLoadedMask\(loadedChunkSet\(\),/)).toEqual(['world/FarField.jsx']);
    expect(carriersOf(/const pcx = chunkOf\(p\.x\), pcz = chunkOf\(p\.z\);/)).toEqual(['world/FarField.jsx']);
    expect(carriersOf(/Math\.floor\(p\.[xz] \/ 16\)/), 'a literal chunk size is back on the JS side').toEqual([]);
    // ...and the streamer and the block edits index chunks the same way (review #4, R5.8).
    // (chunkOf moved to world/chunkLayout.js with the rest of the layout — R7.2; loadedChunks re-exports it.)
    expect(carriersOf(/Math\.floor\([^)]*\/ CHUNK_SIZE\)/), 'a second chunk-index definition is back').toEqual(['world/chunkLayout.js']);
    expect(carriersOf(/const playerCx = chunkOf\(camera\.position\.x\);/)).toEqual(['world/Terrain.jsx']);
    // ...and no literal chunk size anywhere (review #5, R6.7: boss voxel destruction, the save's block replay and
    // the Blight-Heart chunk each divided by a typed 16). The one /16 left is a music arpeggio step, not a chunk.
    expect(carriersOf(/Math\.floor\([^)]*\/\s*16\)/), 'a literal /16 chunk index is back').toEqual(['SoundManager.jsx']);
  });
});
