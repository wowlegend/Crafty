import { describe, it, expect } from 'vitest';
import {
  hash01,
  bladeTransform,
  bladeTint,
  YAW_MAX,
  SCALE_MIN,
  SCALE_MAX,
  JITTER_MAX,
  BLADE_HEIGHT,
  BASE_TINT
} from './grassVariation.js';

// The grass lattice these run on: world/grassField.js emits bare integer min-corners at `stride = 2`,
// capped at 50 per chunk, spanning roughly -1024..1024 on both axes. So the sweep below is the real
// input domain, negatives included — not a convenience range.
const LATTICE = [];
for (let x = -1024; x <= 1024; x += 2) LATTICE.push(x);

const sweep = (fn) => {
  for (const x of LATTICE) for (const z of [-512, -2, 0, 2, 514]) fn(x, z);
};

describe('hash01 — deterministic, bounded, and NOT diagonally symmetric', () => {
  it('is stable across calls (capture-determinism invariant 3: no RNG, no clock)', () => {
    sweep((x, z) => {
      expect(hash01(x, z, 1)).toBe(hash01(x, z, 1));
    });
  });

  it('stays in [0,1) over the whole lattice INCLUDING negative coords', () => {
    // The naive `fract(sin(dot(p, k)) * 43758.5453)` hash is the one that leaks here: JS `%` keeps the
    // sign of the dividend, so a negative x yields a negative "01" value and the blade gets a negative
    // scale — a mesh flipped inside out, on exactly half the world.
    sweep((x, z) => {
      for (const salt of [0, 1, 2, 3]) {
        const h = hash01(x, z, salt);
        expect(Number.isFinite(h)).toBe(true);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(1);
      }
    });
  });

  it('separates ADJACENT lattice cells on both axes (the point of the whole slice)', () => {
    // Neighbours are 2 apart, not 1. A hash that only decorrelates at distance 1 leaves the grid
    // visible at the spacing the grid actually has.
    //
    // Asserted as a MEAN, deliberately. The obvious version — "the smallest adjacent difference
    // exceeds 0.005" — is a flaky test dressed as a strict one: for two independent uniforms
    // P(|a-b| < 0.005) ~= 1%, so over 400 adjacent pairs a *correct* hash produces about four
    // violations every run. It would have failed here roughly as often as it passed, and the fix
    // would have looked like loosening a threshold. E|a-b| = 1/3 for uniforms, so 0.25 is a real
    // floor that a correlated hash (mean -> 0) cannot clear.
    const meanGap = (pick) => {
      let sum = 0;
      const xs = LATTICE.slice(0, 400);
      for (const x of xs) sum += Math.abs(pick(x) - pick(x + 2));
      return sum / xs.length;
    };
    expect(meanGap((x) => hash01(x, 0, 1))).toBeGreaterThan(0.25);
    expect(meanGap((x) => hash01(0, x, 1))).toBeGreaterThan(0.25);
  });

  it('is NOT symmetric in (x,z) — a symmetric hash re-creates the diagonal it exists to break', () => {
    // The shader phase this replaces was `x*0.5 + z*0.5`, which is constant along every x+z diagonal.
    // If hash01(a,b) === hash01(b,a) the new phase inherits a mirror of the same artifact.
    let same = 0;
    for (const x of LATTICE.slice(0, 200)) if (hash01(x, 6, 1) === hash01(6, x, 1)) same++;
    expect(same).toBe(0);
  });

  it('decorrelates across salts, so yaw/scale/jitter are not the same number three times', () => {
    let collisions = 0;
    for (const x of LATTICE.slice(0, 200)) {
      if (hash01(x, 4, 0) === hash01(x, 4, 1)) collisions++;
      if (hash01(x, 4, 1) === hash01(x, 4, 2)) collisions++;
    }
    expect(collisions).toBe(0);
  });
});

