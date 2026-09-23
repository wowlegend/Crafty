import { describe, it, expect } from 'vitest';
import {
  FAR_WATER_SINK, FAR_OUTER, FAR_RECENTRE, FAR_CANOPY, FAR_CANOPY_HEIGHT, FAR_WATER_LINEAR,
  farInnerRadius, snapCentre, layerMeanLinear, farColumn, farFieldGeometry, farFieldVertices, farFieldIndex, carriesCanopy,
} from '../../src/world/farField.js';
import { createProceduralVoxelTextures } from '../../src/world/proceduralTextures.js';
import { BIOME_TINT, BIOME_ID } from '../../src/world/biomeTable.js';
import { BLOCK_ID } from '../../src/world/blockIds.js';
import { SEA_LEVEL, WAVES } from '../../src/world/oceanProfile.js';
import { carriersOf, sourceTexts } from './_srcWalk.js';

/**
 * THE FAR HORIZON — a heightfield ring beyond the loaded chunks (spec 2026-09-22-crafty-far-horizon-design,
 * plan Tasks 1 and 3). Past ~72 m the world used to end in fog over sky colour.
 *
 * Since Task 3 (QUEUE R3.9) the ring sits AT the true surface and is hole-punched by the loaded chunks in its
 * fragment shader (loaded-chunk-mask-gates), so there is no sink here to get wrong: land is the surface top plus
 * its canopy, and only WATER sinks — just below the deepest wave trough, against the ocean plane.
 *
 * Driven with SYNTHETIC worlds (the column sampler is injected), so each property is known by construction:
 * a tilted plane, a patch of sea, a forest.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh against src/world/farField.js, each observed RED:
 *   M1 plausible-wrong: land still sunk 2 m (the retired design)   M2 water not sunk
 *   M2b plausible-wrong: the water sink ignores the waves (a fixed 1 m, above the deepest trough)
 *   M3 the inner radius ignores the centre slack (a gap on one side)
 *   M4 plausible-wrong: biome tint on stone      M5 water takes the seabed's colour
 *   M6 plausible-wrong: snap to the cell CORNER (doubles the offset)
 *   M7 canopy lift ignored
 *   M9 plausible-wrong: tile means averaged in sRGB, not linear
 *   M10 GameScene: the far field unmounted                   -> mount RED (structural)
 *   M11 FarField: re-centred on the raw position, not the grid -> snap RED (structural)
 *   M12 Terrain: the haze typed back inline                  -> one-definition RED (structural)
 *   (R3.7 / R3.8 / R3.10:)
 *   G1 FarField: the grade not spliced                       G2 Terrain: the grade typed back inline
 *   G3 FarField: mood never fed (the boss sky stays ungraded) G4 FarField: cloud shadows not spliced
 *   C1 plausible-wrong: dirt carries canopy in every biome    C2 swamp dirt bare again
 *   P1 the rebuild allocates new BufferAttributes again       P2 farFieldVertices ignores `out`
 *   P3 FarField builds its own texture array again
 *   (review #4:) P4 computeVertexNormals back on the rebuild path   P5 plausible-wrong: flatShading turned off
 *   while the normals stay uncomputed (the ring would light with a zero normal)
 *
 * BLIND SPOT: nothing here renders. Whether the ring reads as land to the horizon, meets the ocean plane without
 * a seam, and vanishes over loaded terrain is judged from a same-renderer capture (plan Tasks 2 and 3).
 */
const MEANS = layerMeanLinear(createProceduralVoxelTextures());
const tintOf = (biome) => [0, 1, 2].map((k) => BIOME_TINT[BIOME_ID[biome] * 3 + k]);
const top = (s) => s.surfaceY + 1; // a block at y fills [y, y+1]: its top face is y + 1
const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-5);

// A tilted plain of grass: surface rises 1 block per 10 m of x. In a biome with NO canopy, so it is bare ground.
const plain = (x) => ({ surfaceBlock: BLOCK_ID.grass, surfaceY: 40 + Math.floor(x / 10), isWater: false, biome: 'desert' });
const INNER = farInnerRadius(4);
const build = (sample, extra = {}) => farFieldGeometry({
  cx: 0, cz: 0, r0: INNER, r1: FAR_OUTER, rings: 12, sectors: 48, sample, means: MEANS, ...extra,
});

