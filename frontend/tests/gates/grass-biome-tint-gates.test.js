import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SRC, strip } from './_srcWalk.js';
import { grassTops, columnTops, GRASS_CODE } from '../../src/world/grassField.js';
import { biomeTintTable, BIOME_ID, BIOME_NAMES, BIOME_TINT_STRENGTH, BIOME_TINT } from '../../src/world/biomeTable.js';
import { bladeTint } from '../../src/game/grassVariation.js';

/**
 * Q14 — the wind-grass blades take their biome hue from the SAME table as the ground beneath them.
 *
 * Before this, the ground had a per-vertex biome id feeding a shader uniform and the blades had no biome
 * input at all: a tuft in a savanna rendered the same green as one in a taiga while the block under it
 * did not. That disagreement reads as a lighting artefact rather than as a bug, which is why it survived.
 *
 * THIS GATE EXISTS BECAUSE OF THIS REPO'S OWN SCAR LIST. Two grass features have shipped compiling,
 * gated green and never running — `34f11b0` (mob grass-bending, driven by 81 chunks and working in
 * none) and `869f71e` (the mote layer rendered at the world origin instead of with its chunk). knip sees
 * the export used, a source grep sees the line exist, `build` sees it compile; none sees whether the
 * value ARRIVES. So the contract is driven end to end here: the producer emits the id, the composition
 * consumes it, and the two biomes actually come out different.
 *
 * BLIND SPOT, stated (R7), and it is the important half: nothing here renders. `OptimizedGrassSystem` is
 * an R3F component whose `useEffect` writes into an instancedMesh colour buffer, and no harness in this
 * repo drives that. What IS proven is that every value it needs exists and differs; what is NOT proven
 * is that the effect runs, that `instanceColor.needsUpdate` is set, or that the blades on screen change.
 * The last of those is a LOOK question and belongs to the visual capture gate, which nothing runs
 * automatically. The one structural assertion below (the four-element destructure) is the weak kind by
 * this repo's own standard and is marked as such — it is a tripwire for the always-miss, not a proof.
 *
 * Mutation-Proof: 4 mutations, recorded on the commit. Denominators asserted on both derived tables.
 */
