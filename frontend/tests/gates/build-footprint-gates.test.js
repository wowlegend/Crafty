import { describe, it, expect } from 'vitest';
import { buildFootprint, MAX_CELLS, MAX_SIZE } from '../../src/game/buildFootprint.js';

// THE BUILDING TOOLS PANEL DID NOTHING.
//
// It shipped reachable four ways — KeyB, the HUD grid button, the touch tray, the panel registry — and
// localized into two languages, writing `buildingMode` / `buildSize` / `selectedBuildBlock` into the
// store. Nothing read them. Terrain's placement executor was never taught they existed, so every mode
// placed exactly one block: an advertised pillar of a voxel game that was inert.
//
// Wired rather than deleted, but NOT as specced. `place` debits inventory per block, so the panel's
// advertised size-10 cube is 1000 blocks in one click — a quantity no survival player holds — plus 1000
// per-block worker messages. The cap below is the fix for that, and it is derived from the economy rather
// than picked for taste.
const CELL = { x: 10, y: 64, z: -4 };
const key = (c) => `${c.x},${c.y},${c.z}`;

describe('buildFootprint — shape', () => {
  it('single is exactly the hit cell', () => {
    expect(buildFootprint('single', 5, CELL)).toEqual([CELL]);
  });

  it('wall is a column of `size`, rising from the hit cell', () => {
    const cells = buildFootprint('wall', 4, CELL, { x: 1, y: 0, z: 0 });
    expect(cells).toHaveLength(4);
    expect(new Set(cells.map((c) => `${c.x},${c.z}`)).size, 'a wall drifted sideways').toBe(1);
    expect(cells.map((c) => c.y).sort((a, b) => a - b)).toEqual([64, 65, 66, 67]);
  });

  it('a wall on a FLOOR face grows sideways, not down into the ground', () => {
    // Growing a wall along the normal of a horizontal face buries it. The mode has to notice.
    const cells = buildFootprint('wall', 3, CELL, { x: 0, y: 1, z: 0 });
    expect(new Set(cells.map((c) => c.y)).size, 'the wall grew vertically off a floor face').toBe(1);
    expect(cells).toHaveLength(3);
  });

  it('floor is size x size in the hit plane', () => {
    const cells = buildFootprint('floor', 3, CELL);
    expect(cells).toHaveLength(9);
    expect(new Set(cells.map((c) => c.y)).size, 'the floor was not flat').toBe(1);
  });

  it('cube is size cubed', () => {
    expect(buildFootprint('cube', 3, CELL)).toHaveLength(27);
  });

  it('delete has the same footprint as cube — mining grants blocks, so it is symmetrical', () => {
    expect(buildFootprint('delete', 3, CELL)).toHaveLength(buildFootprint('cube', 3, CELL).length);
  });

  it('never returns a duplicate cell — a duplicate is a double debit', () => {
    for (const mode of Object.keys(MAX_SIZE)) {
      const cells = buildFootprint(mode, 4, CELL, { x: 1, y: 0, z: 0 });
      expect(new Set(cells.map(key)).size, `${mode} produced duplicate cells`).toBe(cells.length);
    }
  });

  it('always includes the cell the player actually aimed at', () => {
    for (const mode of Object.keys(MAX_SIZE)) {
      const cells = buildFootprint(mode, 3, CELL, { x: 1, y: 0, z: 0 });
      expect(cells.map(key), `${mode} dropped the aimed-at cell`).toContain(key(CELL));
    }
  });
});

describe('buildFootprint — the cap, which is the economic fix', () => {
  it('NO mode at ANY slider value can exceed MAX_CELLS', () => {
    // The panel's slider goes to 10. A size-10 cube is 1000 blocks debited in one click and 1000 worker
    // messages. This is the assertion that makes the feature compatible with the survival economy.
    for (const mode of Object.keys(MAX_SIZE)) {
      for (let size = 1; size <= 10; size++) {
        const n = buildFootprint(mode, size, CELL, { x: 1, y: 0, z: 0 }).length;
        expect(n, `${mode} at size ${size} produced ${n} cells, over the ${MAX_CELLS} cap`).toBeLessThanOrEqual(MAX_CELLS);
      }
    }
  });

  it('MAX_SIZE is DERIVED from the cap, so no mode can define its way around it', () => {
    expect(MAX_SIZE.cube ** 3).toBeLessThanOrEqual(MAX_CELLS);
    expect(MAX_SIZE.floor ** 2).toBeLessThanOrEqual(MAX_CELLS);
  });

  it('clamps rather than refuses, so an over-range slider still builds something', () => {
    // Refusing would make the slider's top half silently do nothing — the failure this whole finding is.
    const cells = buildFootprint('cube', 99, CELL);
    expect(cells.length).toBeGreaterThan(1);
    expect(cells.length).toBeLessThanOrEqual(MAX_CELLS);
  });

  it('an unknown mode degrades to a single block rather than throwing or exploding', () => {
    expect(buildFootprint('not_a_mode', 8, CELL)).toEqual([CELL]);
    expect(buildFootprint(undefined, 8, CELL)).toEqual([CELL]);
  });

  it('a malformed cell yields nothing rather than NaN coordinates', () => {
    // NaN coordinates would reach idForBlock and the worker as real placements.
    for (const bad of [null, undefined, {}, { x: NaN, y: 1, z: 1 }, { x: 1, y: 1 }]) {
      expect(buildFootprint('cube', 3, bad), `accepted ${JSON.stringify(bad)}`).toEqual([]);
    }
  });

  it('the cap is not so small that the feature is pointless — the other failure direction', () => {
    // A cap of 1 would satisfy every assertion above and reduce the panel to the inert thing it was.
    expect(MAX_CELLS).toBeGreaterThanOrEqual(27);
    expect(buildFootprint('cube', 3, CELL).length).toBe(27);
  });
});
