import { describe, it, expect } from 'vitest';
import { sharedVoxelTextures } from '../../src/world/proceduralTextures.js';
import { BLOCK_ID } from '../../src/world/blockIds.js';
import { ORE_GLOW, oreGlowTable, nuggetMask, nightFactor, oreGlowGlsl, oreGlowTexture, GLOW_LAYERS } from '../../src/world/oreGlow.js';

/**
 * EMISSIVE ORES (plan 2026-09-23-crafty-emissive-ores, Task 1; EXTERNAL-BASELINE-R2 #3).
 *
 * At night an ore's NUGGETS glow in their own colour; the stone between them, every other block, and every day
 * frame stay exactly as they are. The terrain shader's term is `linear(glow map) x table[layer] x night`, and every
 * factor is built here: the table and the night curve as plain numbers, and the glow map baked from the REAL tile
 * bytes the terrain samples (linear colour x nugget mask, from level 0) — not from colours typed into this file.
 *
 * THE GLOW MAP IS MIPPED ON ITS OWN (registry REVIEW:w1e:night-ore-glow-mip-shift). With block mipmaps on, a mask
 * taken from the SAMPLED tile reads a mip texel, the mean of nugget and stone: at the 4x4 level iron's mean glow fell
 * 61%, gold's rose 42% and diamond's 80%, so a distant diamond face bloomed harder at night and iron nearly vanished.
 * The case below measures both paths on the real chain: the baked map holds its level-0 mean at every level, and the
 * old per-texel path, computed on the same levels, still moves (the instrument sees the defect it guards).
 *
 * Mutation-Proof (2026-10-28, the glow map): recorded on the commit that added it.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   O1 the chroma mask dropped (every texel of an ore layer glows) -> the stone-matrix case
 *   O2 coal given a glow -> the table case
 *   O3 plausible-wrong: the night factor inverted (glows by day) -> the night case
 *   O4 the table shifted one layer (stone 3 would glow... or diamond would not) -> the table case
 *   O5 plausible-wrong: the GLSL's night edge drifts from the JS (0.1 -> 0.3) -> the generated-curve case (it
 *      SURVIVED the first version of this file, which text-matched the chroma constants only)
 *   and O0, an identity mutant (a comment edit in oreGlow.js, same harness and batch), SURVIVED.
 * The output line (review 2026-10-27: every case above checks a factor's DEFINITION, and each could be dropped from the
 * product with all of them green), same harness, each observed RED at "the output line multiplies every factor":
 *   O6 oreNight dropped from the product (glows by day)   O7 oreNugget dropped (the stone between the nuggets glows)
 *   O8 oreGlowK dropped (every layer glows, coal and stone included)   O9 the linear tile colour dropped
 *   and O10 plausible-wrong: the table read at layer 0 instead of this one -> "the table factor does not read this layer"
 *   and O0b, an identity mutant (a comment edit in oreGlow.js), SURVIVED.
 *
 * BLIND SPOT: nothing here renders. Whether the term reaches the linked terrain program, and what it looks like,
 * is Task 2's gate and Task 3's probe frame.
 */
const tex = sharedVoxelTextures();
const SIZE = tex.image.width;
const LAYERS = tex.image.depth;
const texels = (layer) => {
  const out = [];
  const d = tex.image.data;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const o = (layer * SIZE * SIZE + i) * 4;
    out.push([d[o], d[o + 1], d[o + 2]]);
  }
  return out;
};
const isMatrix = ([r, g, b]) => r === g && b - r >= 0 && b - r <= 3; // the ore tiles' stone: c, c, c + 3
// The factors of the ONE `totalEmissiveRadiance += a * b * ...;` line in the generated GLSL, split at top-level `*`.
const emissiveFactors = (glsl) => {
  const lines = glsl.split('\n').filter((l) => /totalEmissiveRadiance\s*\+=/.test(l));
  expect(lines.length, 'the term must add into totalEmissiveRadiance exactly once').toBe(1);
  const rhs = lines[0].match(/totalEmissiveRadiance\s*\+=\s*(.+);\s*$/)[1];
  const out = [];
  let depth = 0, cur = '';
  for (const ch of rhs) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === '*' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
};

describe('the glow table: only iron, gold and diamond, in rising order', () => {
  const t = oreGlowTable(LAYERS);
  it('is sized from the texture array and zero off the ore layers — coal included', () => {
    expect(t.length).toBe(LAYERS);
    for (let l = 0; l < LAYERS; l++) {
      if (![BLOCK_ID.iron, BLOCK_ID.gold, BLOCK_ID.diamond].includes(l)) expect(t[l], `layer ${l}`).toBe(0);
    }
    expect(t[BLOCK_ID.coal], 'coal is not luminous').toBe(0);
  });
  it('0 < iron < gold < diamond', () => {
    expect(t[BLOCK_ID.iron]).toBeGreaterThan(0);
    expect(t[BLOCK_ID.gold]).toBeGreaterThan(t[BLOCK_ID.iron]);
    expect(t[BLOCK_ID.diamond]).toBeGreaterThan(t[BLOCK_ID.gold]);
    expect(Object.keys(ORE_GLOW).length).toBe(3);
  });
});

