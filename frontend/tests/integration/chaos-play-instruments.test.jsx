// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { freshStorePerTest, TOL } from './chaosPlay/suite.js';
import {
  makeSession, tick, setCell, deepestSolid, eyeCell, solidAt, escape, rightClick, leftClick, buildRay, lookDir, mulberry32, STONE,
  LAND_TOP, checkEscape, writeSave, loadSave, LOAD_RELEASE_FRAMES, voidReset, groundUnder, DEEP_SEABED, clipInto, recovered,
  CLIP_RECOVERY_FRAMES, finishSession,
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
// footprint; left-clicks, under the feet and down the origin column, and the Delete Tool's 2- and 3-wide removals;
// beast-form swaps, under ceilings and against walls;
// a save written and loaded; a fall through the void (at the deep seabed, down a shaft dug out of the bottom of the world)
// and the respawn. The real Rapier build, the real greedy mesher, the
// real executors (placeAtHit, mineAtHit's single mine and Delete Tool, cellEdits, mineTarget, moveKinematic,
// placedCellColliders, formFit, the spawn and resume decisions,
// buildSaveData and loadWorldData), wired as the game wires them (chaosPlay/harness.js says how, and what it leaves out);
// a batched edit's answer comes half the trimesh lag after the click, so clicks land between edits and their answers.
//
// EIGHT INVARIANTS. I1, I2, I6 and I7 read the voxel grid as the verbs have made it, never the colliders; I3 reads a
// sandbox built from the landed chunk meshes and the live stand-ins; I4 reads the world's colliders; I5 reads the load's
// hold; I8 reads the store's record against the voxel grid.
//  I1 at the end of every frame the player is in play (not held by a load, not clipped into the rock) the live capsule
//     reaches into no solid cell deeper than TOL (suite.js says why 5 mm);
//  I2 the eye is never inside a solid cell then (inside one, every face points away and the block cannot be seen);
//  I3 every 90 frames and at the session's end the player can leave: a metre's move within a second on one of 8
//     headings, walking or jump-walking, or doing so once every block of their own within 4 m is mined, as many clicks
//     as that takes (a shell the player built is not a trap: its faces are drawn and its blocks can be mined). A state
//     only mining generated ground would leave is held: a wedge the controller cannot walk or jump out of is the defect,
//     whatever a pickaxe could do about it. Each walk-held reading is printed with its class;
//  I4 no stand-in collider outlives its chunk's mesh by more than one world step, and none is left at the end;
//  I5 a load lets the player go within 2 x lag + 12 frames, never to the origin spawn (the frames between are its hold,
//     which I1 and I2 do not read: the body is held at the saved spot until the new world's column is in);
//  I6 the void guard resets no player who has ground under their feet: it fires on a body under the world, or one in
//     the world's last cells (on its bottom face), never on the deep seabed or at the bottom of a shaft the player dug
//     (DECISIONS 2026-10-30 item 207). It reads ground under the feet only, and at the line (a centre under 1.4, the
//     feet under 0.68) no cell lies under them, so it restates the line's height: it goes red when the line is raised
//     (to 10, or to 2.4), not on a reset it could tell apart from the line;
//  I7 a body clipped into the rock (each field session clips once, over the cave under the field) is stood clear within
//     half a second, within a metre of where it clipped, before any void reset; and no stuck-in-rock recovery moves a
//     player who never clipped (DECISIONS 2026-10-30 item 213). The frames between the clip and the recovery are not
//     read by I1 and I2 (the body is in the rock by construction);
//  I8 whenever no batched edit's answer is owed, and at the session's end, every cell the store records holds what the
//     record says (a block, or air for 0), so a save brings back the world the player sees (DECISIONS 2026-10-31 item
//     270).
// DENOMINATORS: each file asserts floors on the risky events its sessions reached (clicks aimed into the body, wall
// contact frames, swaps under a ceiling and against a wall, refused swaps, loads, saves in a form and from the old Save
// button, the frames a load held the body, respawns, respawns after an origin-column dig and build, escape tests, own
// shells left, Delete Tool clicks and the blocks they took, under the feet too, answers heard late, record reads, mines
// of a cell whose placement was still owed its answer), and prints them with the frames, the deepest any session reached
// into solid and the walk-held readings.
//
// WHAT IT DOES NOT CHECK: the game's React effect order and Terrain.jsx's own wiring (the e2e suite drives those), mobs,
// knockback, dodge, the accel ramp, the camera's bob and shake, chunk streaming by distance (every chunk stays loaded,
// so the spawn's probe always answers, and its blind drop and the follow after it never run here:
// tests/gates/stuck-in-rock-gates.test.jsx drives them in the Player's loop), the rendering of anything.
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

  it('I1 counts a capsule 0.04 m into a wall (between TOL and the shallowest trap the gate exists for, 0.05 m)', () => {
    const S = session();
    const t = S.p.body.translation();
    const [x, z] = [Math.floor(t.x), Math.floor(t.z)];
    S.p.body.setTranslation({ x: x + 0.5, y: t.y, z: z + 0.5 }, true);
    for (let i = 0; i < 5; i++) tick(S, {});
    // A wall face 0.1 m from the capsule's side, then the body 0.14 m into it: 0.04 m deep, under the 0.05 m the traps start
    // at, so a tolerance loosened to anything over 0.04 stops counting it.
    for (const y of [LAND_TOP, LAND_TOP + 1]) setCell(S, x + 1, y, z, STONE);
    const at = S.p.body.translation();
    S.p.body.setTranslation({ x: at.x + 0.14, y: at.y, z: at.z }, true);
    const d = deepestSolid(S).depth;
    expect(d, 'SETUP: the capsule is not between 6 mm and 0.05 m into the wall').toBeGreaterThan(0.006);
    expect(d, 'SETUP: the capsule is not between 6 mm and 0.05 m into the wall').toBeLessThanOrEqual(0.05);
    tick(S, {});
    expect(S.counts.I1, `I1 did not count a capsule ${d.toFixed(3)} m into a wall`).toBeGreaterThan(0);
  });

  it('I3 is recorded: a held escape test counts, and its walk-held reading is classed as held', () => {
    const S = session();
    setCell(S, ...eyeCell(S.p.body), STONE);
    tick(S, {});
    const e = checkEscape(S);
    expect(e.free, 'SETUP: the player walked out of a block at the eye').toBe(false);
    expect(S.counts.I3, 'a held escape test was not counted').toBeGreaterThan(0);
    expect(S.walkHeld.map((h) => h.class), 'the walk-held reading was not printed as held').toEqual(['held']);
  });

  it('I5 reads a load whose column never comes in: held past its bound, then given up for the origin spawn', () => {
    const S = session();
    const save = writeSave(S, 'manual');
    save.player_data.position = { x: 500.5, y: 40, z: 0.5 }; // beyond the world: no chunk will ever answer the probe
    loadSave(S, save);
    for (let i = 0; i < 2 * LOAD_RELEASE_FRAMES(S.lag); i++) tick(S, {});
    expect(S.violations.I5.map((v) => v.why), 'I5 did not read a hold past its bound').toContainEqual(expect.stringMatching(/still held/));
    for (let i = 0; i < 620 && S.loadPending; i++) tick(S, {});
    expect(S.loadPending, 'SETUP: the hold never gave up').toBeNull();
    expect(S.violations.I5.map((v) => v.why), 'I5 did not read a hold that gave up for the origin').toContainEqual(expect.stringMatching(/gave up/));
  });

  it('I6 reads a void reset of a player standing on ground, and none of one under the world or in its last cells', () => {
    const S = session();
    expect(groundUnder(S), 'SETUP: the instrument sees no ground under a player on open land').not.toBeNull();
    voidReset(S);
    expect(S.counts.I6, 'I6 did not count a reset of a player standing on open land').toBe(1);
    for (const y of [-2, 0.95]) { // under the world; on its bottom face, in the cells at y 0
      const T = session();
      const t = T.p.body.translation();
      T.p.body.setTranslation({ x: t.x, y, z: t.z }, true);
      expect(groundUnder(T), `ground read under a body at y ${y}`).toBeNull();
      voidReset(T);
      expect([T.counts.I6, T.stats.voidResets], `I6 counted a reset of a body at y ${y}`).toEqual([0, 1]);
    }
    const D = makeSession({ spot: 'deep', rnd: mulberry32(7), hz: 60, lag: 2, tol: TOL });
    expect(D.p.body.translation().y, 'SETUP: the deep place\'s session does not stand on the deepest seabed').toBeCloseTo(DEEP_SEABED + 0.95, 1);
    expect(groundUnder(D), 'the instrument sees no ground under a player on the deep seabed').not.toBeNull();
  });

  it('I7 reads a clipped body left in the rock, a recovery of a player who never clipped, and one stood far from the clip', () => {
    const clipAt = (S) => { const t = S.p.body.translation(); return { x: t.x, y: 15, z: t.z }; };
    // The Player's recovery on: the clip over the cave is stood clear and I7 reads nothing.
    const R = session();
    clipInto(R, clipAt(R));
    for (let i = 0; i < CLIP_RECOVERY_FRAMES(R.hz) + 5; i++) tick(R, {});
    expect([R.counts.I7, R.stats.stuckRecoveries, R.clip], 'SETUP: the recovery did not stand the clipped body clear').toEqual([0, 1, null]);
    // Its readings stopped (a watch that never reads): the body stays in the rock past the bound.
    const S = session();
    clipInto(S, clipAt(S));
    S.stuck.sinceRead = -Infinity;
    for (let i = 0; i < CLIP_RECOVERY_FRAMES(S.hz) + 5; i++) tick(S, {});
    expect(S.violations.I7.map((v) => v.why), 'I7 did not read a body left in the rock past its bound').toContainEqual(expect.stringMatching(/still in the rock/));
    expect(S.stats.stuckRecoveries, 'SETUP: a watch that never reads moved the body').toBe(0);
    // A recovery with no clip before it, and one that stood the clipped body at the origin.
    const N = session();
    recovered(N, N.p.body.translation());
    expect(N.violations.I7.map((v) => v.why), 'I7 did not read a recovery of a player who never clipped').toContainEqual(expect.stringMatching(/had not clipped/));
    const O = session();
    clipInto(O, clipAt(O));
    recovered(O, { x: 0, y: LAND_TOP + 0.95, z: 0 });
    expect(O.violations.I7.map((v) => v.why), 'I7 did not read a body stood at the origin, away from its clip').toContainEqual(expect.stringMatching(/from where the body clipped/));
  });

  it('I8 reads a record that is not the world, and none after a mine lands before its placement\'s answer', () => {
    const S = session();
    expect(S.answerLag, 'SETUP: the session answers at the click').toBeGreaterThan(0);
    const dir = lookDir(0.4, -0.6); // the ground about 2 m off, clear of the body
    expect(rightClick(S, buildRay(S, dir), 'single', 1), 'SETUP: the right click placed nothing').toBe(1);
    // One step puts the stand-in in the broad phase, so the next ray hits it; its answer is still owed.
    tick(S, {});
    expect(S.answers.length, 'SETUP: the placement was answered before the mine').toBe(1);
    leftClick(S, buildRay(S, dir));
    expect(S.stats.minesOverOwed, 'SETUP: the left click did not mine the cell still owed its answer').toBe(1);
    for (let i = 0; i < 6; i++) tick(S, {});
    expect([S.counts.I8, S.answers.length], 'the record and the world disagree after a mine before the answer').toEqual([0, 0]);
    expect(S.stats.recordChecks, 'SETUP: the record was not read once the answer was heard').toBeGreaterThan(0);
    // A record of a block over air.
    const t = S.p.body.translation();
    const k = `${Math.floor(t.x)}_${LAND_TOP + 6}_${Math.floor(t.z)}`;
    useGameStore.setState((st) => ({ worldBlocks: new Map(st.worldBlocks).set(k, STONE) }));
    finishSession(S);
    expect(S.violations.I8.map((v) => [v.cell, v.record, v.world]), 'I8 did not read a record of a block over air').toContainEqual([k, STONE, 0]);
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
