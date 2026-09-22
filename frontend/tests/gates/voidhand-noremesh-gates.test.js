import { describe, it, expect } from 'vitest';
import { seamBearers, assertDetectorLive, SEAM_OWNER } from './_seamClosure.js';

/**
 * S2-B2-M1: VOIDHANDs load-bearing invariant is that a combat grab touches ZERO voxels — it spawns a
 * pooled PHANTOM proxy, never a block edit. (The optional CALM real-edit grab is a deferred fast-follow
 * living in the out-of-combat Terrain build path, not among these files.)
 *
 * REWRITTEN 2026-09-22 from a per-file text grep to a transitive import-closure check. The old form
 * answered "does this file spell a seam token", which is not the invariant. `Components.jsx` reaches 93
 * modules and `world/HurlSystem.jsx` reaches 34 — all of them ungated until now, so a seam two hops away
 * was invisible.
 *
 *
 * BLIND SPOT, stated inline (R7) rather than only in the shared helper, because a reader of this file
 * alone should learn what it cannot see: it proves unreachability through the STATIC import graph. A seam
 * reached via a dynamic specifier, a global, or an injected callback is invisible to it, and so is a voxel
 * edit performed by a module nothing imports.
 *
 * Mutation-Proof: 4 mutations against the shared instrument, all RED (recorded on the commit):
 *   M1 typo one alternative in SEAM        -> the detector-live case RED (a dead detector cannot pass)
 *   M2 a seam inside a gated module        -> that module's closure case RED
 *   M3 a seam TWO HOPS away in the closure -> RED; the per-file grep this replaced could not see it
 *   M4 drop an entry from GATED            -> the pinned-size case RED
 */
describe('voidhand no-re-mesh gate', () => {
  const GATED = [
    'game/voidhand.js',            // the pure grab state machine
    'game/kinetic.js',             // the kinetic economy
    'world/PhantomBlockSystem.jsx',// the held-phantom render proxy
    'Components.jsx',              // the SM wiring surface — where M3 HURL/SLAM lands
    'devtest/perfProbe.js',        // M2 probe mode/channel
    'devtest/PerfProbeRunner.jsx', // M2 scenario driver
    'devtest/PerfProbeSystem.jsx', // M2 dynamic hurl stand-in
    'game/hurl.js',                // M3 pure flight/impact core
    'game/hurlChannel.js',         // M3 transient verb channel
    'world/HurlSystem.jsx',        // M3 flight mesh + impact application
    'world/SnareTetherSystem.jsx', // S2-B3-M4 snare tether
    'world/SquadAISystem.jsx',     // S2-B3-M5 squad bridge
  ];

  it('the seam detector is LIVE — it can see all six tokens it claims to watch', () => {
    // Every assertion below is an ABSENCE, and an absence asserted by a dead detector reads exactly like
    // a clean codebase. This runs first, in the same process, so a typo in SEAM reds here instead of
    // silently passing every case that follows.
    expect(assertDetectorLive(expect)).toBe(6);
  });

  it('the gated set is non-empty and its size is pinned', () => {
    // R3a: without this, deleting every entry leaves a describe with no cases and a GREEN suite.
    expect(GATED.length).toBe(12);
  });

  for (const rel of GATED) {
    it(`${rel} cannot REACH a voxel edit through its import graph`, () => {
      const bearers = seamBearers(rel);
      // The boundary is asserted, not whitelisted (gate-authoring class 10): the store is the one module
      // in the estate that owns a voxel seam, so the claim is that it is the ONLY one reachable — a seam
      // appearing anywhere else in the closure, or a second one, reds here.
      expect(bearers.filter((f) => f !== SEAM_OWNER),
        `${rel} reaches a voxel/chunk seam outside the declared owner`).toEqual([]);
    });
  }
});