describe('grass biome tint (Q14)', () => {
  it('the biome tables are non-empty and agree on their size', () => {
    const t = biomeTintTable();
    expect(BIOME_NAMES.length).toBeGreaterThan(1);
    expect(t.length, 'the tint table must carry one rgb triple per biome').toBe(BIOME_NAMES.length * 3);
    expect(Object.keys(BIOME_ID).length).toBe(BIOME_NAMES.length);
  });

  it('strength 0 is an EXACT no-op, so reverting is one number', () => {
    expect([...biomeTintTable(0)].every((v) => v === 1)).toBe(true);
    // ...and the shipped dial is NOT the no-op, or the whole feature is off and every other case here
    // would still pass. This is the control that catches "tinting is enabled" being false.
    expect(BIOME_TINT_STRENGTH).toBeGreaterThan(0);
    expect([...biomeTintTable()].some((v) => v !== 1)).toBe(true);
  });

  it('grassTops CARRIES the biome id as a fourth element — the producer half', () => {
    const size = 2;
    const topCodes = new Uint8Array([GRASS_CODE, 0, 0, GRASS_CODE]);
    const topYs = new Int16Array([5, 0, 0, 7]);
    const biomeIds = new Uint8Array([BIOME_ID.savanna ?? 2, 0, 0, BIOME_ID.taiga ?? 3]);
    const out = grassTops(topCodes, topYs, size, 0, 0, { stride: 1, cap: 9 }, biomeIds);
    expect(out.length, 'the fixture must produce two tufts or the assertions below are vacuous').toBe(2);
    expect(out.every((t) => t.length === 4), 'a three-element tuple silently tints nothing').toBe(true);
    expect(out[0][3]).toBe(BIOME_ID.savanna ?? 2);
    expect(out[1][3]).toBe(BIOME_ID.taiga ?? 3);
    // Emitted ALWAYS, defaulting to 0 — never a sometimes-three-element tuple.
    const noIds = grassTops(topCodes, topYs, size, 0, 0, { stride: 1, cap: 9 });
    expect(noIds.every((t) => t.length === 4 && t[3] === 0)).toBe(true);
  });

  it('columnTops finds the highest non-air block per column — the scan both worker paths share', () => {
    const SIZE = 2; const HEIGHT = 4;
    const index = (x, y, z) => x + z * SIZE + y * SIZE * SIZE;
    const blocks = new Uint8Array(SIZE * SIZE * HEIGHT);
    blocks[index(0, 1, 0)] = 7; blocks[index(0, 3, 0)] = GRASS_CODE; // a higher block must win
    blocks[index(1, 0, 1)] = 4;
    const { topCodes, topYs } = columnTops(blocks, index, SIZE, HEIGHT);
    expect(topCodes[0]).toBe(GRASS_CODE);
    expect(topYs[0], 'the scan returned a lower block than the top one').toBe(3);
    expect(topCodes[1 + 1 * SIZE]).toBe(4);
    expect(topCodes[1], 'an all-air column must stay 0').toBe(0);
  });

  it('two different biomes produce DIFFERENT blade tints at the same world position', () => {
    // The end-to-end property, and the one that would still be false if every wiring assertion passed:
    // same (x,z), same per-blade hash, different biome -> different colour.
    const t = biomeTintTable();
    const mul = (name) => {
      const i = BIOME_ID[name] * 3;
      return [t[i], t[i + 1], t[i + 2]];
    };
    const a = bladeTint(12, 34, mul('savanna'));
    const b = bladeTint(12, 34, mul('taiga'));
    expect([a.r, a.g, a.b], 'savanna and taiga blades render identically — the biome input is inert')
      .not.toEqual([b.r, b.g, b.b]);
    // and the composition stays a MULTIPLIER: omitting the biome must leave the blade unchanged.
    const plain = bladeTint(12, 34);
    expect(bladeTint(12, 34, [1, 1, 1])).toEqual(plain);
  });

  it('the grass system destructures the FOURTH element (weak, and labelled weak)', () => {
    // A source assertion, which this repo rates the weakest kind. It is here for one specific failure:
    // the consumer destructuring three names from a four-element tuple, which compiles, runs, and tints
    // nothing — the always-miss shape. Anchored to the destructure form so a comment cannot satisfy it.
    const src = strip(readFileSync(resolve(SRC, 'OptimizedGrassSystem.jsx'), 'utf8'));
    expect(src, 'the grass loop no longer destructures a biome id')
      .toMatch(/grassBlocks\.forEach\(\(\[\s*x,\s*y,\s*z,\s*biomeId\s*\]/);
    expect(src, 'the blade tint is no longer given a biome multiplier').toMatch(/bladeTint\(x,\s*z,\s*mul\)/);
    expect(src, 'the scratch multiplier is no longer filled from the biome row')
      .toMatch(/mul\[0\] = biomeTint\[b3\]; mul\[1\] = biomeTint\[b3 \+ 1\]; mul\[2\] = biomeTint\[b3 \+ 2\];/);
  });

  it('R1.10 — ground and blades read ONE table, and it is the pure derivation at the dial', () => {
    // Values: the shared table is exactly what biomeTintTable() derives at Kevin's strength.
    expect([...BIOME_TINT]).toEqual([...biomeTintTable(BIOME_TINT_STRENGTH)]);
    // Identity (weak, structural — neither consumer imports cleanly under node): both reference the shared
    // object and neither re-derives it. A re-derivation is how two copies drift.
    const grass = strip(readFileSync(resolve(SRC, 'OptimizedGrassSystem.jsx'), 'utf8'));
    const terrain = strip(readFileSync(resolve(SRC, 'world/Terrain.jsx'), 'utf8'));
    expect(grass).toMatch(/const biomeTint = BIOME_TINT;/);
    expect(terrain).toMatch(/const biomeTintUniform = BIOME_TINT;/);
    expect(grass + terrain, 'a consumer re-derives the table instead of sharing it').not.toMatch(/biomeTintTable\(/);
  });
});
