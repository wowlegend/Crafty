import { describe, it, expect } from 'vitest';
import { createProceduralVoxelTextures } from '../../src/world/proceduralTextures.js';
import { layerMeanLinear } from '../../src/world/farField.js';

/**
 * Distant terrain stops sparkling, without changing its colour.
 *
 * Without a mip chain every distant face samples one texel of a 32x32 tile per screen pixel, so leaves and stone
 * sparkle and crawl in motion. Two ways to build the chain look alike in a still frame and differ in tone:
 *   - the GPU's generateMipmap averages the STORED sRGB bytes, which darkens every high-contrast tile at distance
 *     (gold ore by about 17%, cobblestone 10%, leaves 4%), and leaves a tone step where the near terrain meets the
 *     far field, which averages in linear light;
 *   - averaging in the linear light the shader decodes into (pow 2.2) keeps a distant face the same colour, on
 *     average, as the same face up close and as the far field.
 * These gates pin the second.
 *
 * BLIND SPOT: nothing here renders. Whether three uploads every level is checked on the GPU of the production build
 * by scripts/ci/prod-smoke.mjs (mipVerdict), in CI only.
 */
const tex = createProceduralVoxelTextures();
const SIZE = tex.image.width;
const LAYERS = tex.image.depth;
const L0 = tex.image.data;
const decode = (byte) => Math.pow(byte / 255, 2.2);
const encode = (linear) => Math.round(Math.pow(linear, 1 / 2.2) * 255);

/** The mean of the level-0 block a texel of `level` covers: in linear light, and of the raw bytes. */
function blockMeans(layer, level, x, y) {
  const block = 1 << level;
  const lin = [0, 0, 0, 0];
  const raw = [0, 0, 0];
  for (let v = y * block; v < (y + 1) * block; v++) {
    for (let u = x * block; u < (x + 1) * block; u++) {
      const i = ((layer * SIZE + v) * SIZE + u) * 4;
      for (let k = 0; k < 3; k++) { lin[k] += decode(L0[i + k]); raw[k] += L0[i + k]; }
      lin[3] += L0[i + 3];
    }
  }
  const area = block * block;
  return { lin: lin.map((s) => s / area), raw: raw.map((s) => s / area) };
}

describe('the block texture mip chain is the linear-light mean of the tiles', () => {
  it('every texel of every level, every layer, is the linear-light mean of the level-0 block it covers', () => {
    let checked = 0;
    let rawWouldDiffer = 0; // the fixture must be able to tell a byte-space chain from a linear-light one
    const misses = [];
    for (let level = 1; level < tex.mipmaps.length; level++) {
      const { data, width } = tex.mipmaps[level];
      for (let layer = 0; layer < LAYERS; layer++) {
        for (let y = 0; y < width; y++) {
          for (let x = 0; x < width; x++) {
            const { lin, raw } = blockMeans(layer, level, x, y);
            const o = ((layer * width + y) * width + x) * 4;
            for (let k = 0; k < 3; k++) {
              const want = encode(lin[k]);
              if (Math.abs(data[o + k] - want) > 1) misses.push(`level ${level} layer ${layer} (${x},${y}) ch${k}: ${data[o + k]} != ${want}`);
              if (Math.abs(Math.round(raw[k]) - want) > 1) rawWouldDiffer += 1;
            }
            if (Math.abs(data[o + 3] - Math.round(lin[3])) > 1) misses.push(`level ${level} layer ${layer} (${x},${y}) alpha`);
            checked += 1;
          }
        }
      }
    }
    // 16 layers x (16^2 + 8^2 + 4^2 + 2^2 + 1^2) texels.
    expect(checked).toBe(LAYERS * (256 + 64 + 16 + 4 + 1));
    expect(rawWouldDiffer, 'SETUP: no texel where byte-space and linear-light means differ, so this cannot fail').toBeGreaterThan(500);
    expect(misses.slice(0, 5), `${misses.length} mip texels are not the linear-light mean of their block`).toEqual([]);
  });

  it('the 1x1 level of every layer is the colour the far field paints that block (no tone step where they meet)', () => {
    const top = tex.mipmaps[tex.mipmaps.length - 1];
    expect(top.width).toBe(1);
    const means = layerMeanLinear(tex);
    expect(means.length).toBe(LAYERS);
    for (let layer = 1; layer < LAYERS; layer++) {
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(top.data[layer * 4 + k] - encode(means[layer][k])), `layer ${layer} channel ${k}`).toBeLessThanOrEqual(1);
      }
    }
  });
});
