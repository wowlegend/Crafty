import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const SRC = readFileSync(resolve(process.cwd(), 'src/render/spellVfx.jsx'), 'utf8');
describe('W2-T4 spellVfx renders distinct per-element geometry', () => {
  it('handles the new sigil silhouette (arcane rotating orb)', () => { expect(SRC).toMatch(/case 'sigil'/); });
  it('the bolt silhouette is jagged/forked, not a plain cylinder', () => { expect(SRC).toMatch(/fork|jagged|seg/i); });
  it('the trail varies per element (not one shared cylinder)', () => { expect(SRC).toMatch(/profile\.trail|energy\.trail|\.trail/); });
  it('the impact varies per element (per-element impact geometry)', () => { expect(SRC).toMatch(/energy\.impact|profile\.impact|\.impact/); });
});

// v7-S3.4: fire is an upward TEARDROP (spellGeometry.buildFireTeardrop), not a symmetric icosahedron ball.
import { ENERGY_PROFILE } from '../../src/game/spellVisualProfiles.js';
describe('v7-S3.4 fire teardrop silhouette', () => {
  it("fireball declares shape 'teardrop' (was 'sphere')", () => {
    expect(ENERGY_PROFILE.fireball.shape).toBe('teardrop');
  });
  it('spellVfx renders the prebuilt FIRE_TEARDROP geometry for the teardrop case', () => {
    expect(SRC).toMatch(/case 'teardrop'/);
    expect(SRC).toMatch(/buildFireTeardrop/);
    expect(SRC).toMatch(/geometry=\{FIRE_TEARDROP\}/);
  });
});

// v7-S3.5: ice = a SOLID faceted shard cluster (buildIceShards), NON-additive body + inverted-hull
// edge-bloom rim -- not the additive glow-ball it shared with fire.
describe('v7-S3.5 ice solid shard cluster', () => {
  it("iceball declares shape 'shards' (was 'crystal') + glowShape 'none' (no additive halo)", () => {
    expect(ENERGY_PROFILE.iceball.shape).toBe('shards');
    expect(ENERGY_PROFILE.iceball.glowShape).toBe('none');
  });
  it('spellVfx renders the prebuilt ICE_SHARDS for the shards case', () => {
    expect(SRC).toMatch(/case 'shards'/);
    expect(SRC).toMatch(/buildIceShards/);
    expect(SRC).toMatch(/geometry=\{ICE_SHARDS\}/);
  });
  it('the ice body is NON-additive (depthWrite) with an inverted-hull BackSide rim', () => {
    expect(SRC).toMatch(/THREE\.BackSide/);
    // the body uses a standard (lit, non-additive) material, not AdditiveBlending
    const shardsIdx = SRC.indexOf("case 'shards'");
    const window = SRC.slice(shardsIdx, shardsIdx + 900);
    expect(window).toMatch(/meshStandardMaterial/);
    expect(window).toMatch(/depthWrite/);
  });
});

// v7-S3.6: lightning is a THIN hot ADDITIVE wire (not fat lit cylinders) + a white core filament.
describe('v7-S3.6 lightning thin additive wire', () => {
  it('the bolt segments use additive meshBasic (a hot wire), not lit meshStandard', () => {
    const boltIdx = SRC.indexOf("case 'bolt'");
    const window = SRC.slice(boltIdx, boltIdx + 1200);
    expect(window).toMatch(/meshBasicMaterial/);
    expect(window).toMatch(/AdditiveBlending/);
    // the bolt no longer uses the fat lit standard material for its segments
    expect(window).not.toMatch(/emissiveIntensity=\{profile\.glowIntensity\}/);
  });
});

// v7-S3.7: arcane is a layered rune-WHEEL (2 concentric rings + orbiting motes) + DUOTONE (cyan accent).
describe('v7-S3.7 arcane rune-wheel + duotone', () => {
  it('the sigil has a second concentric ring + orbiting motes using the cyan accent (midColor)', () => {
    const sigilIdx = SRC.indexOf("case 'sigil'");
    const window = SRC.slice(sigilIdx, SRC.indexOf("case 'teardrop'", sigilIdx)); // the whole sigil case
    expect(window).toMatch(/profile\.midColor/);          // the cyan duotone accent is used
    expect(window).toMatch(/mote-/);                       // orbiting glyph motes
    expect((window.match(/torusGeometry/g) || []).length).toBeGreaterThanOrEqual(2); // 2 concentric rings
  });
});
