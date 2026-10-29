import { describe, it, expect } from 'vitest';
import { sharedVoxelTextures, MATERIAL_TONES, ORE_TILES, LAYER_TILING, declaredTones } from '../../src/world/proceduralTextures.js';
import { NUGGET_CHROMA } from '../../src/world/oreGlow.js';
import { BLOCK_ID } from '../../src/world/blockIds.js';
import {
  FACE_ROLE, FACE_VARIANTS, LIP_TEXELS, BLOCK_LAYER_COUNT, TEXTURE_LAYER_COUNT, buildGrammar, faceLayer, faceLayerGlsl,
  faceRoleOfNormal, variantLayer,
} from '../../src/world/materialGrammar.js';
import { layerStats, chromaOf } from '../world/_textureStats.js';
import BEFORE from '../world/material-before-2026-10-28.json';

/**
 * THE TONE GRAMMAR, on the texture array the game renders with: each sampled layer is a few solid tones in clustered
 * shapes, tiles that should wrap do, and each layer keeps the linear mean colour it had before the repaint, so the
 * far field, the biome tint, the grass blades' match to their turf and the light rig keep their inputs.
 *
 * The reference means are a fixture frozen from the generator before the repaint (scripts/visual/freeze-material-before.mjs,
 * which refuses to overwrite it); nothing here regenerates them.
 *
 * THE FACE GRAMMAR: which layer a block's top, sides and underside show, the generated shader table that picks it, and
 * the face variants (turf over dirt, snow over stone, bark) painted from their parents' tones.
 *
 * NOT CHECKED HERE: whether a layer looks good, and whether the GPU runs the generated GLSL as the JS reading of it
 * below does. Tones, clustering and means hold structure and value; prod-smoke (CI) links and draws the shipped
 * terrain program; the eye-level lookbook frames judge the look.
 */
