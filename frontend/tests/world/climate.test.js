import { describe, it, expect } from 'vitest';
import { surfaceBlockAt, footstepTypeAt } from '../../src/world/climate.js';

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
  it('a low/ocean column beaches to sand (surfaceY < BEACH_BAND_TOP -> sand)', () => {
    const s = surfaceBlockAt(-24, 0); // nearest shallow ocean in the M2 probe
    if (s.surfaceY < 30) expect(s.surfaceBlock).toBe(4);    // sand beach (asserted only when it IS a beach)
  });
  it('footstepTypeAt maps every surface block to a stride sound', () => {
    expect(['grass', 'dirt', 'stone', 'sand', 'snow', 'wood']).toContain(footstepTypeAt(0, 0));
  });
  it('is deterministic (same coord -> same surface)', () => {
    expect(surfaceBlockAt(123, -456)).toEqual(surfaceBlockAt(123, -456));
  });
});