describe('where the ring sits', () => {
  it('NO GAP, for every player position the snapped centre can serve', () => {
    // The streamed square always covers the disk of radius renderDistance*16 around the player. From the ring's
    // snapped centre, the ring's hole must sit inside it, else a band of nothing between real terrain and the
    // far field. Swept over positions in a cell. (Where the ring overlaps loaded chunks it is discarded.)
    for (const rd of [2, 3, 4]) {
      const inner = farInnerRadius(rd);
      let worst = 0;
      for (let x = 0; x < 32; x += 1.7) for (let z = 0; z < 32; z += 1.3) {
        const c = snapCentre(100 + x, -60 + z);
        const off = Math.hypot(c.x - (100 + x), c.z - (-60 + z));
        worst = Math.max(worst, off);
        expect(off + inner, `rd ${rd}: a gap between the loaded terrain and the ring`).toBeLessThanOrEqual(rd * 16 + 1e-9);
      }
      expect(worst, 'the sweep never approached the worst-case offset').toBeGreaterThan(20);
      expect(inner, `rd ${rd}: the hole is needlessly small`).toBeGreaterThan(rd * 16 - 23);
    }
  });

  it('the ring runs from the derived inner radius to the outer radius', () => {
    const { positions } = build(plain);
    const radii = [];
    for (let i = 0; i < positions.length; i += 3) radii.push(Math.hypot(positions[i], positions[i + 2]));
    expect(Math.min(...radii)).toBeCloseTo(INNER, 4);
    expect(Math.max(...radii)).toBeCloseTo(FAR_OUTER, 4);
  });

  it('bare land sits AT its real surface top — no sink, since loaded chunks punch it out instead', () => {
    // A sunk ring shows a step where it meets real terrain and a floor above a loaded seabed (R3.4-R3.6).
    expect(FAR_CANOPY.desert, 'the bare fixture is not bare').toBe(0);
    const { positions } = build(plain);
    let checked = 0;
    for (let i = 0; i < positions.length; i += 3) {
      const [x, y, z] = [positions[i], positions[i + 1], positions[i + 2]];
      // Positions are float32: a vertex ON a block step (x = -210) reads back a hair to either side of it.
      const onSurface = [x - 1e-3, x, x + 1e-3].some((xx) => Math.abs(y - top(plain(xx, z))) < 1e-6);
      expect(onSurface, `vertex at (${x.toFixed(1)}, ${z.toFixed(1)}) y ${y} vs top ${top(plain(x, z))}`).toBe(true);
      checked++;
    }
    expect(checked).toBe(12 * 48);
  });

  it('forest canopy lifts the silhouette everywhere by its coverage x the canopy height', () => {
    const forest = (x) => ({ ...plain(x), biome: 'forest' });
    const bare = build(plain).positions, wooded = build(forest).positions;
    let lifted = 0;
    for (let i = 0; i < bare.length; i += 3) {
      expect(wooded[i + 1] - bare[i + 1]).toBeCloseTo(FAR_CANOPY.forest * FAR_CANOPY_HEIGHT, 6);
      lifted++;
    }
    expect(lifted).toBe(12 * 48);
  });

  it('far water sits just below the deepest wave trough and takes the ocean\'s colour, not the seabed\'s', () => {
    // The ocean plane (render/Ocean.jsx) is Gerstner-displaced about SEA_LEVEL; its lowest point is SEA_LEVEL minus
    // the sum of the amplitudes. Far water above that pokes a flat patch through every deep trough.
    const deepestTrough = WAVES.reduce((sum, w) => sum + w[3], 0);
    expect(FAR_WATER_SINK, 'far water pokes through the ocean plane\'s troughs').toBeGreaterThan(deepestTrough);
    expect(FAR_WATER_SINK, 'far water sunk well below the sea it stands for').toBeLessThanOrEqual(deepestTrough + 0.5);
    const sea = () => ({ surfaceBlock: BLOCK_ID.sand, surfaceY: 12, isWater: true, biome: 'plains' });
    const c = farColumn(sea(), MEANS);
    expect(c.y).toBe(SEA_LEVEL - FAR_WATER_SINK);
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
      cx: 0, cz: 0, r0: INNER, r1: FAR_OUTER, sample: plain, means: MEANS,
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
  it('R3.7: ONE danger-mood grade, spliced after the albedo by both materials — no seam in the boss fight', () => {
    expect(carriersOf(/\$\{LAND_GRADE_GLSL\}/).sort()).toEqual(['world/FarField.jsx', 'world/Terrain.jsx']);
    expect(carriersOf(/coolGrey = vec3\(/), 'a hand-typed copy of the grade is back').toEqual(['render/landGrade.js']);
    expect(carriersOf(/'#include <color_fragment>',\s*`#include <color_fragment>\s*\$\{LAND_GRADE_GLSL\}/)).toEqual(['world/FarField.jsx']);
    expect(carriersOf(/shader\.uniforms\.mood\.value = moodRef\.current;/)).toEqual(['world/FarField.jsx']);
  });

  it('R3.7: the far field takes the cloud shadows on the SAME clock and sun as the terrain', () => {
    expect(carriersOf(/'#include <lights_fragment_end>',\s*`#include <lights_fragment_end>\s*\$\{CLOUD_SHADOW_GLSL\.apply\}/)).toEqual(['world/FarField.jsx']);
    expect(carriersOf(/shader\.uniforms\.uTime\.value = frameElapsed\(state\.clock\.elapsedTime\);/)).toEqual(['world/FarField.jsx']);
    expect(carriersOf(/shader\.uniforms\.uCloudCover\.value = cloudCoverRef\.current;/)).toEqual(['world/FarField.jsx']);
  });

  it('R3.10: a rebuild refills one set of buffers — nothing is allocated on the rebuild path', () => {
    // A slice bounded by two landmarks unique to FarField's rebuild, so no other `new` in the file can satisfy it.
    const src = sourceTexts().find((t) => t.file === 'world/FarField.jsx').code;
    const start = src.indexOf('builtFor.current = key;'), end = src.indexOf('geo.computeBoundingSphere();');
    expect(start > 0 && end > start, 'the rebuild landmarks moved — this check reads nothing').toBe(true);
    const rebuild = src.slice(start, end);
    expect(rebuild).toContain('farFieldVertices(');
    expect(rebuild, 'the rebuild allocates again').not.toMatch(/\bnew\b|setAttribute\(|setIndex\(/);
    // flatShading derives normals from screen-space derivatives: computing them is pure waste (review #4, R5.9).
    expect(rebuild, 'normals computed for a flat-shaded material again').not.toMatch(/computeVertexNormals\(/);
    expect(carriersOf(/flatShading: true/)).toContain('world/FarField.jsx');
    // ...and the ONE texture array: nothing builds a second copy just to average it.
    expect(carriersOf(/createProceduralVoxelTextures\(/)).toEqual(['world/proceduralTextures.js']);
  });
});

describe('R3.10 — the split builders are the same geometry', () => {
  it('farFieldVertices writes INTO the buffers it is given, and matches farFieldGeometry exactly', () => {
    const args = { cx: 48, cz: -16, r0: INNER, r1: FAR_OUTER, rings: 12, sectors: 48, sample: plain, means: MEANS };
    const out = { positions: new Float32Array(12 * 48 * 3), colors: new Float32Array(12 * 48 * 3) };
    const v = farFieldVertices({ ...args, out });
    expect(v.positions).toBe(out.positions);
    expect(v.colors).toBe(out.colors);
    const g = farFieldGeometry(args);
    expect(Array.from(out.positions)).toEqual(Array.from(g.positions));
    expect(Array.from(out.colors)).toEqual(Array.from(g.colors));
    expect(Array.from(farFieldIndex(12, 48))).toEqual(Array.from(g.index));
  });
});

describe('R3.8 — which surfaces carry the canopy (read off the worker\'s flora branches)', () => {
  it('grass everywhere, snow, and dirt ONLY in the swamp', () => {
    expect(carriesCanopy(BLOCK_ID.grass, 'plains')).toBe(true);
    expect(carriesCanopy(BLOCK_ID.snow, 'snow')).toBe(true);
    expect(carriesCanopy(BLOCK_ID.dirt, 'swamp'), 'swamp trees grow on the murky dirt flats').toBe(true);
    expect(carriesCanopy(BLOCK_ID.dirt, 'forest'), 'dirt anywhere else is bare').toBe(false);
    expect(carriesCanopy(BLOCK_ID.stone, 'forest')).toBe(false);
    expect(carriesCanopy(BLOCK_ID.sand, 'swamp')).toBe(false);
  });

  it('a far swamp column is lifted by its canopy; the same dirt in a forest is not', () => {
    expect(FAR_CANOPY.swamp).toBeGreaterThan(0);
    const col = (biome) => farColumn({ surfaceBlock: BLOCK_ID.dirt, surfaceY: 40, isWater: false, biome }, MEANS);
    expect(col('swamp').y).toBeCloseTo(41 + FAR_CANOPY.swamp * FAR_CANOPY_HEIGHT, 6);
    expect(col('forest').y).toBe(41);
  });
});