const tex = sharedVoxelTextures();
const SAMPLED = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
const VARIANTS = FACE_VARIANTS.map((v) => variantLayer(v.name));
const PAINTED = [...SAMPLED, ...VARIANTS];
const SIZE = tex.image.width;
const hex = ([r, g, b]) => (r << 16) | (g << 8) | b;
const isComposite = (layer) => ORE_TILES.some((o) => o.layer === layer) || VARIANTS.includes(layer);
const texels = (layer) => {
  const d = tex.image.data, out = [];
  for (let i = 0; i < SIZE * SIZE; i++) {
    const o = (layer * SIZE * SIZE + i) * 4;
    out.push([d[o], d[o + 1], d[o + 2]]);
  }
  return out;
};
const dec = (v) => Math.pow(v / 255, 2.2);
const lumOf = ([r, g, b]) => 0.2126 * dec(r) + 0.7152 * dec(g) + 0.0722 * dec(b);
const chroma = ([r, g, b]) => (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
// An ore's nugget tones are what it declares beyond the stone matrix: its colour and its rim.
const nuggetTones = (o) => declaredTones(o.layer).filter((t) => !MATERIAL_TONES.stone.some((s) => hex(s) === hex(t)));

describe('the tone grammar on the array the terrain samples', () => {
  it('the reference covers every sampled layer', () => {
    expect(Object.keys(BEFORE).map(Number).sort((a, b) => a - b)).toEqual(SAMPLED);
  });

  it('every painted layer uses only its declared tones, 2-4 for a material and at most 6 for an ore or a face variant', () => {
    let checked = 0;
    for (const L of PAINTED) {
      const declared = new Set(declaredTones(L).map(hex));
      const limit = isComposite(L) ? 6 : 4;
      expect(declared.size, `layer ${L} declares ${declared.size} tones`).toBeGreaterThanOrEqual(2);
      expect(declared.size, `layer ${L} declares ${declared.size} tones`).toBeLessThanOrEqual(limit);
      const stray = [...layerStats(tex, L).tones].filter((t) => !declared.has(t));
      expect(stray.map((t) => t.toString(16)), `layer ${L} paints tones it does not declare`).toEqual([]);
      checked++;
    }
    expect(checked).toBe(PAINTED.length);
  });

  it('tones cluster: a texel usually shares its neighbour\'s tone', () => {
    let checked = 0;
    for (const L of PAINTED) {
      const s = layerStats(tex, L);
      expect(s.sameNeighbour, `layer ${L}: ${s.sameNeighbour.toFixed(3)} of neighbour pairs share a tone`).toBeGreaterThanOrEqual(0.55);
      checked++;
    }
    expect(checked).toBe(PAINTED.length);
  });

  it('continuous tiles wrap; lip tiles wrap along u; framed tiles have a one-tone border', () => {
    let periodic = 0, lip = 0, framed = 0;
    for (const L of PAINTED) {
      const s = layerStats(tex, L);
      if (LAYER_TILING[L] === 'periodic') {
        expect(s.wrapChange, `layer ${L}: the seam changes tone at ${s.wrapChange.toFixed(2)}, the interior at ${s.interiorChange.toFixed(2)}`)
          .toBeLessThanOrEqual(1.5 * s.interiorChange + 0.05);
        periodic++;
      } else if (LAYER_TILING[L] === 'lip') {
        expect(s.wrapChangeU, `layer ${L}: the u seam changes tone at ${s.wrapChangeU.toFixed(2)}, the interior at ${s.interiorChangeU.toFixed(2)}`)
          .toBeLessThanOrEqual(1.5 * s.interiorChangeU + 0.05);
        lip++;
      } else {
        expect(LAYER_TILING[L], `layer ${L}`).toBe('framed');
        expect(s.border.size, `layer ${L}: its frame has ${s.border.size} tones`).toBe(1);
        framed++;
      }
    }
    expect([periodic, lip, framed]).toEqual([13, 2, 2]);
  });

  it('structure moved, palette did not: each layer\'s linear luminance within 15% and chromaticity within 0.03 of before', () => {
    let checked = 0;
    for (const L of SAMPLED) {
      const s = layerStats(tex, L);
      const [cr, cg] = chromaOf(s.meanLinear);
      const b = BEFORE[L];
      expect(Math.abs(s.lum / b.lum - 1), `layer ${L}: luminance ${s.lum.toFixed(4)} against ${b.lum.toFixed(4)}`).toBeLessThanOrEqual(0.15);
      expect(Math.abs(cr - b.chroma[0]), `layer ${L}: red chromaticity`).toBeLessThanOrEqual(0.03);
      expect(Math.abs(cg - b.chroma[1]), `layer ${L}: green chromaticity`).toBeLessThanOrEqual(0.03);
      checked++;
    }
    expect(checked).toBe(SAMPLED.length);
  });

  it('no black holes: no texel darker than 0.35 of its layer\'s mean, but an ore\'s nugget', () => {
    const exempt = new Set(ORE_TILES.flatMap(nuggetTones).map(hex));
    expect(exempt.size, 'SETUP: the ore exemptions were not derived').toBe(8);
    let checked = 0;
    for (const L of PAINTED) {
      const mean = layerStats(tex, L).lum;
      const dark = texels(L).filter((t) => !exempt.has(hex(t)) && lumOf(t) < 0.35 * mean);
      expect(dark.length, `layer ${L}: ${dark.length} texels darker than 0.35 x ${mean.toFixed(4)}, e.g. ${dark[0]}`).toBe(0);
      checked++;
    }
    expect(checked).toBe(PAINTED.length);
  });

  it('the ore glow sees nuggets and never stone', () => {
    const stone = new Set(MATERIAL_TONES.stone.map(hex));
    let matrix = 0, nuggets = 0;
    for (const L of [BLOCK_ID.stone, ...ORE_TILES.map((o) => o.layer)]) {
      for (const t of texels(L)) {
        if (stone.has(hex(t))) {
          expect(chroma(t), `layer ${L}: stone texel ${t} would glow`).toBeLessThan(NUGGET_CHROMA[0]);
          matrix++;
        }
      }
    }
    for (const name of ['iron', 'gold', 'diamond']) {
      const ore = ORE_TILES.find((o) => o.layer === BLOCK_ID[name]);
      const own = new Set(nuggetTones(ore).map(hex));
      for (const t of texels(ore.layer)) {
        if (own.has(hex(t))) {
          expect(chroma(t), `${name}: nugget texel ${t} would not glow fully`).toBeGreaterThan(NUGGET_CHROMA[1]);
          nuggets++;
        }
      }
    }
    expect(matrix, 'presence: stone texels were checked').toBeGreaterThan(SIZE * SIZE);
    expect(nuggets, 'presence: nugget texels were checked').toBeGreaterThan(0.05 * 3 * SIZE * SIZE);
  });
});

const { top, side, bottom } = FACE_ROLE;
const AXIS_NORMALS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** The generated vertex GLSL, read as JavaScript: its two statements are valid JS once `int` declares with `let`. */
function runFaceVertex(glsl, normal, colorR) {
  const table = glsl.vertexDecl.match(/const float FACE_LAYER\[(\d+)\] = float\[\1\]\(([^)]*)\);/);
  const FACE_LAYER = table[2].split(',').map(Number);
  const body = glsl.vertex.replace(/^int faceRole =/m, 'let faceRole =');
  const run = new Function('normal', 'color', 'FACE_LAYER', 'int', 'clamp', `let vTexLayer; ${body} return vTexLayer;`);
  return run({ x: normal[0], y: normal[1], z: normal[2] }, { r: colorR, g: 0, b: 0 }, FACE_LAYER, Math.trunc,
    (v, lo, hi) => Math.min(hi, Math.max(lo, v)));
}

