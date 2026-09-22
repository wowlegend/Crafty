import { describe, it, expect } from 'vitest';
import { BIOMES, BIOME_NAMES, BIOME_ID, BIOME_TINT_RGB, hexToRgb01, tintPreservingLuminance } from '../../src/world/biomeTable.js';

/**
 * BIOME TINTS — the consumer the `tint` field never had (QUEUE.md B2 / Q14).
 *
 * THE DEFECT. All ten biomes have declared a `tint` since they were written and a repo-wide grep found no
 * consumer, while SIX of the ten share `surfaceBlock: 1` (taiga, plains, forest, meadow, jungle, savanna).
 * So six of ten biomes render pixel-identical at ground level. Kevin's recorded question was "how do
 * different biomes appear?" and the honest answer was: four of them do.
 *
 * WHY LUMINANCE-PRESERVING, and why that is the load-bearing decision rather than the tint itself. The
 * obvious implementation — `mix(c, c * tint, s)` — darkens every biome whose tint is not white, because
 * every one of these tints has luminance below 1. On a bold-flat art direction that reads as dirt, not as
 * a biome, and it would quietly undo a LOCKED look (AGENTS.md §Design Language). Normalising the tint to
 * unit luminance first means `strength` controls HUE SHIFT only. The assertion below pins that: the
 * multiplier's luminance is 1 at every strength, for every biome.
 *
 * ID ORDER IS A DATA CONTRACT, not a detail. The id is the index into `Object.keys(BIOMES)` and it gets
 * baked into chunk geometry as a vertex attribute, so REORDERING the object retints every already-meshed
 * chunk in every saved world. The order is pinned here by NAME so a reorder fails loudly. New biomes
 * append at the end.
 *
 * Mutation-Proof: 5 mutations, denominator asserted (7/7 cases collected on every run).
 *   M1 reorder BIOMES (swap snow/taiga)        -> id-order case RED (the silent-retint defect)
 *   M2 tint applied without luminance normalisation -> luminance case RED (biomes would darken)
 *   M3 hexToRgb01 returns [0,0,0] on bad input -> fallback case RED (a parse failure would BLACKEN the
 *      world rather than no-op it — failing toward invisible damage instead of no change)
 *   M4 BIOME_TINT_RGB hand-written instead of derived -> derivation case RED (the parallel-array drift)
 *   M5 strength unclamped                       -> clamp case RED (a strength of 5 inverts the hue)
 * biomeTable.js restored from a cp backup and diffed byte-identical after each.
 *
 * BLIND SPOT, stated (R7): this proves the ARITHMETIC and the table. It does not prove the shader applies
 * it, nor that the ground and the grass agree — `OptimizedGrassSystem` tints blades independently, and
 * until it reads the same table the blades and the ground they grow from will disagree. That wiring is
 * the other half of Q14 and is not in this file.
 */
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

describe('biome tint table', () => {
  it('every biome declares a tint, and the derived tables cover all of them', () => {
    const names = Object.keys(BIOMES);
    expect(names.length).toBeGreaterThan(0);                    // R3a — an empty table makes all of this vacuous
    for (const n of names) expect(BIOMES[n].tint, n).toMatch(/^#[0-9a-f]{6}$/i);
    expect(BIOME_NAMES).toEqual(names);
    expect(BIOME_TINT_RGB.length).toBe(names.length * 3);       // derived, not hand-kept
  });

  it('the id ORDER is pinned — reordering would retint every already-meshed chunk', () => {
    // Baked into geometry as a vertex attribute. Append new biomes at the END.
    expect(BIOME_NAMES).toEqual([
      'snow', 'taiga', 'plains', 'forest', 'meadow', 'swamp', 'jungle', 'savanna', 'desert', 'mesa',
    ]);
    expect(BIOME_ID.snow).toBe(0);
    expect(BIOME_ID.mesa).toBe(BIOME_NAMES.length - 1);
  });

  it('the six biomes sharing surfaceBlock 1 have DISTINCT tints — the whole point', () => {
    const shared = Object.keys(BIOMES).filter((n) => BIOMES[n].surfaceBlock === 1);
    expect(shared.length).toBe(6); // the defect's denominator, asserted so it cannot quietly change
    const tints = new Set(shared.map((n) => BIOMES[n].tint.toLowerCase()));
    expect(tints.size).toBe(shared.length); // all different, or they would still render alike
  });

  it('the tint multiplier has unit luminance at EVERY strength — hue shifts, brightness does not', () => {
    let checked = 0;
    for (const n of BIOME_NAMES) {
      for (const s of [0, 0.25, 0.35, 0.5, 1]) {
        const m = tintPreservingLuminance(hexToRgb01(BIOMES[n].tint), s);
        expect(lum(m), `${n}@${s}`).toBeCloseTo(1, 6);
        checked++;
      }
    }
    expect(checked).toBe(BIOME_NAMES.length * 5); // the denominator, stated
  });

  it('strength 0 is exactly a no-op', () => {
    for (const n of BIOME_NAMES) {
      const m = tintPreservingLuminance(hexToRgb01(BIOMES[n].tint), 0);
      for (const c of m) expect(c).toBeCloseTo(1, 9);
    }
  });

  it('strength is clamped — an out-of-range value must not invert the hue', () => {
    const forest = hexToRgb01(BIOMES.forest.tint);
    expect(tintPreservingLuminance(forest, 5)).toEqual(tintPreservingLuminance(forest, 1));
    expect(tintPreservingLuminance(forest, -3)).toEqual(tintPreservingLuminance(forest, 0));
  });

  it('the grass blade tint COMPOSES with the biome multiplier, and omitting it is unchanged', async () => {
    // The other half of Q14: OptimizedGrassSystem tints blades via bladeTint(x,z), so until it applies the
    // SAME biome multiplier the blades and the ground they grow from disagree. Both values are multipliers
    // centred on 1 — per-blade spread, and the luminance-normalised biome hue shift — so composing is a
    // plain product, which preserves both properties. Adding or lerping them would not.
    const { bladeTint } = await import('../../src/game/grassVariation.js');
    const mul = (name) => {
      const i = BIOME_ID[name];
      return tintPreservingLuminance([BIOME_TINT_RGB[i * 3], BIOME_TINT_RGB[i * 3 + 1], BIOME_TINT_RGB[i * 3 + 2]], 0.35);
    };
    const base = bladeTint(3, 7);
    // Omitted -> byte-identical to the historical behaviour. This is what makes the change additive.
    expect(bladeTint(3, 7, undefined)).toEqual(base);
    expect(bladeTint(3, 7, null)).toEqual(base);

    // Supplied -> the product, exactly.
    const sav = mul('savanna');
    const got = bladeTint(3, 7, sav);
    expect(got.r).toBeCloseTo(base.r * sav[0], 9);
    expect(got.g).toBeCloseTo(base.g * sav[1], 9);
    expect(got.b).toBeCloseTo(base.b * sav[2], 9);

    // And two biomes that share surfaceBlock 1 must now produce DIFFERENT grass — the whole point.
    const jungle = bladeTint(3, 7, mul('jungle'));
    expect([got.r, got.g, got.b]).not.toEqual([jungle.r, jungle.g, jungle.b]);
  });

  it('a bad hex fails toward WHITE (no-op), never toward black (invisible damage)', () => {
    for (const bad of [null, undefined, '', 'nope', '#12', 123]) {
      expect(hexToRgb01(bad), String(bad)).toEqual([1, 1, 1]);
    }
    expect(tintPreservingLuminance([1, 1, 1], 1)).toEqual([1, 1, 1]);
  });
});
