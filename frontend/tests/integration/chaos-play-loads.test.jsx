// @vitest-environment jsdom
// THE CHAOS-PLAY GATE'S LOADS: WHATEVER WROTE A SAVE, ITS LOAD STANDS THE PLAYER NEAR WHERE THEY SAVED, IN NO SOLID CELL.
// A load stands the body at the saved position (DECISIONS 2026-10-30 item 154), and a save on disk can hold a position no
// capsule fits at: the Save button before item 153 wrote the camera rounded to whole metres (into a wall the player stood
// beside, or the head into a two-high ceiling), the frozen pre-cut fixture holds (3, 21, 6), nine metres into the ground
// here, and a save made in a narrower or shorter form held a centre the base capsule does not fit at (the comet's stood
// it 0.13 m into the floor). And a save made over the deep ocean, whose seabed lies under the ground probe's floor of 15,
// was held 600 frames and then reset to the origin. Each case loads one through the store's loadWorldData into the chaos
// harness (chaosPlay/harness.js: real Rapier, the real mesher, the game's frame order) and reads I1 (the capsule in no
// solid cell deeper than TOL), I2 (the eye in no solid cell) and I5 (released within its frame bound, never to the
// origin) from the release on, that the player stands sideways near the saved spot, and that they can walk away. The
// random sessions (chaos-play-*.test.jsx) load such saves too; these cases pin one of each where it is known to be bad.
//
// WHAT THIS DOES NOT CHECK: Components.jsx's own wiring of the load (tests/e2e/load-hold.spec.js drives it in the game,
// and tests/gates/player-placement-gates.test.jsx runs its frame at 120 Hz against real Rapier).
import { describe, it, expect } from 'vitest';
import PRE_CUT from '../fixtures/pre-cut-save.json';
import { useGameStore } from '../../src/store/useGameStore.jsx';
import { TERMINAL_VELOCITY } from '../../src/game/locomotion.js';
import { freshStorePerTest, TOL } from './chaosPlay/suite.js';
import {
  makeSession, tick, writeSave, loadSave, deepestSolid, escape, enterForm, finishSession, mulberry32, LOAD_RELEASE_FRAMES,
  DEEP_SEABED, LAND_TOP, voidFall, solidAt, STONE,
} from './chaosPlay/harness.js';

const RUNS = [{ hz: 60, lag: 2 }, { hz: 120, lag: 4 }, { hz: 120, lag: 0 }];

/** How deep the base capsule would stand in solid at `p` (the body put there and back). */
function depthAt(S, p) {
  const body = S.p.body;
  const was = body.translation();
  body.setTranslation(p, true);
  const d = deepestSolid(S).depth;
  body.setTranslation(was, true);
  return d;
}

/** Load `data`, play the hold out and 30 frames on, and read what the release left: the invariants, whether the player
 *  stands sideways within 0.75 m of the saved spot (the load fit moves the body at most 0.6 m sideways), and whether the
 *  frame after the release took no world step (its sweep starts from wherever the collider was last moved). */
function loadAndPlay(S, data, streaming) {
  const saved = data.player_data.position;
  const releases = S.stats.loadsReleased;
  let releasedAt = null, stepsAfterRelease = null;
  loadSave(S, data, streaming);
  for (let i = 0; i < LOAD_RELEASE_FRAMES(S.lag) + 30; i++) {
    const steps = S.steps;
    tick(S, { yaw: 0, forward: false });
    if (releasedAt !== null && stepsAfterRelease === null) stepsAfterRelease = S.steps - steps;
    if (releasedAt === null && S.stats.loadsReleased > releases) releasedAt = S.f;
  }
  finishSession(S);
  const t = S.p.body.translation();
  return {
    counts: { I1: S.counts.I1, I2: S.counts.I2, I5: S.counts.I5, near: Math.hypot(t.x - saved.x, t.z - saved.z) < 0.75 },
    at: { x: +t.x.toFixed(2), y: +t.y.toFixed(2), z: +t.z.toFixed(2) }, noStepAfterRelease: stepsAfterRelease === 0,
    violations: Object.fromEntries(Object.entries(S.violations).filter(([, l]) => l.length)), recent: S.recent.slice(-4),
  };
}