describe('the face grammar: which layer each face of each block shows', () => {
  it('the face table is the declared grammar, checked against literals', () => {
    const { grass, dirt, stone, sand, snow, wood, leaves, cobblestone } = BLOCK_ID;
    const checks = [
      [faceLayer(grass, side), variantLayer('grass_side')],
      [faceLayer(grass, top), grass],
      [faceLayer(grass, bottom), dirt],
      [faceLayer(snow, side), variantLayer('snow_side')],
      [faceLayer(snow, top), snow],
      [faceLayer(snow, bottom), stone],
      [faceLayer(wood, side), variantLayer('wood_side')],
      [faceLayer(wood, top), wood],
      [faceLayer(wood, bottom), wood],
      ...[stone, sand, leaves, cobblestone].flatMap((b) => [top, side, bottom].map((r) => [faceLayer(b, r), b])),
    ];
    for (const [got, want] of checks) expect(got).toBe(want);
    expect(faceLayer(grass, side), 'a grass side shows the grass top').not.toBe(grass);
    expect(checks.length).toBe(9 + 12);
    expect(VARIANTS, 'the variants sit right above the id space, in declared order').toEqual([BLOCK_LAYER_COUNT, BLOCK_LAYER_COUNT + 1, BLOCK_LAYER_COUNT + 2]);
    expect(FACE_VARIANTS.map((v) => v.name)).toEqual(['grass_side', 'snow_side', 'wood_side']);
  });

  it('a face\'s role comes from its normal: up is the top, down the underside, every horizontal normal a side', () => {
    expect(AXIS_NORMALS.map(([, ny]) => faceRoleOfNormal(ny))).toEqual([side, side, top, bottom, side, side]);
  });

  it('the generated vertex stage picks the face table\'s layer for every block and every axis normal', () => {
    const glsl = faceLayerGlsl();
    let checked = 0;
    for (let b = 0; b < BLOCK_LAYER_COUNT; b++) {
      for (const n of AXIS_NORMALS) {
        expect(runFaceVertex(glsl, n, b), `block ${b}, normal ${n}`).toBe(faceLayer(b, faceRoleOfNormal(n[1])));
        checked++;
      }
    }
    expect(checked).toBe(BLOCK_LAYER_COUNT * 6);
    expect(runFaceVertex(glsl, [0, 1, 0], 250), 'an out-of-range block reads the last block\'s entry').toBe(faceLayer(BLOCK_LAYER_COUNT - 1, top));
  });

  it('the shader table is generated from the JS table, and the GLSL reads the normal and colour.r, never colour.b', () => {
    const glsl = faceLayerGlsl();
    const m = glsl.vertexDecl.match(/const float FACE_LAYER\[(\d+)\] = float\[\1\]\(([^)]*)\);/);
    const entries = m[2].split(',').map(Number);
    expect(Number(m[1])).toBe(BLOCK_LAYER_COUNT * 3);
    let checked = 0;
    for (let b = 0; b < BLOCK_LAYER_COUNT; b++) {
      for (const r of [top, side, bottom]) { expect(entries[b * 3 + r]).toBe(faceLayer(b, r)); checked++; }
    }
    expect(checked).toBe(BLOCK_LAYER_COUNT * 3);
    const all = Object.values(glsl).join('\n');
    expect(all).toMatch(/\bnormal\.y\b/);
    expect(all).toMatch(/\bcolor\.r\b/);
    expect(all, 'colour.b is the block-light channel').not.toMatch(/\bcolor\.b\b/);
    expect(all).not.toContain('`');
  });

  it('a grammar naming a block the id space lacks throws, naming it, rather than dropping the write', () => {
    const { snow, ...noSnow } = BLOCK_ID;
    expect(snow).toBe(BLOCK_ID.snow);
    expect(() => buildGrammar(noSnow)).toThrow(/"snow"/);
    const { stone, ...noStone } = BLOCK_ID;
    expect(stone, 'SETUP: stone is only a remap target here').toBe(BLOCK_ID.stone);
    expect(() => buildGrammar(noStone), 'a missing remap target').toThrow(/"stone"/);
    expect(() => buildGrammar(BLOCK_ID)).not.toThrow();
  });

  it('the derivation follows the id space: a new block id moves the variants up by one', () => {
    const g = buildGrammar({ ...BLOCK_ID, lantern: 16 });
    expect(g.BLOCK_LAYER_COUNT).toBe(17);
    expect(g.variantLayer('grass_side')).toBe(17);
    expect(g.TEXTURE_LAYER_COUNT).toBe(20);
    expect(g.faceLayer(BLOCK_ID.grass, side)).toBe(17);
    expect(g.faceLayer(16, side)).toBe(16);
    expect(BLOCK_LAYER_COUNT).toBe(Math.max(...Object.values(BLOCK_ID)) + 1);
  });

  it('the array is the block id space plus the declared variants', () => {
    expect(TEXTURE_LAYER_COUNT).toBe(BLOCK_LAYER_COUNT + FACE_VARIANTS.length);
    expect(tex.image.depth).toBe(TEXTURE_LAYER_COUNT);
    expect(LAYER_TILING.length).toBe(TEXTURE_LAYER_COUNT);
  });
});