describe('the nugget mask, over the REAL tile bytes', () => {
  for (const name of ['iron', 'gold', 'diamond']) {
    it(`${name}: every stone-matrix texel masks to 0, and the nuggets (>= 5% of the tile) to >= 0.9`, () => {
      const px = texels(BLOCK_ID[name]);
      const matrix = px.filter(isMatrix);
      const nuggets = px.filter((p) => !isMatrix(p));
      expect(matrix.length, 'the tile has a stone matrix to protect').toBeGreaterThan(SIZE * SIZE * 0.3);
      expect(nuggets.length, 'the tile has nuggets to light').toBeGreaterThan(SIZE * SIZE * 0.05);
      for (const p of matrix) expect(nuggetMask(...p), `matrix texel ${p}`).toBe(0);
      const lit = nuggets.filter((p) => nuggetMask(...p) >= 0.9).length;
      expect(lit / nuggets.length, `${name}: ${lit} of ${nuggets.length} nuggets lit`).toBeGreaterThan(0.95);
    });
  }
  it('stone (3) and coal (10) mask to 0 on every texel', () => {
    for (const layer of [BLOCK_ID.stone, BLOCK_ID.coal]) {
      const px = texels(layer);
      expect(px.length).toBe(SIZE * SIZE);
      expect(px.filter((p) => nuggetMask(...p) > 0).length, `layer ${layer}`).toBe(0);
    }
  });
});

describe('the night curve', () => {
  it('0 while the sun is up, 1 once it is down, monotonic through dusk', () => {
    expect(nightFactor(0.8)).toBe(0);
    expect(nightFactor(0.1)).toBe(0);
    expect(nightFactor(-0.15)).toBe(1);
    expect(nightFactor(-0.9)).toBe(1);
    let prev = 0;
    for (let y = 0.1; y >= -0.15; y -= 0.01) {
      const f = nightFactor(y);
      expect(f).toBeGreaterThanOrEqual(prev);
      prev = f;
    }
    expect(nightFactor(-0.02)).toBeGreaterThan(0);
    expect(nightFactor(-0.02)).toBeLessThan(1);
  });
});

describe('the glow map: baked from level 0, mipped on its own', () => {
  const glow = oreGlowTexture(tex);
  const dec = (v) => Math.pow(v / 255, 2.2);
  const lum = (d, o) => 0.2126 * dec(d[o]) + 0.7152 * dec(d[o + 1]) + 0.0722 * dec(d[o + 2]);
  // The mean glow of one ore at one level: through the baked map (new), and the old shader's way, the mask taken from
  // the SAMPLED block-texture level (old). Glow layer g holds block layer GLOW_LAYERS.first + g.
  const meanGlow = (layer, k) => {
    const g = glow.mipmaps[k], b = tex.mipmaps[k], n = g.width, gl = layer - GLOW_LAYERS.first;
    let fresh = 0, old = 0;
    for (let i = 0; i < n * n; i++) {
      const o = (layer * n * n + i) * 4;
      fresh += lum(g.data, (gl * n * n + i) * 4);
      old += lum(b.data, o) * nuggetMask(b.data[o], b.data[o + 1], b.data[o + 2]);
    }
    return { fresh: fresh / (n * n), old: old / (n * n) };
  };

  it('holds exactly the glowing layers, as one run, sampled like the block array with a level for each of its levels', () => {
    const glowing = [BLOCK_ID.iron, BLOCK_ID.gold, BLOCK_ID.diamond];
    expect(glowing.map((id) => id - GLOW_LAYERS.first)).toEqual([0, 1, 2]);
    expect(GLOW_LAYERS.count).toBe(glowing.length);
    expect([glow.image.width, glow.image.height, glow.image.depth]).toEqual([SIZE, SIZE, GLOW_LAYERS.count]);
    // prod-smoke finds the block array on the GPU as the one TEXTURE_2D_ARRAY of its dimensions.
    expect(glow.image.depth, 'the glow map has the block array\'s dimensions: prod-smoke could not tell them apart').not.toBe(LAYERS);
    expect(glow.mipmaps.length).toBe(tex.mipmaps.length);
    expect(glow.mipmaps.length).toBeGreaterThanOrEqual(6);
    for (const k of ['minFilter', 'magFilter', 'wrapS', 'wrapT']) expect(glow[k], k).toBe(tex[k]);
  });

  it('level 0 is the tile\'s linear colour times its nugget mask, texel by texel', () => {
    const d = glow.image.data, src = tex.image.data;
    let checked = 0;
    for (let g = 0; g < GLOW_LAYERS.count; g++) {
      const l = GLOW_LAYERS.first + g;
      for (let i = 0; i < SIZE * SIZE; i++) {
        const o = (l * SIZE * SIZE + i) * 4, w = (g * SIZE * SIZE + i) * 4;
        const m = nuggetMask(src[o], src[o + 1], src[o + 2]);
        for (let c = 0; c < 3; c++) {
          expect(Math.abs(dec(d[w + c]) - dec(src[o + c]) * m), `layer ${l} texel ${i} channel ${c}`).toBeLessThan(0.006);
        }
        checked++;
      }
    }
    expect(checked).toBe(3 * SIZE * SIZE);
  });

  it('every level keeps each ore\'s level-0 mean glow, where the old per-texel mask moved by 40% or more at 4x4', () => {
    let levels = 0;
    for (const name of Object.keys(ORE_GLOW)) {
      const l = BLOCK_ID[name], base = meanGlow(l, 0).fresh;
      expect(base, `${name} has no glow at level 0`).toBeGreaterThan(0.05);
      for (let k = 1; k < glow.mipmaps.length; k++) {
        const { fresh } = meanGlow(l, k);
        expect(Math.abs(fresh / base - 1), `${name} at level ${k}: mean glow ${fresh.toFixed(4)} vs level 0 ${base.toFixed(4)}`)
          .toBeLessThan(0.02);
        levels++;
      }
      const at4 = meanGlow(l, 3);
      expect(glow.mipmaps[3].width).toBe(4);
      expect(Math.abs(at4.old / base - 1), `${name}: the old path held at 4x4, so this case cannot see the defect`).toBeGreaterThan(0.4);
    }
    expect(levels).toBe(3 * (glow.mipmaps.length - 1));
  });
});

