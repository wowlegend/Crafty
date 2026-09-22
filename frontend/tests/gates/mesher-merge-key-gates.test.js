import { describe, it, expect } from 'vitest';
import { generateMesh } from '../../src/world/mesher.js';
import { cornerAO } from '../../src/world/vertexAO.js';
import { realChunk, CHUNK, HEIGHT, idx } from './_terrainFixture.js';

/**
 * THE GREEDY-MERGE KEY MUST CARRY EVERYTHING A FACE'S LOOK DEPENDS ON.
 *
 * Until 2026-09-22 the mesher merged faces on block type + direction only. Two things that change how a
 * face LOOKS were therefore smeared across every merge:
 *   - AO. A floor strip merged many cells deep beside a wall got a wall-side and an open-side AO value,
 *     interpolated across the whole strip — a one-block crease rendered as a many-block gradient.
 *     (EXTERNAL-BASELINE.md #1; the 0fps article's own prescription.)
 *   - biome. One merged quad spanning a biome border took ONE tint, read off corner c0, which lies outside
 *     the quad for four of six directions (QUEUE R1.1, HIGH).
 *
 * WHY THESE ASSERTIONS AND NOT "the key contains X". Each one measures what the GPU will actually draw,
 * against a truth computed here from the voxels — independently of the mesher's own AO/biome code:
 *   1. AO EXACTNESS: at every top-face cell corner, the AO the rasteriser would interpolate from the
 *      emitted triangles equals cornerAO() of that corner's own three occluders.
 *   2. DIAGONAL: every quad is split along its brighter diagonal (0fps anisotropy rule), and flipped quads
 *      still wind CCW-from-outside (Terrain.jsx renders FrontSide — a CW triangle is invisible).
 *   3. BIOME FOOTPRINT: every unit cell under every quad, on all six directions, belongs to a column whose
 *      biome is the quad's tint channel.
 *   4. BUDGET: exact keys cost quads; a ceiling stops an accidental per-cell key from exploding them.
 *
 * Fixtures are the terrain's own height and biome functions (`_terrainFixture.js`), 10 chunks, 6 of them
 * with a biome border — plus one hand-built crease where the right answer can be read off by eye.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh against src/world/mesher.js, each observed RED:
 *   M1 drop AO from the key (`(aoKey << 10)` -> 0)                         -> AO exactness RED (both fixtures)
 *   M2 drop biome from the key (`(biome << 18)` -> 0)                     -> biome footprint RED
 *   M3 plausible-wrong: biome from the WRONG side of a side face (q+1 <-> q) -> biome footprint RED
 *   M4 never flip (`flipDiagonal = false`)                                -> diagonal RED
 *   M5 plausible-wrong: flip on the INVERTED comparison (`<` -> `>`)       -> diagonal RED
 *   M6 plausible-wrong: flipped split with CW order (0,3,1 / 1,3,2)        -> winding RED
 *   M7 per-cell key (add `cu` into the key) -> budget RED
 *
 * BLIND SPOTS, named: (a) AO exactness is checked on TOP faces only — side and bottom faces share the
 * key and the occluder helper but are not sampled here; (b) chunk-boundary AO reads the neighbour as air
 * (getBlock returns 0 outside the chunk), which this suite mirrors rather than questions; (c) nothing here
 * proves Terrain.jsx reads colors.g as the biome — that seam is the shader's (QUEUE R1.6).
 */

const SEEDS = [[0, 0], [1, 0], [0, 1], [-1, -1], [5, 3], [-7, 2], [12, -9], [20, 20], [-30, 4], [3, -25]];
const REAL = SEEDS.map(([cx, cz]) => {
  const c = realChunk(cx, cz);
  return { cx, cz, ...c, mesh: generateMesh(cx, cz, c.blocks, c.biomeIds) };
});

const solidIn = (blocks) => (x, y, z) => {
  if (x < 0 || x >= CHUNK || z < 0 || z >= CHUNK || y < 0 || y >= HEIGHT) return 0;
  const b = blocks[idx(x, y, z)];
  return b > 0 && b !== 9 ? 1 : 0;
};

/** Every quad as { k, pos[4][3], n[3], ao[4], biome, tris } — the mesher emits 4 verts + 6 indices per quad. */
function quads(m) {
  const out = [];
  const nq = m.positions.length / 12;
  for (let k = 0; k < nq; k++) {
    const pos = [0, 1, 2, 3].map((i) => [m.positions[(4 * k + i) * 3], m.positions[(4 * k + i) * 3 + 1], m.positions[(4 * k + i) * 3 + 2]]);
    const n = [m.normals[4 * k * 3], m.normals[4 * k * 3 + 1], m.normals[4 * k * 3 + 2]];
    const ao = [0, 1, 2, 3].map((i) => m.ao[4 * k + i]);
    const biomes = [0, 1, 2, 3].map((i) => m.colors[(4 * k + i) * 3 + 1]);
    const tris = [Array.from(m.indices.slice(6 * k, 6 * k + 3)), Array.from(m.indices.slice(6 * k + 3, 6 * k + 6))];
    out.push({ k, pos, n, ao, biome: biomes[0], biomes, tris });
  }
  return out;
}

