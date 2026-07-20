import { describe, it, expect } from 'vitest';
import { oceanVisibleNear, OCEAN_SAMPLE_RADIUS } from './oceanVisibility.js';
import { SEA_LEVEL } from './oceanProfile.js';

// B8 (18-domain review): the ocean plane (render/Ocean.jsx) follows the camera at SEA_LEVEL and covers a
// ~110m radius, but it renders (and CPU-recomputes ~9.4k Gerstner vertices) EVERY frame regardless of where
// the player is -- so ~1.1km inland it burns ~14% of the frame budget on a plane buried under the terrain,
// and inside an inland cave it renders THROUGH the cave walls. This pure predicate samples the surface
// height at the camera + a ring and returns whether the ocean CAN be visible (any column at/below sea level
// within reach), so the component can skip both the render and the wave recompute when it can't.
//
// MUTATION-PROOF: change the `<= seaLevel` comparison to `< seaLevel - 9999` (never water) and the
// "water present -> visible" cases go RED (they return false).

const seaLevel = SEA_LEVEL; // 28

describe('oceanVisibleNear (B8 ocean-visibility gate)', () => {
  it('all-land surroundings (inland / inland cave) -> NOT visible', () => {
    const allLand = () => 49; // every sampled column is high inland ground, well above sea level
    expect(oceanVisibleNear(0, 0, allLand, OCEAN_SAMPLE_RADIUS, seaLevel)).toBe(false);
  });

  it('water at the camera column (standing at the coast) -> visible', () => {
    const waterHere = (x, z) => (x === 0 && z === 0 ? 20 : 49);
    expect(oceanVisibleNear(0, 0, waterHere, OCEAN_SAMPLE_RADIUS, seaLevel)).toBe(true);
  });

  it('water only on a ring sample (coast within reach, not underfoot) -> visible', () => {
    // a column at +radius on X is water; everything else is land
    const waterEast = (x) => (x >= OCEAN_SAMPLE_RADIUS ? SEA_LEVEL : 49);
    expect(oceanVisibleNear(0, 0, waterEast, OCEAN_SAMPLE_RADIUS, seaLevel)).toBe(true);
  });

  it('a column exactly at SEA_LEVEL counts as water (inclusive) -> visible', () => {
    const atSea = () => SEA_LEVEL;
    expect(oceanVisibleNear(0, 0, atSea, OCEAN_SAMPLE_RADIUS, seaLevel)).toBe(true);
  });

  it('samples are taken RELATIVE to the camera position (follows the player)', () => {
    // water only near world x=1000; visible when the camera is there, not at the origin
    const farWater = (x) => (Math.abs(x - 1000) <= OCEAN_SAMPLE_RADIUS ? 20 : 49);
    expect(oceanVisibleNear(0, 0, farWater, OCEAN_SAMPLE_RADIUS, seaLevel)).toBe(false);
    expect(oceanVisibleNear(1000, 0, farWater, OCEAN_SAMPLE_RADIUS, seaLevel)).toBe(true);
  });

  it('exports a sane sample radius (inside the ~110m plane coverage)', () => {
    expect(OCEAN_SAMPLE_RADIUS).toBeGreaterThan(40);
    expect(OCEAN_SAMPLE_RADIUS).toBeLessThanOrEqual(110);
  });
});
