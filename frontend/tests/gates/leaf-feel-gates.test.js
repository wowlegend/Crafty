import { describe, it, expect } from 'vitest';
import { BLOCK_ID } from '../../src/world/blockIds.js';
import { LEAF_LAYER, SWAY_AMP, LEAF_TRANSLUCENCY, leafSway, backLight, leafDay, leafFeelGlsl } from '../../src/world/leafFeel.js';

/**
 * LEAF SWAY + TRANSLUCENCY (plan 2026-09-23-crafty-leaf-sway-translucency, Task 1; EXTERNAL-BASELINE-R2 #2).
 *
 * The terrain program gains two leaves-only terms; every constant and curve lives in world/leafFeel.js, whose GLSL
 * is generated. This drives the JS twins over grids, and then reads the numbers back OUT of the generated GLSL and
 * evaluates them, so the shader cannot drift from what is tested here (the ore glow's night edge drifted past a
 * text-only check exactly that way).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh, each observed RED:
 *   L1 the layer gate dropped from the vertex term (every block sways) -> "the sway is not gated on the leaves layer"
 *   L2 plausible-wrong: the phase keyed on something that jumps per block (x10) -> "neighbours 1 m apart diverge"
 *   L3 plausible-wrong: the back-light sign flipped (glows with the sun BEHIND the viewer) -> the lobe case
 *   L4 plausible-wrong: the GLSL amplitude drifts from the JS (0.04 -> 0.4) -> the generated-sway case
 *   L5 the day factor inverted (leaves glow at night) -> the day case
 *   and L0, an identity mutant (a comment edit in leafFeel.js, same harness and batch), SURVIVED.
 * The output line (review 2026-10-27: the cases above check each factor's DEFINITION, and each could be dropped from
 * the product with all of them green), same harness, each observed RED at "the output line multiplies every factor":
 *   L6 leafDay dropped from the product (leaves glow at night)   L7 leafBack dropped (glow whatever the view)
 *   L8 the strength dropped   L9 the warm tint dropped   L10 the linear leaf colour dropped
 *   and L0b, an identity mutant (a comment edit in leafFeel.js), SURVIVED.
 *
 * BLIND SPOT: nothing here renders. That the terms reach the linked terrain program is the structural gate in
 * far-field-gates; how a canopy LOOKS is the plan's Task 3 frames.
 */
const smooth = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };
const num = (re, s) => { const m = s.match(re); expect(m, `not in the generated GLSL: ${re}`).not.toBeNull(); return m.slice(1).map(Number); };

describe('leafSway — small, smooth across neighbours, moving', () => {
  it('never moves a vertex more than SWAY_AMP on either axis', () => {
    let max = 0;
    for (let x = -40; x <= 40; x += 3) for (let y = 0; y <= 60; y += 5) for (let z = -40; z <= 40; z += 3) for (let t = 0; t < 20; t += 0.7) {
      const [dx, dz] = leafSway(x, y, z, t);
      max = Math.max(max, Math.abs(dx), Math.abs(dz));
    }
    expect(max, 'a leaf moved further than the amplitude bound').toBeLessThanOrEqual(SWAY_AMP + 1e-9);
    expect(max, 'the sway never moved anything').toBeGreaterThan(SWAY_AMP * 0.9);
    expect(SWAY_AMP, 'the seam against a trunk face would open visibly').toBeLessThanOrEqual(0.05);
  });

  it('neighbours 1 m apart move by nearly the same vector — a merged canopy bends as a mass, never shears', () => {
    let worstXZ = 0, worstY = 0;
    for (let x = -20; x <= 20; x += 1.7) for (let y = 10; y <= 40; y += 3.1) for (let z = -20; z <= 20; z += 1.9) for (let t = 0; t < 12; t += 0.9) {
      const a = leafSway(x, y, z, t);
      for (const [bx, by, bz, isY] of [[x + 1, y, z, false], [x, y, z + 1, false], [x, y + 1, z, true]]) {
        const b = leafSway(bx, by, bz, t);
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (isY) worstY = Math.max(worstY, d); else worstXZ = Math.max(worstXZ, d);
      }
    }
    expect(worstXZ, 'neighbours 1 m apart diverge horizontally').toBeLessThan(SWAY_AMP / 4);
    expect(worstY, 'neighbours 1 m apart diverge vertically').toBeLessThan(SWAY_AMP / 2);
  });

  it('moves over time', () => {
    const a = leafSway(5, 20, 7, 0), b = leafSway(5, 20, 7, 1.5);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1]), 'the canopy is frozen').toBeGreaterThan(SWAY_AMP * 0.2);
  });
});

