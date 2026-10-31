import { describe, it, expect } from 'vitest';
import { buildFootprint, MAX_CELLS, MAX_SIZE } from '../../src/game/buildFootprint.js';

// THE BUILDING TOOLS PANEL DID NOTHING.
//
// It shipped reachable four ways — KeyB, the HUD grid button, the touch tray, the panel registry — and
// localized into two languages, writing `buildingMode` / `buildSize` into the store. Nothing read them. Terrain's placement executor was never taught they existed, so every mode
// placed exactly one block: an advertised pillar of a voxel game that was inert.
//
// Wired rather than deleted, but NOT as specced. `place` debits inventory per block, so the panel's
// advertised size-10 cube is 1000 blocks in one click — a quantity no survival player holds — plus 1000
// per-block worker messages. The cap below is the fix for that, and it is derived from the economy rather
// than picked for taste.
const CELL = { x: 10, y: 64, z: -4 };
const key = (c) => `${c.x},${c.y},${c.z}`;
const UP = { x: 0, y: 1, z: 0 }, DOWN = { x: 0, y: -1, z: 0 }, EAST = { x: 1, y: 0, z: 0 }, NORTH = { x: 0, y: 0, z: -1 };
const NORMALS = [EAST, { x: -1, y: 0, z: 0 }, UP, DOWN, { x: 0, y: 0, z: 1 }, NORTH];
const span = (cells, axis) => [...new Set(cells.map((c) => c[axis]))].sort((a, b) => a - b);

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

  // DECISIONS 2026-10-31 item 232, which reverses the wall that grew along +x off a floor face: the hit cell off a top face
  // is the air cell above the ground (placeAtHit steps along the normal), so a column rising from it is buried nowhere,
  // and the strip along +x ran east whichever way the player faced (registry AUDIT:ultra:ultra-game-logic-2).
  it('a wall on the ground\'s top face rises from the hit cell', () => {
    const cells = buildFootprint('wall', 3, CELL, UP);
    expect(cells.map(key), 'the wall off a top face is not a column rising from the hit cell').toEqual(['10,64,-4', '10,65,-4', '10,66,-4']);
  });

  it('a wall under a ceiling hangs down from the hit cell', () => {
    const cells = buildFootprint('wall', 3, CELL, DOWN);
    expect(cells.map(key), 'the wall under a ceiling did not hang down').toEqual(['10,64,-4', '10,63,-4', '10,62,-4']);
  });

  it('a floor and a cube off a wall\'s side grow out from the wall, across it centred on the hit cell', () => {
    // Centred on the hit cell along the normal, a third of each sat inside the block it was placed against.
    const floor = buildFootprint('floor', 3, CELL, EAST);
    expect({ x: span(floor, 'x'), y: span(floor, 'y'), z: span(floor, 'z') }, 'the floor off an east face does not grow east').toEqual({ x: [10, 11, 12], y: [64], z: [-5, -4, -3] });
    const cube = buildFootprint('cube', 3, CELL, NORTH);
    expect({ x: span(cube, 'x'), y: span(cube, 'y'), z: span(cube, 'z') }, 'the cube off a north face does not grow north and up').toEqual({ x: [9, 10, 11], y: [64, 65, 66], z: [-6, -5, -4] });
    expect(cube).toHaveLength(27);
  });

  it('a cube under a ceiling grows down; a floor under one stays in the hit cell\'s layer', () => {
    expect(span(buildFootprint('cube', 3, CELL, DOWN), 'y'), 'the cube under a ceiling grew up into it').toEqual([62, 63, 64]);
    expect(span(buildFootprint('floor', 3, CELL, DOWN), 'y')).toEqual([64]);
  });

  it('a removal grows INTO the face it is aimed at, from the block hit, across it centred', () => {
    // The Delete Tool's cell is the block the ray hit, so its 3x3x3 lies behind that face: under a top face, west of an
    // east face, above a ceiling. Grown away from the face it took the air in front of it.
    const down = buildFootprint('delete', 3, CELL, UP);
    expect({ x: span(down, 'x'), y: span(down, 'y'), z: span(down, 'z') }, 'a removal on a top face does not dig down').toEqual({ x: [9, 10, 11], y: [62, 63, 64], z: [-5, -4, -3] });
    const west = buildFootprint('delete', 3, CELL, EAST);
    expect({ x: span(west, 'x'), y: span(west, 'y'), z: span(west, 'z') }, 'a removal on an east face does not dig west').toEqual({ x: [8, 9, 10], y: [63, 64, 65], z: [-5, -4, -3] });
    expect(span(buildFootprint('delete', 3, CELL, DOWN), 'y'), 'a removal on a ceiling does not dig up').toEqual([64, 65, 66]);
  });

  it('floor is size x size in the hit plane', () => {
    const cells = buildFootprint('floor', 3, CELL);
    expect(cells).toHaveLength(9);
    expect(new Set(cells.map((c) => c.y)).size, 'the floor was not flat').toBe(1);
  });

  it('cube is size cubed', () => {
    expect(buildFootprint('cube', 3, CELL)).toHaveLength(27);
  });

  it('delete has as many cells as cube — mining grants blocks, so it is symmetrical', () => {
    expect(buildFootprint('delete', 3, CELL, UP)).toHaveLength(buildFootprint('cube', 3, CELL, UP).length);
  });

  it('never returns a duplicate cell — a duplicate is a double debit', () => {
    for (const mode of Object.keys(MAX_SIZE)) for (const normal of NORMALS) {
      const cells = buildFootprint(mode, 4, CELL, normal);
      expect(new Set(cells.map(key)).size, `${mode} off ${key(normal)} produced duplicate cells`).toBe(cells.length);
    }
  });

  it('always includes the cell the player actually aimed at, off every face', () => {
    for (const mode of Object.keys(MAX_SIZE)) for (const normal of [...NORMALS, undefined]) {
      const cells = buildFootprint(mode, 3, CELL, normal);
      expect(cells.map(key), `${mode} off ${normal ? key(normal) : 'no normal'} dropped the aimed-at cell`).toContain(key(CELL));
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
