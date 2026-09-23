import { describe, it, expect } from 'vitest';
import {
  FAR_SINK, FAR_OUTER, FAR_RECENTRE, FAR_CANOPY, FAR_CANOPY_HEIGHT, FAR_WATER_LINEAR,
  farRadii, snapCentre, layerMeanLinear, farColumn, farFieldGeometry,
} from '../../src/world/farField.js';
import { createProceduralVoxelTextures } from '../../src/world/proceduralTextures.js';
import { BIOME_TINT, BIOME_ID } from '../../src/world/biomeTable.js';
import { BLOCK_ID } from '../../src/world/blockIds.js';
import { SEA_LEVEL } from '../../src/world/oceanProfile.js';
import { carriersOf } from './_srcWalk.js';

/**
 * THE FAR HORIZON — a sunk heightfield ring beyond the loaded chunks (spec 2026-09-22-crafty-far-horizon-design,
 * plan Task 1). Past ~72 m the world used to end in fog over sky colour.
 *
 * Driven with SYNTHETIC worlds (the column sampler is injected), so each property is known by construction:
 * a tilted plane, a patch of sea, a forest.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh against src/world/farField.js, each observed RED:
 *   M1 no sink                                   M2 water not sunk
 *   M3 the inner radius ignores the centre slack (a gap on one side)
 *   M3b plausible-wrong: canopy from the square's corner with no slack (pokes through loaded ground)
 *   M4 plausible-wrong: biome tint on stone      M5 water takes the seabed's colour
 *   M6 plausible-wrong: snap to the cell CORNER (doubles the offset)
 *   M7 canopy lift ignored                       M8 canopy lift everywhere, inside loaded ground too
 *   M9 plausible-wrong: tile means averaged in sRGB, not linear
 *   M10 GameScene: the far field unmounted                   -> mount RED (structural)
 *   M11 FarField: re-centred on the raw position, not the grid -> snap RED (structural)
 *   M12 Terrain: the haze typed back inline                  -> one-definition RED (structural)
 *
 * BLIND SPOT: nothing here renders. Whether the ring reads as land to the horizon, meets the ocean plane without
 * a seam, and stays out of sight under loaded terrain is judged from a same-renderer capture (plan Task 2).
 */
const MEANS = layerMeanLinear(createProceduralVoxelTextures());
const tintOf = (biome) => [0, 1, 2].map((k) => BIOME_TINT[BIOME_ID[biome] * 3 + k]);
const top = (s) => s.surfaceY + 1; // a block at y fills [y, y+1]: its top face is y + 1
const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-5);

// A tilted plain of grass: surface rises 1 block per 10 m of x.
const plain = (x) => ({ surfaceBlock: BLOCK_ID.grass, surfaceY: 40 + Math.floor(x / 10), isWater: false, biome: 'plains' });
const HIGH = farRadii(4);
const build = (sample, extra = {}) => farFieldGeometry({
  cx: 0, cz: 0, r0: HIGH.inner, r1: FAR_OUTER, canopyFrom: HIGH.canopyFrom, rings: 12, sectors: 48, sample, means: MEANS, ...extra,
});

describe('where the ring sits', () => {
  it('NO GAP and NO POKE, for every player position the snapped centre can serve', () => {
    // The loaded square always covers the disk of radius renderDistance*16 around the player, and never
    // reaches past (renderDistance+1)*16*sqrt2. From the ring's snapped centre: the ring's hole must sit
    // inside the first (else a band of nothing between real terrain and far field), and the canopy may only
    // start outside the second (else it pokes up through loaded ground). Swept over positions in a cell.
    for (const rd of [2, 3, 4]) {
      const { inner, canopyFrom } = farRadii(rd);
      let worst = 0;
      for (let x = 0; x < 32; x += 1.7) for (let z = 0; z < 32; z += 1.3) {
        const c = snapCentre(100 + x, -60 + z);
        const off = Math.hypot(c.x - (100 + x), c.z - (-60 + z));
        worst = Math.max(worst, off);
        expect(off + inner, `rd ${rd}: a gap between the loaded terrain and the ring`).toBeLessThanOrEqual(rd * 16 + 1e-9);
        expect((rd + 1) * 16 * Math.SQRT2 + off, `rd ${rd}: canopy can start over loaded ground`).toBeLessThanOrEqual(canopyFrom + 1e-9);
      }
      expect(worst, 'the sweep never approached the worst-case offset').toBeGreaterThan(20);
    }
  });

  it('the ring runs from the derived inner radius to the outer radius', () => {
    const { positions } = build(plain);
    const radii = [];
    for (let i = 0; i < positions.length; i += 3) radii.push(Math.hypot(positions[i], positions[i + 2]));
    expect(Math.min(...radii)).toBeCloseTo(HIGH.inner, 4);
    expect(Math.max(...radii)).toBeCloseTo(FAR_OUTER, 4);
  });

  it('every vertex wherever a chunk can be loaded is SUNK below its real surface', () => {
    // Out to canopyFrom a real chunk may be there, and it must win the depth test, or the impostor
    // z-fights with it or floats over it.
    const forest = (x) => ({ ...plain(x), biome: 'forest' });
    for (const sample of [plain, forest]) {
      const { positions } = build(sample);
      let checked = 0;
      for (let i = 0; i < positions.length; i += 3) {
        const [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]];
        if (Math.hypot(x, z) > HIGH.canopyFrom) continue;
        expect(y, `vertex at (${x.toFixed(1)}, ${z.toFixed(1)})`).toBeLessThanOrEqual(top(sample(x, z)) - FAR_SINK + 1e-6);
        checked++;
      }
      expect(checked, 'no vertex fell inside the loaded corner radius — the property was never tested').toBeGreaterThan(40);
    }
  });

  it('forest canopy lifts the silhouette, but only beyond where real terrain can be loaded', () => {
    const forest = (x) => ({ ...plain(x), biome: 'forest' });
    const bare = build(plain).positions, wooded = build(forest).positions;
    let lifted = 0;
    for (let i = 0; i < bare.length; i += 3) {
      const r = Math.hypot(bare[i], bare[i + 2]);
      const d = wooded[i + 1] - bare[i + 1];
      if (r <= HIGH.canopyFrom) expect(d).toBeCloseTo(0, 6);
      else if (d > 0.5 * FAR_CANOPY.forest * FAR_CANOPY_HEIGHT) lifted++;
    }
    expect(lifted, 'no far forest vertex was lifted by its canopy').toBeGreaterThan(100);
  });

  it('far water sits at sea level (sunk) and takes the ocean\'s colour, not the seabed\'s', () => {
    const sea = () => ({ surfaceBlock: BLOCK_ID.sand, surfaceY: 12, isWater: true, biome: 'plains' });
    const c = farColumn(sea(), MEANS);
    expect(c.y).toBe(SEA_LEVEL - FAR_SINK); // the ocean plane sits AT sea level (render/Ocean.jsx)
    expect(close([c.r, c.g, c.b], FAR_WATER_LINEAR)).toBe(true);
  });
});

