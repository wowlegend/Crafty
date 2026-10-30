// @vitest-environment jsdom
// THE CHAOS-PLAY GATE'S LOADS: WHATEVER WROTE A SAVE, ITS LOAD STANDS THE PLAYER NEAR WHERE THEY SAVED, IN NO SOLID CELL.
// A load stands the body at the saved position (DECISIONS 2026-10-30 item 154), and a save on disk can hold a position no
// capsule fits at: the Save button before item 153 wrote the camera rounded to whole metres (into a wall the player stood
// beside, or the head into a two-high ceiling), and the frozen pre-cut fixture holds (3, 21, 6), nine metres into the
// ground here. Each case loads one through the store's loadWorldData into the chaos harness (chaosPlay/harness.js: real Rapier,
// the real mesher, the game's frame order) and reads I1 (the capsule in no solid cell deeper than TOL), I2 (the eye in no
// solid cell) and I5 (released within its frame bound, sideways near the saved spot, never to the origin) from the
// release on, then that the player can walk away. The random sessions (chaos-play-*.test.jsx) load such saves too; these
// cases pin one of each where it is known to be bad.
//
// WHAT THIS DOES NOT CHECK: Components.jsx's own wiring of the load (tests/e2e/load-hold.spec.js drives it in the game).
import { describe, it, expect } from 'vitest';
import PRE_CUT from '../fixtures/pre-cut-save.json';
import { freshStorePerTest, TOL } from './chaosPlay/suite.js';
import {
  makeSession, tick, writeSave, loadSave, deepestSolid, escape, finishSession, mulberry32, LOAD_RELEASE_FRAMES, LAND_TOP,
} from './chaosPlay/harness.js';

const RUNS = [{ hz: 60, lag: 2 }, { hz: 120, lag: 4 }];

/** How deep the base capsule would stand in solid at `p` (the body put there and back). */
function depthAt(S, p) {
  const body = S.p.body;
  const was = body.translation();
  body.setTranslation(p, true);
  const d = deepestSolid(S).depth;
  body.setTranslation(was, true);
  return d;
}

/** Load `data`, play the hold out and 30 frames on, and read what the release left. */
function loadAndPlay(S, data) {
  loadSave(S, data);
  for (let i = 0; i < LOAD_RELEASE_FRAMES(S.lag) + 30; i++) tick(S, { yaw: 0, forward: false });
  finishSession(S);
  const t = S.p.body.translation();
  return {
    counts: { I1: S.counts.I1, I2: S.counts.I2, I5: S.counts.I5 }, at: { x: +t.x.toFixed(2), y: +t.y.toFixed(2), z: +t.z.toFixed(2) },
    violations: Object.fromEntries(Object.entries(S.violations).filter(([, l]) => l.length)), recent: S.recent.slice(-4),
  };
}

const clean = { I1: 0, I2: 0, I5: 0 };

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

    // The old Save button: the camera (the steady eye, 0.67 m over the body's centre) rounded to whole metres.
    for (const c of [
      { name: 'beside the cliff face, z rounded into it', spot: 'cliff', at: { x: -8.3, z: -4.55 } },
      { name: 'in the two-high tunnel, x rounded into its wall and the eye up into its ceiling', spot: 'cave', at: { x: -5.55, z: -9.3 } },
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

  }
});
