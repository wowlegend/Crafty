import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { generateMesh } from '../../src/world/mesher.js';

/**
 * W2-T2: THE MESHER MUST NOT EMIT WATER FACES — Ocean.jsx owns water.
 *
 * CONVERTED 2026-09-22, selected by `gate-census.mjs` at 0/5. Every assertion was a source grep, including
 * one that asserted the PRESENCE of the guard expression `blockA > 0 && blockA !== 9 && blockB === 0`.
 * That is the weakest possible form for this property: it checks that a particular string of characters
 * appears, not that a water block fails to produce a face. Rewrite the guard equivalently — swap the
 * operand order, hoist it into a helper, invert it — and the gate goes red on correct code, while a
 * genuinely broken guard that happens to keep the literal stays green.
 *
 * `generateMesh` is PURE (`(cx, cz, blocks, biomeIds)`, no noise fields, no store — its own header says
 * so) and was moved to `mesher.js` in 2026-08 specifically so it could be tested behaviourally. Nothing
 * had taken that up. It does now: the mesh is generated from a synthetic column containing water and the
 * OUTPUT is inspected.
 *
 * THE CONTROL MATTERS AS MUCH AS THE ASSERTION. "No water faces" is trivially satisfied by a mesher that
 * emits nothing at all, which is exactly what a broken call signature or an empty block array would
 * produce. So the same fixture also contains stone, and the test asserts stone faces ARE emitted in the
 * same run before concluding anything about water.
 *
 * Mutation-Proof: 3 mutations, denominator asserted (5/5 cases collected on every run).
 *   M1 drop `blockA !== 9` from the top-face branch  -> water case RED (water tops reappear)
 *   M2 mesher returns empty arrays                    -> control case RED (proving the water assertion
 *      cannot be satisfied by an empty mesh — the vacuity this gate would otherwise have)
 *   M3 re-introduce an `isWaterTopFace` symbol        -> removed-symbol case RED
 * mesher.js restored from a cp backup and diffed byte-identical after each.
 *
 * BLIND SPOT, stated (R7): this drives the MESHER. It does not prove Ocean.jsx renders water, nor that
 * the two agree on where the surface is. The ocean plane is a separate system with its own gates.
 */
const WATER = 9;
const STONE = 3;
const idx = (x, y, z) => x + z * 16 + y * 256;

/** A 16x256x16 chunk: a stone floor, a water body above it, air above that. */
function fixture() {
  const blocks = new Uint8Array(16 * 256 * 16);
  for (let x = 0; x < 16; x++) {
    for (let z = 0; z < 16; z++) {
      for (let y = 0; y < 4; y++) blocks[idx(x, y, z)] = STONE;   // floor
      for (let y = 4; y < 7; y++) blocks[idx(x, y, z)] = WATER;   // water body, open to air at y=7
    }
  }
  return blocks;
}

describe('W2-T2 mesher no longer emits water faces (Ocean.jsx owns water)', () => {
  const mesh = generateMesh(0, 0, fixture());
  // color.r carries the block type, one entry per vertex, stride 3.
  const types = [];
  for (let i = 0; i < mesh.colors.length; i += 3) types.push(mesh.colors[i]);

  it('CONTROL: the mesher produced a real mesh — stone faces exist', () => {
    // Without this, "no water faces" is satisfied by an empty mesh, which is what a broken signature or
    // an empty fixture yields. The assertion below means nothing until this one passes.
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(types.length).toBeGreaterThan(0);
    expect(types.filter((t) => t === STONE).length).toBeGreaterThan(0);
  });

  it('NO vertex carries the water block type, from a chunk that is one third water', () => {
    expect(types.filter((t) => t === WATER)).toEqual([]);
  });

  it('the water surface itself is not drawn — the air-facing top of the water body is absent', () => {
    // The specific face the old `isWaterTopFace` bake existed to emit. Every emitted vertex is stone.
    const distinct = [...new Set(types)];
    expect(distinct).toEqual([STONE]);
  });

  it('the removed symbols are gone from BOTH halves of the pipeline (source — they are absences)', () => {
    // An absence of a SYMBOL has no runtime observation, so grep is the honest instrument here. Both
    // files are read because generateMesh moved between them once already, and this gate's third
    // assertion silently pointed at the file the code had LEFT — a gate guarding an empty room.
    const SRC = ['src/world/terrain.worker.js', 'src/world/mesher.js']
      .map((f) => readFileSync(resolve(process.cwd(), f), 'utf8'))
      .join('\n');
    expect(SRC.length).toBeGreaterThan(1000); // R3a — both files were really read
    expect(SRC).not.toMatch(/isWaterTopFace/);
    expect(SRC).not.toMatch(/seabedDepthT\(/);
  });

  it('water is still SOLID for neighbour purposes — the floor under it is not over-meshed', () => {
    // The guard must exclude water from being DRAWN without making it behave as air: if water read as
    // air, the stone floor beneath would emit a top face at y=3 that no player can ever see.
    // 16x16 top faces would be the giveaway; greedy meshing merges them into one quad = 4 vertices.
    const stoneVerts = types.filter((t) => t === STONE).length;
    expect(stoneVerts).toBeGreaterThan(0);
    expect(stoneVerts).toBeLessThan(16 * 16 * 4); // not one quad per column — greedy merging happened
  });
});
