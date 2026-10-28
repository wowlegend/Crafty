import { describe, it, expect } from 'vitest';
import { sharedVoxelTextures, MATERIAL_TONES, ORE_TILES, LAYER_TILING, declaredTones } from '../../src/world/proceduralTextures.js';
import { NUGGET_CHROMA } from '../../src/world/oreGlow.js';
import { BLOCK_ID } from '../../src/world/blockIds.js';
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
 * NOT CHECKED HERE: whether a layer looks good. Tones, clustering and means hold structure and value; the eye-level
 * lookbook frames judge the look.
 */
const tex = sharedVoxelTextures();
const SAMPLED = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
const SIZE = tex.image.width;
const hex = ([r, g, b]) => (r << 16) | (g << 8) | b;
const isOre = (layer) => ORE_TILES.some((o) => o.layer === layer);
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

  it('every sampled layer is painted only in its declared tones, 2-4 for a material and at most 6 for an ore', () => {
    let checked = 0;
    for (const L of SAMPLED) {
      const declared = new Set(declaredTones(L).map(hex));
      const limit = isOre(L) ? 6 : 4;
      expect(declared.size, `layer ${L} declares ${declared.size} tones`).toBeGreaterThanOrEqual(2);
      expect(declared.size, `layer ${L} declares ${declared.size} tones`).toBeLessThanOrEqual(limit);
      const stray = [...layerStats(tex, L).tones].filter((t) => !declared.has(t));
      expect(stray.map((t) => t.toString(16)), `layer ${L} paints tones it does not declare`).toEqual([]);
      checked++;
    }
    expect(checked).toBe(SAMPLED.length);
  });

  it('tones cluster: a texel usually shares its neighbour\'s tone', () => {
    let checked = 0;
    for (const L of SAMPLED) {
      const s = layerStats(tex, L);
      expect(s.sameNeighbour, `layer ${L}: ${s.sameNeighbour.toFixed(3)} of neighbour pairs share a tone`).toBeGreaterThanOrEqual(0.55);
      checked++;
    }
    expect(checked).toBe(SAMPLED.length);
  });

  it('continuous tiles wrap; framed tiles have a one-tone border', () => {
    let periodic = 0, framed = 0;
    for (const L of SAMPLED) {
      const s = layerStats(tex, L);
      if (LAYER_TILING[L] === 'periodic') {
        expect(s.wrapChange, `layer ${L}: the seam changes tone at ${s.wrapChange.toFixed(2)}, the interior at ${s.interiorChange.toFixed(2)}`)
          .toBeLessThanOrEqual(1.5 * s.interiorChange + 0.05);
        periodic++;
      } else {
        expect(LAYER_TILING[L], `layer ${L}`).toBe('framed');
        expect(s.border.size, `layer ${L}: its frame has ${s.border.size} tones`).toBe(1);
        framed++;
      }
    }
    expect([periodic, framed]).toEqual([12, 2]);
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
    for (const L of SAMPLED) {
      const mean = layerStats(tex, L).lum;
      const dark = texels(L).filter((t) => !exempt.has(hex(t)) && lumOf(t) < 0.35 * mean);
      expect(dark.length, `layer ${L}: ${dark.length} texels darker than 0.35 x ${mean.toFixed(4)}, e.g. ${dark[0]}`).toBe(0);
      checked++;
    }
    expect(checked).toBe(SAMPLED.length);
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
