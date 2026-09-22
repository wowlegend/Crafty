import { describe, it, expect } from 'vitest';
import { seamBearers, assertDetectorLive, SEAM_OWNER } from './_seamClosure.js';

/**
 * S2-B4-M3: the ELEMANCERs v1 promise is ZERO voxel edits, ZERO worker traffic, ZERO re-mesh — the
 * designs central deliverable. These files were gated from birth, before any render existed.
 *
 * REWRITTEN 2026-09-22 to walk the import closure rather than each files own text, and to share one seam
 * definition with its two sibling gates instead of a fourth hand-copied stencil. The zone-slow wiring
 * locks that used to sit in this file moved to `elemancer-wiring-gates.test.js`: they assert a PRESENCE,
 * which is a different claim with a different failure mode, and mixing them here meant one describe block
 * whose name was true of only half its cases.
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
describe('elemancer no-re-mesh gate', () => {
  const GATED = [
    'game/elemancer.js',                 // the imbue latch
    'game/resonance.js',                 // the build-verb economy
    'game/elementZones.js',              // the chemistry core
    'game/elemancerChannel.js',          // the zone request transient
    'world/ElementZoneSystem.jsx',       // the M4 bridge (chemistry -> combat)
    'world/ElementZoneRenderSystem.jsx', // the M6 look (rings + char)
  ];

  it('the seam detector is LIVE — it can see all six tokens it claims to watch', () => {
    // Every assertion below is an ABSENCE, and an absence asserted by a dead detector reads exactly like
    // a clean codebase. This runs first, in the same process, so a typo in SEAM reds here instead of
    // silently passing every case that follows.
    expect(assertDetectorLive(expect)).toBe(6);
  });

  it('the gated set is non-empty and its size is pinned', () => {
    // R3a: without this, deleting every entry leaves a describe with no cases and a GREEN suite.
    expect(GATED.length).toBe(6);
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
