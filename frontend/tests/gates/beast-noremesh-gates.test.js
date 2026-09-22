import { describe, it, expect } from 'vitest';
import { seamBearers, assertDetectorLive, SEAM_OWNER } from './_seamClosure.js';

/**
 * S2-B1-M1 no-re-mesh gate: WILDHEART must touch ZERO voxels. A block edit re-meshes a whole chunk —
 * the worst per-frame op in the engine — and the beast-form collider swap is a Rapier `setShape` plus a
 * mesh shell and particles, never a block edit.
 *
 * REWRITTEN 2026-09-22, selected by `gate-census.mjs` at 0/5. It was a single grep over `beasts.js`s own
 * text with no positive control, so a typo in the forbidden pattern would have disarmed it silently and
 * permanently. Its forbidden list had ALSO already drifted from its two sibling clones — it was missing
 * `update_block` — which is why the seam set now lives in one shared module.
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
describe('beast-form no-re-mesh gate', () => {
  const GATED = [
    'game/beasts.js', // the pure beast-form transform
  ];

  it('the seam detector is LIVE — it can see all six tokens it claims to watch', () => {
    // Every assertion below is an ABSENCE, and an absence asserted by a dead detector reads exactly like
    // a clean codebase. This runs first, in the same process, so a typo in SEAM reds here instead of
    // silently passing every case that follows.
    expect(assertDetectorLive(expect)).toBe(6);
  });

  it('the gated set is non-empty and its size is pinned', () => {
    // R3a: without this, deleting every entry leaves a describe with no cases and a GREEN suite.
    expect(GATED.length).toBe(1);
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
