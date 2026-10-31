// The chaos-play gate's body, shared by the three test files that split the six places across vitest's workers.
// What it asserts, and why, is in tests/integration/chaos-play-instruments.test.jsx's header.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { useGameStore } from '../../../src/store/useGameStore.jsx';
import { playSession } from './driver.js';

export const RATES = [60, 120];
export const LAGS = [0, 2, 4, 8];
// I1's tolerance, from the controller: the KCC holds the capsule its offset (0.05 m) clear of every collider it sees, so a
// capsule reaching into a solid cell by a tenth of that has crossed the whole skin it is kept behind. It absorbs float
// noise only: every session on the fixed code reads 0.000 (the deepest over a file's sessions is printed with its
// denominators), and the traps it exists for read 0.05 to 0.62 m.
export const TOL = 0.05 / 10;
// The seed CI plays is 1. CHAOS_SEED plays another, locally (DECISIONS 2026-10-30 item 165 has the table for 1 to 8).
export const SEED = Number(process.env.CHAOS_SEED) || 1;

/** A fresh store for a session: the denial toast's 1 s throttle reads performance.now, 5 s on per read so none is lost. */
export function freshStorePerTest() {
  let clock = 1e7;
  beforeAll(async () => {
    await RAPIER.init();
  });
  beforeEach(() => {
    useGameStore.setState(useGameStore.getInitialState(), true);
    vi.spyOn(performance, 'now').mockImplementation(() => (clock += 5000));
    useGameStore.setState((s) => ({
      addNotification: () => {}, worldBlocks: new Map(), chests: new Map(), selectedBlock: 'grass',
      inventory: { ...s.inventory, blocks: { ...s.inventory.blocks, grass: 64 } },
    }));
  });
  afterEach(() => {
    vi.restoreAllMocks();
    useGameStore.setState(useGameStore.getInitialState(), true);
  });
}

/** What a failed session says: each invariant's count and the first frame of each run of it, with the verbs before it. */
function report(S) {
  const v = Object.fromEntries(Object.entries(S.violations).filter(([, l]) => l.length));
  return JSON.stringify({ counts: S.counts, deepest: S.maxDepth, end: S.end, violations: v });
}

/**
 * One file's share: a session per (place, frame rate, trimesh lag), each asserted on its own, then the risky events the
 * file's sessions reached, against floors set near a third of what they reach (2026-10-30), so a driver change that
 * stops reaching the dangerous geometry fails as SETUP instead of passing over nothing.
 */
export function chaosSuite(spots, floors) {
  const total = {};
  const deepest = { depth: 0, session: null };
  const savedForms = new Set(), triedForms = new Set();
  const walkHeld = [];
  let sessions = 0;
  describe(`chaos play at ${spots.join(' and ')} (seed ${SEED}): the player is never in solid, never has the eye in solid, can always leave, no stand-in outlives its mesh, a load stands them where they saved, the void guard leaves them in a world they stand in, and a body in the rock is stood clear where it clipped`, () => {
    freshStorePerTest();
    for (const spot of spots) for (const hz of RATES) for (const lag of LAGS) {
      it(`${spot}, ${hz} Hz, trimesh ${lag} frames late`, () => {
        const S = playSession({ spot, seed: SEED, hz, lag, tol: TOL });
        sessions++;
        for (const [k, n] of Object.entries(S.stats)) total[k] = (total[k] || 0) + n;
        if (S.maxDepth.value >= deepest.depth) Object.assign(deepest, { depth: S.maxDepth.value, session: `${spot} ${hz} ${lag}` });
        for (const f of S.savedForms) savedForms.add(f);
        for (const h of S.walkHeld) walkHeld.push(`${spot} ${hz} ${lag} f${h.f} (${h.at.x}, ${h.at.y}, ${h.at.z}) ${h.class}`);
        triedForms.add(S.saveForm || 'base');
        const why = report(S);
        expect(S.counts.I1, `I1: the capsule reached into a solid cell deeper than ${TOL} m ${why}`).toBe(0);
        expect(S.counts.I2, `I2: the eye was inside a solid cell ${why}`).toBe(0);
        expect(S.counts.I3, `I3: the player could not leave ${why}`).toBe(0);
        expect(S.counts.I4, `I4: a stand-in outlived its chunk's mesh by more than one step ${why}`).toBe(0);
        expect(S.counts.I5, `I5: a load did not stand the player near the saved spot within its frame bound ${why}`).toBe(0);
        expect(S.counts.I6, `I6: the void guard reset a player who had ground under their feet ${why}`).toBe(0);
        expect(S.counts.I7, `I7: a body in the rock was not stood clear near where it clipped, or one that never clipped was moved ${why}`).toBe(0);
        expect(S.end, `I4: stand-ins or edits remain at the end of the session ${why}`).toEqual({ standIns: 0, queued: 0 });
        expect(S.stats.escapes, `SETUP: the session ran no escape test ${why}`).toBeGreaterThan(0);
      });
    }
    it('reached the risky events it exists for (denominators)', () => {
      // Written past vitest's console capture, which shows a passing test's console output nowhere: the denominator is read
      // on every run, green or red.
      process.stdout.write(`\nchaos play at ${spots.join(', ')} (seed ${SEED}): ${sessions} sessions, ${total.frames} frames; deepest in solid `
        + `${deepest.depth.toFixed(3)} m (${deepest.session}); saved in ${[...savedForms].sort().join(', ')}; ${JSON.stringify(total)}\n`
        + `walk-held (${walkHeld.length}): ${walkHeld.join('; ') || 'none'}\n`);
      expect(sessions, 'SETUP: a session did not finish').toBe(spots.length * RATES.length * LAGS.length);
      // Every session tries its save in its form; a form with no room where the session stands (the bull or the golem in
      // the tunnel) is refused and saved in the base shape, so the forms actually saved in are printed, and floored as
      // savesInForm. chaos-play-loads.test.jsx loads a save in each form where it fits.
      expect([...triedForms].sort(), 'SETUP: the sessions did not try a save in every form and the base shape').toEqual(['arcane', 'base', 'fire', 'ice', 'lightning']);
      for (const [k, floor] of Object.entries(floors)) {
        expect(total[k] ?? 0, `SETUP: ${k} reached ${total[k] ?? 0}, under its floor of ${floor}: the driver no longer reaches that geometry`).toBeGreaterThanOrEqual(floor);
      }
    });
  });
}

/** The floors every file's sixteen sessions must reach (each session presses into a wall, swaps form, saves then loads,
 *  and falls through the void, which the void guard reads: I6's denominator). */
export const COMMON_FLOORS = {
  rightClicksIntoBody: 100, wallContactFrames: 500, clickPairs: 40, swaps: 12, swapsAgainstWall: 3, swapsRefused: 2, loads: 16,
  loadHoldFrames: 12, loadsReleased: 16, savesLegacy: 2, savesInForm: 6, respawns: 16, escapes: 32, ownShellOut: 1,
  voidResets: 16, deleteClicks: 20, cellsDeleted: 250, deletesUnderFeet: 12,
};