/** AO the rasteriser would produce at (px, pz) on the +Y plane y = Y: linear within each emitted triangle. */
function interpolatedTopAO(m, Y, px, pz) {
  const vals = [];
  const P = m.positions, I = m.indices;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t], b = I[t + 1], c = I[t + 2];
    if (m.normals[a * 3 + 1] !== 1 || P[a * 3 + 1] !== Y) continue;
    const ax = P[a * 3], az = P[a * 3 + 2], bx = P[b * 3], bz = P[b * 3 + 2], cx = P[c * 3], cz = P[c * 3 + 2];
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (det === 0) continue;
    const l1 = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / det;
    const l2 = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / det;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    vals.push(l1 * m.ao[a] + l2 * m.ao[b] + l3 * m.ao[c]);
  }
  return vals;
}

/** Compare interpolated AO against the voxel truth at every corner of every top-face cell. */
function topAOMismatches(blocks, m) {
  const solid = solidIn(blocks);
  let checked = 0, occludedChecked = 0;
  const bad = [];
  for (let y = 0; y < HEIGHT - 1; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) {
        if (!solid(x, y, z) || blocks[idx(x, y + 1, z)] !== 0) continue; // a top face at plane y+1
        const Y = y + 1;
        for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const truth = cornerAO(solid(x + dx, Y, z), solid(x, Y, z + dz), solid(x + dx, Y, z + dz));
          // a point just inside THIS cell, next to the corner — covered only by the quad that covers the cell
          const px = x + (dx < 0 ? 0.01 : 0.99), pz = z + (dz < 0 ? 0.01 : 0.99);
          const got = interpolatedTopAO(m, Y, px, pz);
          checked++;
          if (truth < 3) occludedChecked++;
          if (got.length === 0 || got.some((g) => Math.abs(g - truth) > 0.1)) bad.push({ x, Y, z, corner: [dx, dz], truth, got });
        }
      }
    }
  }
  return { checked, occludedChecked, bad };
}

describe('merge key: AO is exact, not smeared across merges', () => {
  it('the crease: a floor beside a 1-high wall darkens ONLY the row touching the wall', () => {
    const blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) blocks[idx(x, 0, z)] = 3;
    for (let x = 0; x < CHUNK; x++) blocks[idx(x, 1, 0)] = 3; // the wall, along z = 0
    const m = generateMesh(0, 0, blocks);
    // Read off by eye: a cell centre deep in the open floor is fully lit; the wall-side corner is not.
    expect(interpolatedTopAO(m, 1, 8.5, 8.5)).toEqual([3]);
    expect(Math.max(...interpolatedTopAO(m, 1, 8.5, 1.01))).toBeLessThan(3);
    const r = topAOMismatches(blocks, m);
    expect(r.checked).toBeGreaterThan(900); // 15x16 open cells + 16 wall tops, 4 corners each
    expect(r.occludedChecked).toBeGreaterThan(0); // the crease itself was sampled, not just open floor
    expect(r.bad).toEqual([]);
  });

  it('real terrain: every top-face corner on 10 chunks renders its own AO', () => {
    let checked = 0, occluded = 0;
    const bad = [];
    for (const c of REAL) {
      const r = topAOMismatches(c.blocks, c.mesh);
      checked += r.checked; occluded += r.occludedChecked;
      if (r.bad.length) bad.push({ chunk: [c.cx, c.cz], n: r.bad.length, first: r.bad[0] });
    }
    expect(checked).toBeGreaterThan(10 * 256 * 4 - 1); // every column has at least its surface top face
    expect(occluded).toBeGreaterThan(100); // terrain steps put real creases in the sample
    expect(bad).toEqual([]);
  });
});

