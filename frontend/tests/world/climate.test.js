import { describe, it, expect } from 'vitest';
import { surfaceBlockAt, footstepTypeAt } from '../../src/world/climate.js';
import { BEACH_BAND_TOP } from '../../src/world/oceanProfile.js';

// Anchored against the worker's real field (the same coords the M2/M4a node-probes verified):
// origin is land (plains/grass); [0,-40] is a solid snowfield (snow); low/ocean columns beach to sand.
describe('climate sampler (locomotion-audio interleave) — main-thread biome/surface', () => {
  it('origin region is land grass (plains)', () => {
    expect(surfaceBlockAt(0, 0).surfaceBlock).toBe(1);      // grass
    expect(footstepTypeAt(0, 0)).toBe('grass');
  });
  it('the probed snowfield [0,-40] is snow', () => {
    expect(surfaceBlockAt(0, -40).surfaceBlock).toBe(5);    // snow
    expect(footstepTypeAt(0, -40)).toBe('snow');
  });
  // AN `if` AROUND AN `expect` IS NOT AN ASSERTION. This read
  //     if (s.surfaceY < 30) expect(s.surfaceBlock).toBe(4);
  // so when the sampled column was NOT a beach the test asserted nothing at all and still reported the
  // beach rule locked — and the bare 30 duplicated BEACH_BAND_TOP, free to drift away from the value
  // the code actually branches on. Both halves now come from the module, and both branches are covered.
  it('the beach band is decided by BEACH_BAND_TOP, on both sides of it', () => {
    // RE-ANCHORED. The old probe (-24, 0) samples surfaceY 44 today, well ABOVE the band — so the `if`
    // it sat behind had been skipping silently, and this case had been asserting nothing at all for as
    // long as the terrain has looked like this. Found by sampling the real field for a column that is
    // genuinely in the band rather than by picking a plausible-looking coordinate.
    const s = surfaceBlockAt(-400, -400);
    expect(s.surfaceY, 'the probe coord is no longer inside the beach band — re-anchor it')
      .toBeLessThan(BEACH_BAND_TOP);
    expect(s.surfaceBlock).toBe(4); // sand, unconditionally

    // The contrast case: a column ABOVE the band must not be sand, or "below -> sand" says nothing.
    const land = surfaceBlockAt(0, 0);
    expect(land.surfaceY).toBeGreaterThanOrEqual(BEACH_BAND_TOP);
    expect(land.surfaceBlock).not.toBe(4);
  });
  it('footstepTypeAt maps every surface block to a stride sound', () => {
    expect(['grass', 'dirt', 'stone', 'sand', 'snow', 'wood']).toContain(footstepTypeAt(0, 0));
  });
  it('is deterministic (same coord -> same surface)', () => {
    expect(surfaceBlockAt(123, -456)).toEqual(surfaceBlockAt(123, -456));
  });
});