describe('what colour it is — the same two inputs the terrain shader multiplies', () => {
  it('a tinted block is its own tile mean times its biome tint', () => {
    const c = farColumn({ surfaceBlock: BLOCK_ID.grass, surfaceY: 40, isWater: false, biome: 'desert' }, MEANS);
    const want = MEANS[BLOCK_ID.grass].map((v, k) => v * tintOf('desert')[k]);
    expect(close([c.r, c.g, c.b], want)).toBe(true);
  });

  it('an untinted block (stone) is its tile mean, untouched by the biome', () => {
    const c = farColumn({ surfaceBlock: BLOCK_ID.stone, surfaceY: 40, isWater: false, biome: 'jungle' }, MEANS);
    expect(close([c.r, c.g, c.b], MEANS[BLOCK_ID.stone])).toBe(true);
  });

  it('a forest reads as canopy: pulled toward its tinted leaves', () => {
    const ground = farColumn({ surfaceBlock: BLOCK_ID.grass, surfaceY: 40, isWater: false, biome: 'desert' }, MEANS);
    const wood = farColumn({ surfaceBlock: BLOCK_ID.grass, surfaceY: 40, isWater: false, biome: 'forest' }, MEANS);
    const leaves = MEANS[BLOCK_ID.leaves].map((v, k) => v * tintOf('forest')[k]);
    const dist = (c) => Math.hypot(c.r - leaves[0], c.g - leaves[1], c.b - leaves[2]);
    expect(dist(wood)).toBeLessThan(dist(ground));
  });

  it('the tile means are the LINEAR average of the decoded texels (the shader decodes pow 2.2 first)', () => {
    const tex = createProceduralVoxelTextures();
    const { width, height, data } = tex.image;
    const per = width * height * 4, L = BLOCK_ID.sand;
    let r = 0;
    for (let i = 0; i < width * height; i++) r += Math.pow(data[L * per + i * 4] / 255, 2.2);
    expect(MEANS[L][0]).toBeCloseTo(r / (width * height), 6);
  });
});

describe('re-centring does not swim', () => {
  it('the centre is its grid CELL\'s centre, so moving inside a cell changes nothing', () => {
    expect(FAR_RECENTRE).toBe(32);
    expect(snapCentre(40, -40)).toEqual({ x: 48, z: -48 });
    expect(snapCentre(63.9, 5)).toEqual({ x: 48, z: 16 });
    expect(snapCentre(32, 0)).toEqual(snapCentre(63.99, 31.99));
  });
});

describe('cost', () => {
  it('ONE indexed mesh, within the vertex budget at the shipped density', () => {
    const { positions, colors, index } = farFieldGeometry({
      cx: 0, cz: 0, r0: HIGH.inner, r1: FAR_OUTER, canopyFrom: HIGH.canopyFrom, sample: plain, means: MEANS,
    });
    const verts = positions.length / 3;
    expect(verts).toBeLessThanOrEqual(12000);
    expect(colors.length).toBe(positions.length);
    expect(index.length % 3).toBe(0);
    expect(Math.max(...index)).toBe(verts - 1);
  });
});

describe('the far field is drawn, from the real world, hazed like the terrain (weak, structural)', () => {
  it('GameScene mounts it at the tier\'s render distance', () => {
    expect(carriersOf(/<FarField renderDistance=\{q\.renderDistance\} \/>/)).toEqual(['GameScene.jsx']);
  });

  it('it re-centres through snapCentre and builds from the REAL column sampler', () => {
    expect(carriersOf(/const c = snapCentre\(p\.x, p\.z\);/)).toEqual(['world/FarField.jsx']);
    expect(carriersOf(/sample: surfaceBlockAt,/)).toEqual(['world/FarField.jsx']);
  });

  it('ONE aerial-haze definition, spliced by both the terrain and the far field', () => {
    expect(carriersOf(/\$\{AERIAL_GLSL\}/).sort()).toEqual(['world/FarField.jsx', 'world/Terrain.jsx']);
    expect(carriersOf(/smoothstep\(38\.0, 165\.0/), 'a hand-typed copy of the haze is back').toEqual([]);
  });
});
