import { describe, it, expect } from 'vitest';
import { biomeTintGlsl, biomeTintMask, BIOME_TINTED_BLOCKS } from '../../src/world/terrainTint.js';
import { BIOME_NAMES, BIOME_TINT } from '../../src/world/biomeTable.js';
import { BLOCK_ID } from '../../src/world/blockIds.js';

/**
 * WHICH BLOCKS TAKE THE BIOME TINT, AND HOW MANY BIOMES THE SHADER CAN INDEX (QUEUE R1.5, R1.6).
 *
 * R1.5: the tint multiplied every opaque block — stone, ores, wood, player builds, cave walls far below a
 *       jungle. It now applies only to the natural surface blocks named in BIOME_TINTED_BLOCKS.
 * R1.6: the shader declared `uBiomeTint[10]` and clamped the index to 9.0 as literals, so an eleventh biome
 *       would read the tenth's tint on the ground while the grass blades (indexing the JS table) did not.
 *
 * Terrain.jsx cannot be imported under node, which is why both defects sat unreached: the GLSL and the
 * mask are built in world/terrainTint.js now, and this drives them. The shader COMPILING is not provable
 * here — that needs a browser (see the commit's visual check).
 *
 * Mutation-Proof: via scripts/dev/mutate.sh against src/world/terrainTint.js, each observed RED:
 *   M1 the array size typed back to 10                   -> sizing RED (driven with 11 biomes)
 *   M2 the clamp typed back to 9.0                       -> sizing RED
 *   M3 plausible-wrong: stone added to the tinted set    -> mask RED
 *   M4 plausible-wrong: the mask ignored in apply (multiply by the tint unconditionally) -> apply RED
 *   M5 the mask indexed by BIOME instead of layer        -> apply RED
 */
describe('R1.5 — only the natural surface blocks take a biome tint', () => {
  const mask = biomeTintMask(16);

  it('grass, dirt, sand, snow and leaves are tinted', () => {
    for (const b of ['grass', 'dirt', 'sand', 'snow', 'leaves']) expect(mask[BLOCK_ID[b]], b).toBe(1);
  });

  it('stone, wood, cactus and every ore keep their own colour', () => {
    for (const b of ['stone', 'wood', 'cactus', 'coal', 'iron', 'gold']) expect(mask[BLOCK_ID[b]], b).toBe(0);
  });

  it('the mask is exactly the declared set — no block tinted by accident', () => {
    const on = [...mask].map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
    expect(on.sort((a, b) => a - b)).toEqual(BIOME_TINTED_BLOCKS.map((b) => BLOCK_ID[b]).sort((a, b) => a - b));
    expect(on.length).toBe(BIOME_TINTED_BLOCKS.length);
  });
});

describe('R1.6 — the shader is sized from the biome table, not from a literal', () => {
  it('the default size is BIOME_NAMES, and it agrees with the JS tint table', () => {
    const g = biomeTintGlsl();
    expect(g.decl).toContain(`uniform vec3 uBiomeTint[${BIOME_NAMES.length}];`);
    expect(BIOME_TINT.length / 3).toBe(BIOME_NAMES.length);
  });

  it('an ELEVENTH biome is addressable — the case the literal [10] / 9.0 could not serve', () => {
    const g = biomeTintGlsl(11, 16);
    expect(g.decl).toContain('uniform vec3 uBiomeTint[11];');
    expect(g.apply).toContain('clamp(vBiome, 0.0, 10.0)');
  });

  it('the mask is indexed by the texture LAYER and gates the multiply', () => {
    const g = biomeTintGlsl(10, 16);
    expect(g.decl).toContain('uniform float uBiomeTintMask[16];');
    expect(g.apply).toContain('uBiomeTintMask[int(clamp(layerIndex, 0.0, 15.0))]');
    expect(g.apply).toMatch(/mix\(vec3\(1\.0\), uBiomeTint\[[^\]]+\], biomeTintOn\)/);
  });
});