const clean = { I1: 0, I2: 0, I5: 0, near: true };

describe('chaos play, loads: a save stands the player near where it was made, in no solid cell, whatever wrote it', () => {
  freshStorePerTest();

  for (const { hz, lag } of RUNS) {
    it(`the pre-cut fixture, its position nine metres into the ground here, stands the player on that column (${hz} Hz, lag ${lag})`, () => {
      const S = makeSession({ spot: 'field', rnd: mulberry32(3), hz, lag, tol: TOL });
      const save = structuredClone(PRE_CUT);
      const p = save.player_data.position;
      expect(depthAt(S, p), 'SETUP: the fixture\'s position is not inside the ground here').toBeGreaterThan(TOL);
      const r = loadAndPlay(S, save);
      expect(r.counts, `the load left the player in solid or far from the save ${JSON.stringify(r)}`).toEqual(clean);
      expect(Math.hypot(r.at.x - p.x, r.at.z - p.z), `the player was not stood on the saved column ${JSON.stringify(r)}`).toBeLessThan(0.75);
      // On the top face, the controller's 0.05 m offset under the capsule.
      expect(r.at.y, `the player does not stand on the column's top ${JSON.stringify(r)}`).toBeCloseTo(LAND_TOP + 0.95, 1);
      expect(escape(S).free, 'the player cannot walk away from the load').toBe(true);
    });

    // A save in the ground on a chunk's edge, the chunk across it streamed back 8 frames after the saved column's: the load
    // fit reads the colliders up to a metre round the saved centre, so the hold must wait until every chunk under that
    // square answers, not only the saved column's (chaos session origin, 120 Hz, lag 0, seed 5: the neighbouring chunk's
    // rebuilt trimesh was not yet queryable, and the fit stood the capsule 0.4 m into its ground).
    for (const edge of [
      { x: -8.5, z: 16.05, late: '-1_0' }, { x: -8.5, z: 15.95, late: '-1_1' },
      { x: -15.95, z: 20.5, late: '-2_1' }, { x: -16.05, z: 20.5, late: '-1_1' },
    ]) {
      it(`a save in the ground on a chunk's edge at ${edge.x}, ${edge.z}, chunk ${edge.late} back late, stands the player on the column's top (${hz} Hz, lag ${lag})`, () => {
        const S = makeSession({ spot: 'field', rnd: mulberry32(13), hz, lag, tol: TOL });
        const save = writeSave(S, 'manual');
        save.player_data.position = { x: edge.x, y: 21, z: edge.z };
        const r = loadAndPlay(S, save, { late: [edge.late], lateBy: 8 });
        expect(r.counts, `the load left the player in solid or far from the save ${JSON.stringify(r)}`).toEqual(clean);
        expect(r.at.y, `the player does not stand on the column's top ${JSON.stringify(r)}`).toBeCloseTo(LAND_TOP + 0.95, 1);
      });
    }

    // The old Save button: the camera (the steady eye, 0.67 m over the body's centre) rounded to whole metres.
    for (const c of [
      { name: 'beside the cliff face, z rounded into it', spot: 'cliff', at: { x: -8.3, z: -4.55 } },
      { name: 'in the two-high tunnel, x rounded into its wall and the eye up into its ceiling', spot: 'cave', at: { x: -5.55, z: -9.3 } },
      { name: 'in the two-high tunnel, x rounded into its east wall and the eye up into its ceiling', spot: 'cave', at: { x: -4.45, z: -9.3 } },
      { name: 'under the overhang, the eye rounded up into the slab', spot: 'overhang', at: { x: -10.3, z: 8.7 } },
    ]) {
      it(`a save from the old Save button ${c.name} stands the player clear (${hz} Hz, lag ${lag})`, () => {
        const S = makeSession({ spot: c.spot, rnd: mulberry32(5), hz, lag, tol: TOL });
        const t = S.p.body.translation();
        S.p.body.setTranslation({ x: c.at.x, y: t.y, z: c.at.z }, true);
        for (let i = 0; i < 10; i++) tick(S, { yaw: 0, forward: false });
        const save = writeSave(S, 'legacy');
        const p = save.player_data.position;
        expect(depthAt(S, p), `SETUP: the rounded position ${JSON.stringify(p)} is not in solid`).toBeGreaterThan(TOL);
        const r = loadAndPlay(S, save);
        expect(r.counts, `the load left the player in solid or far from the save ${JSON.stringify(r)}`).toEqual(clean);
        // Where they stood, not on the cliff or the slab over it: the rounded eye is 0.17 to 1.17 m over the body's centre.
        expect(Math.abs(r.at.y - (p.y - 0.67)), `the player was stood ${(r.at.y - p.y).toFixed(2)} m off the saved height ${JSON.stringify(r)}`).toBeLessThan(0.55);
        expect(escape(S).free, 'the player cannot walk away from the load').toBe(true);
      });
    }

    // The tunnel's mouth: a save from the old Save button at (-4, 32, -8), x on the east wall's face and the eye rounded up
    // into the ceiling. The fit stands the capsule clear, 0.45 m west and 0.95 m down; at 120 Hz the frame after the release
    // takes no world step on one frame phase of the two, and its sweep starts from where the collider last moved with the
    // body. Played on both phases, so the case reaches that frame whichever phase the hold ends on.
    it(`a save from the old Save button at the tunnel's mouth, (-4, 32, -8), stands the player clear on either frame phase (${hz} Hz, lag ${lag})`, () => {
      const rows = [0, 1].map((phase) => {
        const S = makeSession({ spot: 'cave', rnd: mulberry32(1016), hz, lag, tol: TOL });
        for (let i = 0; i < phase; i++) tick(S, { yaw: 0, forward: false });
        // The camera rounded, as PositionTracker writes it for a player standing at x -4.45, z -8.2 (the eye at y 31.62).
        useGameStore.setState({ playerPosition: { x: -4, y: 32, z: -8 } });
        const save = writeSave(S, 'legacy');
        expect(depthAt(S, save.player_data.position), 'SETUP: the saved position is not in solid').toBeGreaterThan(TOL);
        const r = loadAndPlay(S, save);
        return { phase, ...r, free: escape(S).free };
      });
      if (hz > 60) {
        expect(rows.map((r) => r.noStepAfterRelease), `SETUP: neither phase released the player on a frame followed by one with no world step ${JSON.stringify(rows)}`).toContain(true);
      }
      for (const r of rows) {
        expect(r.counts, `the load left the player in solid or far from the save (phase ${r.phase}) ${JSON.stringify(r)}`).toEqual(clean);
        expect(r.free, `the player cannot walk away from the load (phase ${r.phase})`).toBe(true);
      }
    });

    // A save from before the invisible-box fix can hold a block in the eye's cell. In the two-high tunnel nothing within
    // the near search's 0.6 m clears it (the block is cleared 0.92 m along the tunnel), so the fit's wider search, along
    // open cells (game/formFit.js LOAD_WIDE), stands the player in the tunnel beside it, not on the column's top through
    // the roof. The random sessions never reach that branch (the static review of lane L13 part 2's round 2, its N4).
    it(`a save holding a block in the eye's cell in the two-high tunnel stands the player in the tunnel beside it (${hz} Hz, lag ${lag})`, () => {
      const S = makeSession({ spot: 'cave', rnd: mulberry32(21), hz, lag, tol: TOL });
      const t = S.p.body.translation();
      S.p.body.setTranslation({ x: -5.5, y: t.y, z: -9.5 }, true);
      for (let i = 0; i < 10; i++) tick(S, { yaw: 0, forward: false });
      const save = writeSave(S, 'manual');
      const p = save.player_data.position;
      const eye = [-6, LAND_TOP + 1, -10];
      expect([Math.floor(p.x), Math.floor(p.y + 0.67), Math.floor(p.z)], `SETUP: the save's eye is not in the cell the block goes in ${JSON.stringify(p)}`).toEqual(eye);
      expect([solidAt(S, -6, LAND_TOP + 2, -10), solidAt(S, -6, LAND_TOP, -10)], 'SETUP: the tunnel has no roof over the eye\'s cell, or its own cell is not open').toEqual([true, false]);
      save.world_data.blocks.push([eye.join('_'), STONE]);
      const r = loadAndPlay(S, save);
      expect(solidAt(S, ...eye), 'SETUP: the load did not put the block in the eye\'s cell').toBe(true);
      const away = Math.hypot(r.at.x - p.x, r.at.z - p.z);
      expect({ I1: r.counts.I1, I2: r.counts.I2, I5: r.counts.I5 }, `the load left the player in solid ${JSON.stringify(r)}`).toEqual({ I1: 0, I2: 0, I5: 0 });
      expect(r.at.y, `the player was not stood in the tunnel, under its roof ${JSON.stringify(r)}`).toBeCloseTo(LAND_TOP + 0.95, 1);
      expect(away, `the player was not stood past the near search's reach, by the wider one ${JSON.stringify(r)}`).toBeGreaterThan(0.6);
      expect(away, `the player was stood further off than the wider search reaches ${JSON.stringify(r)}`).toBeLessThanOrEqual(1.4 + 0.05);
      expect(S.stats.loadsPlaced_near, `the load was not placed by the fit's search ${JSON.stringify(S.stats)}`).toBe(1);
      expect(escape(S).free, 'the player cannot walk away from the load').toBe(true);
    });

    // A save made in a form: the comet and the hawk are narrower than the base and stand closer to a wall, the comet and
    // the bull are shorter and centred lower. Pressed into the cliff face, and on open ground.
    for (const form of ['fire', 'ice', 'lightning', 'arcane']) {
      for (const place of [{ spot: 'cliff', yaw: -Math.PI / 2 }, { spot: 'field', yaw: null }]) {
        it(`a save in the ${form} form ${place.yaw === null ? 'on open ground' : 'pressed into the cliff face'} loads clear (${hz} Hz, lag ${lag})`, () => {
          const S = makeSession({ spot: place.spot, rnd: mulberry32(9), hz, lag, tol: TOL });
          expect(enterForm(S, form), `SETUP: the ${form} form was refused where the session starts`).toBe(true);
          for (let i = 0; i < 40; i++) tick(S, place.yaw === null ? { yaw: 0, forward: false } : { yaw: place.yaw, forward: true });
          expect(useGameStore.getState().activeBeastForm, 'SETUP: the form did not hold to the save').toBe(form);
          const r = loadAndPlay(S, writeSave(S, 'manual'));
          expect(r.counts, `the load left the base capsule in solid or far from the save ${JSON.stringify(r)}`).toEqual(clean);
          // On open ground a save written today needs no correction: it holds the base capsule's centre over the feet.
          if (place.yaw === null) expect(S.stats.loadsPlaced_saved, `the saved centre was not where the base capsule fits ${JSON.stringify(r)}`).toBe(1);
          expect(escape(S).free, 'the player cannot walk away from the load').toBe(true);
        });
      }
    }

    it(`a save over the deep ocean, on the seabed and sinking through the water, resumes there (${hz} Hz, lag ${lag})`, () => {
      const S = makeSession({ spot: 'deep', rnd: mulberry32(11), hz, lag, tol: TOL });
      const t = S.p.body.translation();
      // On the seabed's top face, the controller's 0.05 m offset under the capsule.
      expect(t.y, 'SETUP: the session did not start on the deep seabed').toBeCloseTo(DEEP_SEABED + 0.95, 1);
      const onSeabed = writeSave(S, 'manual');
      const r1 = loadAndPlay(S, onSeabed);
      expect(r1.counts, `a save on the deep seabed was not resumed there ${JSON.stringify(r1)}`).toEqual(clean);
      expect(r1.at.y, `the player was not stood back on the seabed ${JSON.stringify(r1)}`).toBeCloseTo(DEEP_SEABED + 0.95, 1);
      S.p.body.setTranslation({ x: t.x, y: 20, z: t.z }, true);
      const sinking = writeSave(S, 'manual');
      const r2 = loadAndPlay(S, sinking);
      expect(r2.counts, `a save sinking through deep water was not resumed there ${JSON.stringify(r2)}`).toEqual(clean);
      expect(Math.hypot(r2.at.x - t.x, r2.at.z - t.z), `the player was moved off the saved column ${JSON.stringify(r2)}`).toBeLessThan(0.75);
    });
  }
});

