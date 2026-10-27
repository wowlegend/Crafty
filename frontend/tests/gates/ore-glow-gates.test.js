import { describe, it, expect } from 'vitest';
import { sharedVoxelTextures } from '../../src/world/proceduralTextures.js';
import { BLOCK_ID } from '../../src/world/blockIds.js';
import { ORE_GLOW, NUGGET_CHROMA, oreGlowTable, nuggetMask, nightFactor, oreGlowGlsl } from '../../src/world/oreGlow.js';

/**
 * EMISSIVE ORES (plan 2026-09-23-crafty-emissive-ores, Task 1; EXTERNAL-BASELINE-R2 #3).
 *
 * At night an ore's NUGGETS glow in their own colour; the stone between them, every other block, and every day
 * frame stay exactly as they are. The terrain shader's term is `linear(tex) x table[layer] x nugget(tex) x night`,
 * and every factor is built here: the table and the night curve as plain numbers, the nugget mask as a JS twin of
 * the GLSL, evaluated over the REAL tile bytes the terrain samples — not over colours typed into this file.
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   O1 the chroma mask dropped (every texel of an ore layer glows) -> the stone-matrix case
 *   O2 coal given a glow -> the table case
 *   O3 plausible-wrong: the night factor inverted (glows by day) -> the night case
 *   O4 the table shifted one layer (stone 3 would glow... or diamond would not) -> the table case
 *   O5 plausible-wrong: the GLSL's night edge drifts from the JS (0.1 -> 0.3) -> the generated-curve case (it
 *      SURVIVED the first version of this file, which text-matched the chroma constants only)
 *   and O0, an identity mutant (a comment edit in oreGlow.js, same harness and batch), SURVIVED.
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

describe('the GLSL cannot drift from the JS', () => {
  it('sized from the layers, adds into totalEmissiveRadiance, and carries the JS thresholds', () => {
    const g = oreGlowGlsl(LAYERS);
    expect(g.decl).toMatch(new RegExp(`uniform float uOreGlow\\[${LAYERS}\\];`));
    expect(g.apply).toMatch(/totalEmissiveRadiance \+=/);
    expect(g.apply).toContain(NUGGET_CHROMA[0].toFixed(3));
    expect(g.apply).toContain(NUGGET_CHROMA[1].toFixed(3));
    expect(g.apply).toMatch(/uSunDir\.y/);
  });

  it('the GENERATED shader curves compute what the JS twins compute (the GLSL cannot drift from the tested maths)', () => {
    // Read the two smoothsteps back out of the generated GLSL and evaluate them — a text match on one constant
    // cannot see the other edge move (a drifted night edge survived exactly that check).
    const g = oreGlowGlsl(LAYERS).apply;
    const glslSmooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const night = g.match(/oreNight = 1\.0 - smoothstep\((-?[\d.]+), (-?[\d.]+), uSunDir\.y\)/);
    const nugget = g.match(/oreNugget = smoothstep\((-?[\d.]+), (-?[\d.]+), oreChroma\)/);
    expect(night, 'the night curve is not in the generated GLSL').not.toBeNull();
    expect(nugget, 'the nugget mask is not in the generated GLSL').not.toBeNull();
    for (let y = -0.4; y <= 0.4; y += 0.01) {
      expect(1 - glslSmooth(+night[1], +night[2], y), `night at sunY ${y.toFixed(2)}`).toBeCloseTo(nightFactor(y), 2);
    }
    for (let c = 0; c <= 255; c += 5) {
      expect(glslSmooth(+nugget[1], +nugget[2], c / 255), `nugget at chroma ${c}`).toBeCloseTo(nuggetMask(c, 0, 0), 2);
    }
  });
});