describe('bladeTransform — placement, with base-anchoring as the load-bearing invariant', () => {
  // WHY THIS IS THE ASSERTION THAT MATTERS. The tuft geometry is a planeGeometry(0.4, 0.7) centred on
  // its own origin, so the renderer lifts it by half its height to stand the BASE on the grass surface.
  // The moment a per-instance scale exists, that half-height is no longer a constant: a scaled blade is
  // 0.7*s tall but still centred at y + 0.35, so its base lands at y + 0.35 - 0.35*s. At s = 1.28 the
  // blade sinks ~10cm into opaque terrain; at s = 0.82 it floats ~6cm above the dirt it grows from.
  // Neither throws, neither reds a gate, and both look like "the grass is a bit off".
  it('keeps every blade BASE exactly on the grass surface, at every scale', () => {
    sweep((x, z) => {
      const t = bladeTransform(x, 40, z);
      const base = t.py - (BLADE_HEIGHT / 2) * t.scale;
      expect(base).toBeCloseTo(40, 9);
    });
  });

  it('yaw covers [0, PI) — half-turn, because a DoubleSide plane repeats above PI', () => {
    let lo = Infinity;
    let hi = -Infinity;
    sweep((x, z) => {
      const { yaw } = bladeTransform(x, 40, z);
      expect(yaw).toBeGreaterThanOrEqual(0);
      expect(yaw).toBeLessThan(YAW_MAX);
      lo = Math.min(lo, yaw);
      hi = Math.max(hi, yaw);
    });
    // actually USES the range rather than pinning to one end
    expect(lo).toBeLessThan(0.2);
    expect(hi).toBeGreaterThan(YAW_MAX - 0.2);
  });

  it('scale stays inside the readable band (no bushes, no specks)', () => {
    sweep((x, z) => {
      const { scale } = bladeTransform(x, 40, z);
      expect(scale).toBeGreaterThanOrEqual(SCALE_MIN);
      expect(scale).toBeLessThanOrEqual(SCALE_MAX);
    });
  });

  it('sub-cell jitter cannot reach the neighbouring lattice cell', () => {
    // stride is 2m and the blade is 0.4m wide; a jitter that exceeds half the spacing turns
    // de-gridding into clumping, which is a worse artifact than the grid.
    expect(JITTER_MAX).toBeLessThan(1);
    sweep((x, z) => {
      const t = bladeTransform(x, 40, z);
      expect(Math.abs(t.px - x)).toBeLessThanOrEqual(JITTER_MAX);
      expect(Math.abs(t.pz - z)).toBeLessThanOrEqual(JITTER_MAX);
    });
  });

  it('is a pure function of (x,y,z) — same input, same transform', () => {
    const a = bladeTransform(6, 41, -8);
    const b = bladeTransform(6, 41, -8);
    expect(a).toEqual(b);
  });
});

describe('bladeTint — VARIATION inside the locked palette, not a recolour', () => {
  // The palette swap is S9's owner decision (a 3-swatch ladder for Kevin). S8 must not pre-empt it by
  // drifting the mean, so "the mean does not move" is an executable boundary, not a note in a doc.
  //
  // THE TRAP THIS ENCODES: `instanceColor` MULTIPLIES, it does not replace. three folds it in at
  // color_vertex.glsl.js:18 (`vColor.xyz *= instanceColor.xyz`) and consumes it at
  // color_fragment.glsl.js (`diffuseColor.rgb *= vColor`) — and the fragment-side USE_COLOR that
  // gates the read comes from WebGLProgram.js:796, which ORs in `instancingColor`, which is why no
  // `vertexColors: true` is needed. So the natural-looking `setColorAt(i, new Color('#4a7c59'))`
  // squares the base colour and renders the grass near-black. BASE_TINT is 1.0 on every channel.
  it('holds the channel means within 1% of the neutral multiplier', () => {
    let n = 0;
    const sum = { r: 0, g: 0, b: 0 };
    sweep((x, z) => {
      const t = bladeTint(x, z);
      sum.r += t.r;
      sum.g += t.g;
      sum.b += t.b;
      n++;
    });
    for (const c of ['r', 'g', 'b']) {
      expect(sum[c] / n).toBeCloseTo(BASE_TINT[c], 2);
    }
  });

  it('actually varies (a constant tint would pass the mean test above)', () => {
    const seen = new Set();
    sweep((x, z) => {
      const t = bladeTint(x, z);
      seen.add(`${t.r.toFixed(4)},${t.g.toFixed(4)},${t.b.toFixed(4)}`);
    });
    expect(seen.size).toBeGreaterThan(100);
  });

  it('stays inside the multiplier band on every channel', () => {
    // This assertion originally read `<= 1`, from the draft written before the multiply above was
    // traced — i.e. it bounded the tint as if it were a COLOUR. It is not: 1.04 is a blade 4% brighter
    // than the palette, which is the entire point. Replaced with the band the multiplier actually has,
    // which is a strictly tighter claim than [0,1] was, not a looser one: [0,1] would have waved
    // through a channel that dropped to 0.02 and rendered a black blade.
    const MAX = 0.11; // TINT_VALUE 0.07 + TINT_HUE 0.04, both at full swing
    sweep((x, z) => {
      const t = bladeTint(x, z);
      for (const c of ['r', 'g', 'b']) {
        expect(t[c]).toBeGreaterThanOrEqual(1 - MAX);
        expect(t[c]).toBeLessThanOrEqual(1 + MAX);
      }
    });
  });
});