// The other placement the next frame sweeps on from: the origin spawn after a fall through the world. A player clipping
// through the floor falls at terminal speed (50 m/s, 0.42 m a frame at 120 Hz) and the spawn stands the capsule 0.3 m over
// the origin's ground, so the frame after it must sweep from the spawn, not from the sky the void guard held the body in.
describe('chaos play, the origin spawn: a fall through the world at terminal speed stands the player on the origin column, not in it', () => {
  freshStorePerTest();

  for (const hz of [60, 120]) {
    it(`the respawn after a fall at terminal speed stands the player on the origin's ground on either frame phase (${hz} Hz)`, () => {
      const rows = [0, 1].map((phase) => {
        const S = makeSession({ spot: 'field', rnd: mulberry32(17), hz, lag: 0, tol: TOL });
        for (let i = 0; i < phase; i++) tick(S, {});
        const t = S.p.body.translation();
        S.p.body.setTranslation({ x: t.x, y: 200, z: t.z }, true);
        while (S.vy > TERMINAL_VELOCITY) tick(S, {});
        expect(S.p.body.translation().y, 'SETUP: the fall reached the ground before terminal speed').toBeGreaterThan(LAND_TOP + 20);
        voidFall(S);
        const respawns = S.stats.respawns;
        let spawnedAt = null, stepsAfterSpawn = null;
        for (let i = 0; i < 40; i++) {
          const steps = S.steps;
          tick(S, {});
          if (spawnedAt !== null && stepsAfterSpawn === null) stepsAfterSpawn = S.steps - steps;
          if (spawnedAt === null && S.stats.respawns > respawns) spawnedAt = S.f;
        }
        const at = S.p.body.translation();
        return { phase, spawned: spawnedAt !== null, noStepAfterSpawn: stepsAfterSpawn === 0, counts: { I1: S.counts.I1, I2: S.counts.I2 },
          at: { x: +at.x.toFixed(2), y: +at.y.toFixed(2), z: +at.z.toFixed(2) }, I1: S.violations.I1[0] };
      });
      expect(rows.map((r) => r.spawned), `SETUP: the void guard did not respawn the player ${JSON.stringify(rows)}`).toEqual([true, true]);
      if (hz > 60) {
        expect(rows.map((r) => r.noStepAfterSpawn), `SETUP: neither phase spawned the player on a frame followed by one with no world step ${JSON.stringify(rows)}`).toContain(true);
      }
      for (const r of rows) {
        expect(r.counts, `the respawn left the player in the origin's ground (phase ${r.phase}) ${JSON.stringify(r)}`).toEqual({ I1: 0, I2: 0 });
        // On the top face, the controller's 0.05 m offset under the capsule.
        expect(r.at.y, `the player does not stand on the origin's ground (phase ${r.phase}) ${JSON.stringify(r)}`).toBeCloseTo(LAND_TOP + 0.95, 1);
      }
    });
  }
});