describe('the GLSL cannot drift from the JS', () => {
  it('sized from the layers, samples the glow map, adds into totalEmissiveRadiance, reads the sun', () => {
    const g = oreGlowGlsl(LAYERS);
    expect(g.decl).toMatch(new RegExp(`uniform float uOreGlow\\[${LAYERS}\\];`));
    expect(g.decl).toMatch(/uniform sampler2DArray uOreGlowTex;/);
    expect(g.apply).toMatch(/totalEmissiveRadiance \+=/);
    expect(g.apply).toMatch(/uSunDir\.y/);
  });

  it('the output line multiplies every factor — the glow-map texel, the table and the night curve', () => {
    // A factor DEFINED above is not APPLIED unless it is in this product: dropping `* oreNight` passed every other
    // case here. The expected set is written here, not read from oreGlow.js.
    const g = oreGlowGlsl(LAYERS).apply;
    const factors = emissiveFactors(g);
    expect([...factors].sort(), `the output line multiplies every factor: ${factors.join(' * ')}`).toEqual(
      ['oreGlowK', 'oreNight', 'pow(oreGlowTexel, vec3(2.2))'],
    );
    expect(g, 'the table factor does not read this layer').toMatch(
      new RegExp(`float oreGlowK = uOreGlow\\[int\\(clamp\\(layerIndex, 0\\.0, ${LAYERS - 1}\\.0\\)\\)\\];`),
    );
  });

  it('the glow texel is the glow map at this block\'s texel and layer, read outside the branch', () => {
    const g = oreGlowGlsl(LAYERS).apply;
    const at = `clamp(layerIndex - ${GLOW_LAYERS.first}.0, 0.0, ${GLOW_LAYERS.count - 1}.0)`;
    const read = g.indexOf(`vec3 oreGlowTexel = texture(uOreGlowTex, vec3(vUv.x, vUv.y, ${at})).rgb;`);
    expect(read, 'the glow texel is not the glow map at (vUv, layerIndex)').toBeGreaterThanOrEqual(0);
    expect(read, 'the glow map is sampled inside the non-uniform branch').toBeLessThan(g.indexOf('if (oreGlowK > 0.0)'));
  });

  it('the GENERATED night curve computes what its JS twin computes (the GLSL cannot drift from the tested maths)', () => {
    // Read the smoothstep back out of the generated GLSL and evaluate it: a text match on one constant cannot see the
    // other edge move (a drifted night edge survived exactly that check).
    const g = oreGlowGlsl(LAYERS).apply;
    const glslSmooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const night = g.match(/oreNight = 1\.0 - smoothstep\((-?[\d.]+), (-?[\d.]+), uSunDir\.y\)/);
    expect(night, 'the night curve is not in the generated GLSL').not.toBeNull();
    for (let y = -0.4; y <= 0.4; y += 0.01) {
      expect(1 - glslSmooth(+night[1], +night[2], y), `night at sunY ${y.toFixed(2)}`).toBeCloseTo(nightFactor(y), 2);
    }
  });
});