describe('translucency — only looking into the sun, only by day', () => {
  it('the lobe is 1 looking straight into the sun and 0 side-on or with the sun behind', () => {
    expect(backLight(1)).toBeCloseTo(1, 6);
    expect(backLight(0)).toBe(0);
    expect(backLight(-1), 'the leaves glow with the sun BEHIND the viewer').toBe(0);
    expect(backLight(0.9)).toBeGreaterThan(backLight(0.5));
  });
  it('the day factor is 0 at night and 1 with the sun up, rising through dawn', () => {
    expect(leafDay(-0.4), 'the leaves glow at night').toBe(0);
    expect(leafDay(0.6), 'the leaves never glow by day').toBe(1);
    expect(leafDay(0.05)).toBeGreaterThan(0);
    expect(leafDay(0.05)).toBeLessThan(1);
  });
});

describe('the generated GLSL computes what the JS twins compute', () => {
  const g = leafFeelGlsl();

  it('both terms are gated on the leaves layer, and the leaves layer is block 7', () => {
    expect(LEAF_LAYER).toBe(BLOCK_ID.leaves);
    expect(g.vertex, 'the sway is not gated on the leaves layer').toMatch(new RegExp(`^if \\(abs\\(color\\.r - ${LEAF_LAYER}\\.000\\) < 0\\.5\\) \\{`));
    expect(g.fragment, 'the glow is not gated on the leaves layer').toMatch(new RegExp(`^if \\(abs\\(layerIndex - ${LEAF_LAYER}\\.000\\) < 0\\.5\\) \\{`));
    expect(g.vertexDecl).toBe('uniform float uTime;');
    expect(g.fragment).toMatch(/totalEmissiveRadiance \+=/);
  });

  it('the sway, rebuilt from the GLSL numbers, matches leafSway', () => {
    const [k1] = num(/leafP = \(leafW\.x \+ leafW\.y\) \* ([\d.]+);/, g.vertex);
    const [k2] = num(/leafQ = \(leafW\.z - leafW\.y\) \* ([\d.]+);/, g.vertex);
    const [ax, wx] = num(/transformed\.x \+= ([\d.]+) \* sin\(uTime \* ([\d.]+) \+ leafP \+ leafQ\);/, g.vertex);
    const [az, wz] = num(/transformed\.z \+= ([\d.]+) \* sin\(uTime \* ([\d.]+) \+ leafP - leafQ\);/, g.vertex);
    for (const [x, y, z, t] of [[0, 0, 0, 0], [3.5, 22, -8, 1.2], [-17, 40, 31, 7.7], [100, 5, -60, 13.3]]) {
      const p = (x + y) * k1, q = (z - y) * k2;
      const [dx, dz] = leafSway(x, y, z, t);
      expect(ax * Math.sin(t * wx + p + q), `x at ${[x, y, z, t]}`).toBeCloseTo(dx, 4);
      expect(az * Math.sin(t * wz + p - q), `z at ${[x, y, z, t]}`).toBeCloseTo(dz, 4);
    }
  });

  it('the lobe power and the day edges, read from the GLSL, match backLight and leafDay', () => {
    const [pw] = num(/cameraPosition\), normalize\(uSunDir\)\), 0\.0\), ([\d.]+)\);/, g.fragment);
    const [lo, hi] = num(/leafDay = smoothstep\((-?[\d.]+), (-?[\d.]+), uSunDir\.y\);/, g.fragment);
    for (let d = -1; d <= 1; d += 0.05) expect(Math.pow(Math.max(d, 0), pw)).toBeCloseTo(backLight(d), 5);
    for (let y = -0.5; y <= 0.5; y += 0.01) expect(smooth(lo, hi, y)).toBeCloseTo(leafDay(y), 3);
  });

  it('the output line multiplies every factor — the colour, the tint, the strength, the lobe and the day', () => {
    // A factor DEFINED above and tested against its twin is not APPLIED unless it is in this product: dropping
    // `* leafDay` passed every other case here. The expected factors are written here, not read from leafFeel.js.
    const lines = g.fragment.split('\n').filter((l) => /totalEmissiveRadiance\s*\+=/.test(l));
    expect(lines.length, 'the term must add into totalEmissiveRadiance exactly once').toBe(1);
    const rhs = lines[0].match(/totalEmissiveRadiance\s*\+=\s*(.+);\s*$/)[1];
    const factors = [];
    let depth = 0, cur = '';
    for (const ch of rhs) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
      if (ch === '*' && depth === 0) { factors.push(cur.trim()); cur = ''; } else cur += ch;
    }
    factors.push(cur.trim());
    const why = `the output line multiplies every factor: ${factors.join(' * ')}`;
    expect(factors.length, why).toBe(5);
    for (const f of ['pow(texColor.rgb, vec3(2.2))', LEAF_TRANSLUCENCY.toFixed(3), 'leafBack', 'leafDay']) expect(factors, why).toContain(f);
    const tint = factors.find((f) => /^vec3\(/.test(f));
    expect(tint, why).toBeDefined();
    const [r, gg, b] = num(/^vec3\(([\d.]+), ([\d.]+), ([\d.]+)\)$/, tint);
    expect(r >= gg && gg >= b && b > 0 && r <= 1, `${why} — the tint is not a warm light (${tint})`).toBe(true);
  });
});
