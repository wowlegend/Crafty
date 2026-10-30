// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { freshStorePerTest, TOL } from './chaosPlay/suite.js';
import {
  makeSession, tick, setCell, deepestSolid, eyeCell, solidAt, escape, rightClick, buildRay, lookDir, mulberry32, STONE,
  LAND_TOP,
} from './chaosPlay/harness.js';

// THE CHAOS-PLAY GATE: CAN THE PLAYER STILL LEAVE? Kevin, five minutes of left and right clicking near the ocean
// (2026-10-30), was sealed in an invisible box: a right-click had put a block inside his own body. A week of reviews had
// not caught it, because every review and gate was scoped to a diff and nothing played the game adversarially, and the
// trap shows in no frame and no console line: only "can the player still move" sees it (AB episode 1230). This gate asks
// that of every verb that edits the world or moves the body.
//
// A seeded player plays sessions at six places (the shore, a cliff face, a two-high tunnel, an overhang, open field, the
// origin column every respawn reads) at 60 and 120 Hz, with every edit's trimesh landing 0, 2, 4 or 8 frames late: walks
// and jumps, into walls too; right-clicks at walls, at the feet, straight down, at the eye's own cell, single and
// footprint; left-clicks, under the feet and down the origin column; beast-form swaps, under ceilings and against walls;
// a save written and loaded; a fall through the void and the respawn. The real Rapier build, the real greedy mesher, the
// real executors (placeAtHit, mineTarget, moveKinematic, placedCellColliders, formFit, the spawn and resume decisions,
// buildSaveData and loadWorldData), wired as the game wires them (chaosPlay/harness.js says how, and what it leaves out).
//
// FIVE INVARIANTS. I1 and I2 read the voxel grid as the verbs have made it, never the colliders; I3 reads a sandbox built
// from the landed chunk meshes and the live stand-ins; I4 reads the world's colliders; I5 reads the load's hold.
//  I1 at the end of every frame the player is in play (not held by a load) the live capsule reaches into no solid cell
//     deeper than TOL (suite.js says why 5 mm);
//  I2 the eye is never inside a solid cell then (inside one, every face points away and the block cannot be seen);
//  I3 every 90 frames and at the session's end the player can leave: a metre's move within a second on one of 8
//     headings, walking or jump-walking, or doing so once every block of their own within 4 m is mined, as many clicks
//     as that takes (a shell the player built is not a trap: its faces are drawn and its blocks can be mined). A state
//     only mining generated ground would leave is held: a wedge the controller cannot walk or jump out of is the defect,
//     whatever a pickaxe could do about it. Each walk-held reading is printed with its class;
//  I4 no stand-in collider outlives its chunk's mesh by more than one world step, and none is left at the end;
//  I5 a load lets the player go within 2 x lag + 12 frames, never to the origin spawn (the frames between are its hold,
//     which I1 and I2 do not read: the body is held at the saved spot until the new world's column is in).
// DENOMINATORS: each file asserts floors on the risky events its sessions reached (clicks aimed into the body, wall
// contact frames, swaps under a ceiling and against a wall, refused swaps, loads, saves in a form and from the old Save
// button, the frames a load held the body, respawns, respawns after an origin-column dig and build, escape tests, own
// shells left), and prints them with the frames, the deepest any session reached into solid and the walk-held readings.
//
// WHAT IT DOES NOT CHECK: the game's React effect order and Terrain.jsx's own wiring (the e2e suite drives those), mobs,
// knockback, dodge, the accel ramp, the camera's bob and shake, chunk streaming by distance, the rendering of anything.
// Rapier 0.19.2 itself is trusted: one history made it panic after a load's wipe left only the player's capsule in the
// broad phase, so the harness keeps a collider far below the world (registry REVIEW:chaos-play:rapier-panic-after-wipe).

