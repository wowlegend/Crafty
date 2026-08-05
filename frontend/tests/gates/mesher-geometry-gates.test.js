import { describe, it, expect } from 'vitest';
import { generateMesh } from '../../src/world/mesher.js';

// The FIRST behavioural gate on the greedy mesher. Until `generateMesh` was extracted from
// terrain.worker.js it could not be imported at all (the worker assigns `self.onmessage` at module scope
// and vitest runs `environment: 'node'`), so every claim about its geometry — quad counts, winding, UV
// mapping, AO — rested on reading the source. Four queued render items depend on measuring exactly those.
//
// These are CHARACTERIZATION assertions: they encode what the mesher does today, so that a change to it
// has to be deliberate. That is only worth anything because each one is mutation-proven — an assertion
// that cannot go red is a decoration. The mutation log is in the commit trailer.

const CHUNK = 16;
const HEIGHT = 256;
const idx = (x, y, z) => x + CHUNK * (z + CHUNK * y);

/** A flat slab of `block` from y=0 up to (not including) `top`. */
function slab(top, block = 1) {
  const b = new Uint8Array(CHUNK * CHUNK * HEIGHT);
  for (let y = 0; y < top; y++) for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) b[idx(x, y, z)] = block;
  return b;
}

describe('greedy mesher — geometry contract', () => {
  it('an empty chunk emits nothing at all (the denominator for every count below)', () => {
    const m = generateMesh(0, 0, new Uint8Array(CHUNK * CHUNK * HEIGHT));
    expect(m.positions.length).toBe(0);
    expect(m.indices.length).toBe(0);
  });

  it('a single flat slab merges each face plane into ONE quad — that IS the greedy property', () => {
    const m = generateMesh(0, 0, slab(1));
    // 16x16 top + 16x16 bottom + four 16x1 sides, each fully merged = 6 quads = 24 verts, 36 indices.
    expect(m.positions.length / 3).toBe(24);
    expect(m.indices.length).toBe(36);
    // If merging regressed to per-voxel faces this would be 256 top + 256 bottom + 64 side = 576 quads.
    // The assertion above is the one that would catch it, so state the alternative explicitly.
    expect(m.positions.length / 3).toBeLessThan(576 * 4);
  });

  it('emits 4 unindexed verts + 2 triangles per quad, and every attribute agrees on the vertex count', () => {
    const m = generateMesh(0, 0, slab(3));
    const verts = m.positions.length / 3;
    expect(verts % 4).toBe(0);
    expect(m.indices.length).toBe((verts / 4) * 6);
    expect(m.normals.length).toBe(verts * 3);
    expect(m.colors.length).toBe(verts * 3);
    expect(m.uvs.length).toBe(verts * 2);
    expect(m.ao.length).toBe(verts);
  });

  it('EVERY triangle winds counter-clockwise as seen from outside its own face', () => {
    // Terrain.jsx renders FrontSide. A clockwise face is culled — invisible terrain, the exact defect
    // recorded in .claude/rules/r3f-pointer-lock-voxel-meshing.md. This is the gate that catches a
    // regression in any of the six coordinate permutations, which source-reading has never reliably done.
    const m = generateMesh(0, 0, slab(4));
    const P = m.positions, N = m.normals, I = m.indices;
    let checked = 0;
    const bad = [];
    for (let t = 0; t < I.length; t += 3) {
      const [a, b, c] = [I[t], I[t + 1], I[t + 2]];
      const ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const bx = P[b * 3], by = P[b * 3 + 1], bz = P[b * 3 + 2];
      const cx = P[c * 3], cy = P[c * 3 + 1], cz = P[c * 3 + 2];
      // (b-a) x (c-a)
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      // must point the same way as the face normal the mesher declared
      const dot = nx * N[a * 3] + ny * N[a * 3 + 1] + nz * N[a * 3 + 2];
      checked++;
      if (!(dot > 0)) bad.push({ tri: t / 3, dot });
    }
    // Guard the DENOMINATOR: a loop that enumerated nothing reports a clean pass.
    expect(checked).toBe(I.length / 3);
    expect(checked).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it('never emits a face against a water block (Ocean.jsx owns the water surface)', () => {
    // Behavioural replacement for the source-grep that used to assert this by regex. Block id 9 = water.
    const b = slab(2);
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) b[idx(x, 2, z)] = 9;
    const withWater = generateMesh(0, 0, b);
    const withAir = generateMesh(0, 0, slab(2));
    // Putting water on top of the slab must not add geometry for the water itself.
    expect(withWater.positions.length).toBe(withAir.positions.length);
  });

  it('UV distance equals WORLD distance on every quad edge — the texture tiles 1:1 per block', () => {
    // A greedy quad covers w x h blocks, so its UV rect must be w x h in the SAME orientation, or the
    // texture stretches by w/h. The mesher emitted one rectangle for all six face directions while only
    // +Y has its c0->c1 edge spanning `h` — the other five span `w`, so u took the h-edge and v took the
    // w-edge. Invisible on a square merge (w === h) and increasingly wrong as a merge gets longer, which
    // is why reading the code never settled it: the constant looks symmetric.
    //
    // TWO fixtures, because one is not enough and finding that out is the point. A full 16x16 slab
    // exercises the four side faces (16 wide x 1 tall — maximally asymmetric) but its top and bottom
    // merge to 16x16, and on a SQUARE merge a transposed UV rect is identical to a correct one. The
    // half-footprint slab makes the top/bottom merge 8x16 so -Y is covered too. With only the first
    // fixture this gate caught 4 of the 5 broken directions and looked complete.
    const full = generateMesh(0, 0, slab(1));
    const half = (() => {
      const b = new Uint8Array(CHUNK * CHUNK * HEIGHT);
      for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK / 2; x++) b[idx(x, 0, z)] = 1;
      return generateMesh(0, 0, b);
    })();
    const P = new Float32Array([...full.positions, ...half.positions]);
    const U = new Float32Array([...full.uvs, ...half.uvs]);
    const quads = P.length / 12;
    const len3 = (i, j) => Math.hypot(P[j * 3] - P[i * 3], P[j * 3 + 1] - P[i * 3 + 1], P[j * 3 + 2] - P[i * 3 + 2]);
    const len2 = (i, j) => Math.hypot(U[j * 2] - U[i * 2], U[j * 2 + 1] - U[i * 2 + 1]);
    const bad = [];
    let checked = 0;
    for (let q = 0; q < quads; q++) {
      const [c0, c1, c3] = [q * 4, q * 4 + 1, q * 4 + 3];
      const wa = len3(c0, c1), ua = len2(c0, c1); // first edge
      const wb = len3(c0, c3), ub = len2(c0, c3); // second edge
      checked++;
      if (Math.abs(wa - ua) > 1e-6 || Math.abs(wb - ub) > 1e-6) {
        bad.push({ quad: q, world: [wa, wb], uv: [ua, ub] });
      }
    }
    // Denominator: a fixture that merged to nothing would report a clean pass.
    expect(checked).toBe(quads);
    expect(quads).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it('is deterministic — the same input yields byte-identical output', () => {
    // Capture-determinism is load-bearing for the visual gate; a mesher that varies run to run would
    // make every baseline flaky in a way that reads as a rendering bug.
    const a = generateMesh(3, -2, slab(5));
    const b = generateMesh(3, -2, slab(5));
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.ao)).toEqual(Array.from(b.ao));
  });
});