describe('merge key: the 0fps diagonal', () => {
  it('every quad is split along its brighter diagonal, and both splits occur', () => {
    let flipped = 0, plain = 0;
    const bad = [];
    for (const c of REAL) {
      for (const q of quads(c.mesh)) {
        const [t1, t2] = q.tris;
        const shared = t1.filter((v) => t2.includes(v)).map((v) => v - 4 * q.k).sort();
        const other = [0, 1, 2, 3].filter((i) => !shared.includes(i));
        const onSplit = q.ao[shared[0]] + q.ao[shared[1]];
        const across = q.ao[other[0]] + q.ao[other[1]];
        if (shared.join() === '1,3') flipped++; else plain++;
        if (onSplit < across) bad.push({ chunk: [c.cx, c.cz], k: q.k, ao: q.ao, shared });
      }
    }
    expect(flipped).toBeGreaterThan(0); // the rule is reached, not vacuous
    expect(plain).toBeGreaterThan(0);
    expect(bad).toEqual([]);
  });

  it('flipped quads still wind counter-clockwise from outside', () => {
    let checked = 0, flippedChecked = 0;
    const bad = [];
    for (const c of REAL) {
      const P = c.mesh.positions, N = c.mesh.normals;
      for (const q of quads(c.mesh)) {
        const isFlipped = q.tris[0].filter((v) => q.tris[1].includes(v)).map((v) => v - 4 * q.k).sort().join() === '1,3';
        for (const [a, b, cc] of q.tris) {
          const u = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
          const v = [P[cc * 3] - P[a * 3], P[cc * 3 + 1] - P[a * 3 + 1], P[cc * 3 + 2] - P[a * 3 + 2]];
          const nrm = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
          const dot = nrm[0] * N[a * 3] + nrm[1] * N[a * 3 + 1] + nrm[2] * N[a * 3 + 2];
          checked++;
          if (isFlipped) flippedChecked++;
          if (!(dot > 0)) bad.push({ chunk: [c.cx, c.cz], k: q.k, isFlipped });
        }
      }
    }
    expect(flippedChecked).toBeGreaterThan(0);
    expect(checked).toBeGreaterThan(flippedChecked);
    expect(bad).toEqual([]);
  });
});

describe('merge key: biome follows the face, on all six directions', () => {
  function footprintMismatches(m, biomeIds) {
    let cells = 0;
    const tints = new Set();
    const bad = [];
    for (const q of quads(m)) {
      tints.add(q.biome);
      if (new Set(q.biomes).size !== 1) bad.push({ k: q.k, why: 'vertices disagree', biomes: q.biomes });
      const a = q.n.findIndex((x) => x !== 0); // the axis the face is perpendicular to
      const plane = q.pos[0][a];
      const voxelA = q.n[a] > 0 ? plane - 1 : plane; // the SOLID voxel sits behind the face
      const [b1, b2] = [0, 1, 2].filter((i) => i !== a);
      const lo1 = Math.min(...q.pos.map((p) => p[b1])), hi1 = Math.max(...q.pos.map((p) => p[b1]));
      const lo2 = Math.min(...q.pos.map((p) => p[b2])), hi2 = Math.max(...q.pos.map((p) => p[b2]));
      for (let i = lo1; i < hi1; i++) {
        for (let j = lo2; j < hi2; j++) {
          const v = [0, 0, 0];
          v[a] = voxelA; v[b1] = i; v[b2] = j;
          cells++;
          if (v[0] < 0 || v[0] > 15 || v[2] < 0 || v[2] > 15) { bad.push({ k: q.k, why: 'column outside chunk', v }); continue; }
          const want = biomeIds[v[2] * CHUNK + v[0]];
          if (want !== q.biome) bad.push({ k: q.k, why: 'wrong biome', cell: v, want, got: q.biome });
        }
      }
    }
    return { cells, tints, bad };
  }

  it('a hand-built border: no quad straddles it, and each side reads its own biome', () => {
    const blocks = new Uint8Array(CHUNK * CHUNK * HEIGHT);
    for (let y = 0; y < 3; y++) for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) blocks[idx(x, y, z)] = 1;
    const biomeIds = new Uint8Array(CHUNK * CHUNK);
    for (let z = 0; z < CHUNK; z++) for (let x = 0; x < CHUNK; x++) biomeIds[z * CHUNK + x] = x < 8 ? 2 : (z < 5 ? 4 : 6);
    const r = footprintMismatches(generateMesh(0, 0, blocks, biomeIds), biomeIds);
    expect(r.tints).toEqual(new Set([2, 4, 6]));
    expect(r.cells).toBeGreaterThan(256);
    expect(r.bad).toEqual([]);
  });

  it('real terrain: 10 chunks, every unit cell under every quad', () => {
    let cells = 0, bordered = 0;
    const bad = [];
    for (const c of REAL) {
      const r = footprintMismatches(c.mesh, c.biomeIds);
      cells += r.cells;
      if (r.tints.size > 1) bordered++;
      if (r.bad.length) bad.push({ chunk: [c.cx, c.cz], n: r.bad.length, first: r.bad[0] });
    }
    expect(bordered).toBeGreaterThanOrEqual(5); // borders were actually in the sample
    expect(cells).toBeGreaterThan(10 * 256);
    expect(bad).toEqual([]);
  });
});

describe('merge key: the cost ceiling', () => {
  it('quads over the 10-chunk fixture stay under the measured ceiling', () => {
    // Measured 2026-09-22: 1,339 quads with the type+dir key -> 2,356 with AO+biome (AO is +933 of it,
    // biome +84); mesh time 1.71 -> 1.89 ms/chunk. The rise is the price of exact AO and is accepted. The
    // ceiling (~+10%) exists to catch a key that accidentally becomes per-cell, which would multiply
    // this several-fold. An honest change that needs more quads should move this number and say why.
    const total = REAL.reduce((s, c) => s + c.mesh.indices.length / 6, 0);
    expect(total).toBeGreaterThan(1000);
    expect(total).toBeLessThanOrEqual(2600);
  });
});