describe('the chaos-play instruments see what they report on', () => {
  freshStorePerTest();
  const session = () => makeSession({ spot: 'field', rnd: mulberry32(7), hz: 60, lag: 2, tol: TOL });

  it('I1 and I2 read a block in the capsule at the eye, and nothing on open land', () => {
    const S = session();
    expect(deepestSolid(S).depth, 'SETUP: the player stands in a solid cell on open land').toBe(0);
    expect(solidAt(S, ...eyeCell(S.p.body)), 'SETUP: the eye is in a solid cell on open land').toBe(false);
    tick(S, {});
    expect([S.counts.I1, S.counts.I2], 'SETUP: a frame on open land read a violation').toEqual([0, 0]);
    setCell(S, ...eyeCell(S.p.body), STONE);
    expect(deepestSolid(S).depth, 'I1 cannot see a block written into the capsule').toBeGreaterThan(TOL);
    tick(S, {});
    expect(S.counts.I1, 'the frame check did not count the capsule in the block').toBeGreaterThan(0);
    expect(S.counts.I2, 'the frame check did not count the eye in the block').toBeGreaterThan(0);
  });

  it('I3 reads the player held by a block at the eye that no click can take, and free on open land', () => {
    const S = session();
    expect(escape(S), 'SETUP: the player cannot walk away on open land').toEqual({ free: true, by: 'walk' });
    // Written as generated ground, not placed: mineTarget takes a placed block around the eye, never generated stone.
    setCell(S, ...eyeCell(S.p.body), STONE);
    tick(S, {});
    expect(escape(S).free, 'I3 reads a player held inside a block as free').toBe(false);
  });

  it('a shell the player builds around themselves is walk-held but dug out (the FAIL-but-right sample)', () => {
    const S = session();
    // Stood in the middle of a column, the body fills two cells of the footprint (feet and head), and the shell is whole.
    const t = S.p.body.translation();
    S.p.body.setTranslation({ x: Math.floor(t.x) + 0.5, y: t.y, z: Math.floor(t.z) + 0.5 }, true);
    for (let i = 0; i < 10; i++) tick(S, {});
    const h = buildRay(S, lookDir(0, -1.5707));
    expect(h, 'SETUP: the ray down from the eye hits nothing').not.toBeNull();
    const placed = rightClick(S, h, 'cube', 3);
    expect(placed, 'SETUP: the 3 x 3 x 3 footprint at the feet did not place 25 cells around the body').toBe(25);
    for (let i = 0; i < 10; i++) tick(S, {});
    expect(escape(S), 'a shell of the player\'s own blocks reads as a trap, or as no shell at all').toEqual({ free: true, by: 'own' });
  });

  it('a pocket of generated ground the player is shut in is held, though mining that ground would open it (no click limit hides a wedge)', () => {
    const S = session();
    const t = S.p.body.translation();
    S.p.body.setTranslation({ x: Math.floor(t.x) + 0.5, y: t.y, z: Math.floor(t.z) + 0.5 }, true);
    for (let i = 0; i < 10; i++) tick(S, {});
    const at = S.p.body.translation();
    const [x, z] = [Math.floor(at.x), Math.floor(at.z)];
    // Written as generated stone (setCell, not a verb), so no cell of it is the player's: the eight columns around the
    // body's, two high, and the cell over the head.
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      if (dx || dz) for (const y of [LAND_TOP, LAND_TOP + 1]) setCell(S, x + dx, y, z + dz, STONE);
    }
    setCell(S, x, LAND_TOP + 2, z, STONE);
    for (let i = 0; i < 10; i++) tick(S, {});
    expect(deepestSolid(S).depth, 'SETUP: the pocket was built into the capsule').toBe(0);
    expect(escape(S), 'a pocket only mining generated ground opens reads as a way out').toEqual({ free: false, by: null });
    // A block of the player's own 3 m off, outside the pocket: mining it opens nothing, so the pocket still holds.
    setCell(S, x + 3, LAND_TOP, z, STONE);
    useGameStore.setState({ worldBlocks: new Map([[`${x + 3}_${LAND_TOP}_${z}`, STONE]]) });
    expect(escape(S), 'a block of the player\'s own that opens nothing read as their way out').toEqual({ free: false, by: null });
  });

  it('I4 reads a stand-in kept past its chunk\'s mesh, and none kept on the real registry', () => {
    for (const keep of [false, true]) {
      const S = session();
      if (keep) S.cells.afterStep = () => {}; // the registry never retires a landed cell
      rightClick(S, buildRay(S, lookDir(0, -0.7)), 'single', 1);
      expect(S.standIns.length, 'SETUP: the click made no stand-in').toBe(1);
      for (let i = 0; i < 12; i++) tick(S, {});
      if (keep) expect(S.counts.I4, 'I4 cannot see a stand-in that outlived its mesh').toBeGreaterThan(0);
      else expect([S.counts.I4, S.cells.size()], 'the real registry kept a stand-in past its mesh').toEqual([0, 0]);
    }
  });
});