describe('the face variants are made of their parents', () => {
  const rowsOf = (layer, from, to) => texels(layer).filter((_, i) => Math.floor(i / SIZE) >= from && Math.floor(i / SIZE) <= to);
  const only = (tones) => { const set = new Set(tones.map(hex)); return (t) => set.has(hex(t)); };

  for (const [block, lip, body] of [['grass', 'grass', 'dirt'], ['snow', 'snow', 'stone']]) {
    it(`a ${block} side, as the face table names it: a ${lip} lip in its top ${LIP_TEXELS} rows, ${body} below, nothing else`, () => {
      const L = faceLayer(BLOCK_ID[block], side);
      const lipRows = rowsOf(L, SIZE - LIP_TEXELS, SIZE - 1);
      const bodyRows = rowsOf(L, 0, SIZE - LIP_TEXELS - 3);
      expect(lipRows.length).toBe(LIP_TEXELS * SIZE);
      expect(bodyRows.length).toBe((SIZE - LIP_TEXELS - 2) * SIZE);
      expect(lipRows.filter((t) => !only(MATERIAL_TONES[lip])(t)).length, `${block} side: lip rows not all ${lip}`).toBe(0);
      expect(bodyRows.filter((t) => !only(MATERIAL_TONES[body])(t)).length, `${block} side: body rows not all ${body}`).toBe(0);
      const either = only([...MATERIAL_TONES[lip], ...MATERIAL_TONES[body]]);
      expect(texels(L).filter((t) => !either(t)).length).toBe(0);
    });
  }

  // Each variant region stands where its parent's layer stood before the grammar (a hill wall showed the grass layer,
  // a trunk side the wood layer, and the far field still averages the parents), so each is held to its parent's frozen
  // mean as the sampled layers are: a repaint that keeps the parent's tones and shifts their shares moves it.
  const regionMean = (layer, from, to) => {
    const ts = rowsOf(layer, from, to);
    return [0, 1, 2].map((c) => ts.reduce((a, t) => a + dec(t[c]), 0) / ts.length);
  };
  const lumLinear = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  it('each variant region keeps the linear luminance (15%) and chromaticity (0.03) of the parent layer it stands for', () => {
    const regions = [
      ['grass_side lip', faceLayer(BLOCK_ID.grass, side), SIZE - LIP_TEXELS, SIZE - 1, BLOCK_ID.grass],
      ['grass_side body', faceLayer(BLOCK_ID.grass, side), 0, SIZE - LIP_TEXELS - 3, BLOCK_ID.dirt],
      ['snow_side lip', faceLayer(BLOCK_ID.snow, side), SIZE - LIP_TEXELS, SIZE - 1, BLOCK_ID.snow],
      ['snow_side body', faceLayer(BLOCK_ID.snow, side), 0, SIZE - LIP_TEXELS - 3, BLOCK_ID.stone],
      ['wood_side', faceLayer(BLOCK_ID.wood, side), 0, SIZE - 1, BLOCK_ID.wood],
    ];
    let checked = 0;
    for (const [name, L, from, to, parent] of regions) {
      expect(VARIANTS, `${name}: SETUP: the face table does not name a variant`).toContain(L);
      const m = regionMean(L, from, to);
      const [cr, cg] = chromaOf(m);
      const b = BEFORE[parent];
      console.log(`[gate] ${name}: luminance x${(lumLinear(m) / b.lum).toFixed(3)} of layer ${parent}, chromaticity off by ${Math.abs(cr - b.chroma[0]).toFixed(3)}, ${Math.abs(cg - b.chroma[1]).toFixed(3)}`);
      expect(Math.abs(lumLinear(m) / b.lum - 1), `${name}: luminance ${lumLinear(m).toFixed(4)} against layer ${parent}'s ${b.lum.toFixed(4)}`).toBeLessThanOrEqual(0.15);
      expect(Math.abs(cr - b.chroma[0]), `${name}: red chromaticity against layer ${parent}`).toBeLessThanOrEqual(0.03);
      expect(Math.abs(cg - b.chroma[1]), `${name}: green chromaticity against layer ${parent}`).toBeLessThanOrEqual(0.03);
      checked++;
    }
    expect(checked).toBe(FACE_VARIANTS.length + 2);
  });

  it('a wood side, as the face table names it, is bark: wood tones in vertical grain that wraps both ways', () => {
    const L = faceLayer(BLOCK_ID.wood, side);
    const s = layerStats(tex, L);
    expect(texels(L).filter((t) => !only(MATERIAL_TONES.wood)(t)).length).toBe(0);
    expect(LAYER_TILING[L]).toBe('periodic');
    expect(s.interiorChangeV, `the grain runs across the trunk: u ${s.interiorChangeU.toFixed(2)}, v ${s.interiorChangeV.toFixed(2)}`)
      .toBeLessThan(0.5 * s.interiorChangeU);
  });
});
