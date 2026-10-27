// The verdict rule of mob-floor.spec.js's fireball test, kept out of the spec so a unit gate can drive it
// (tests/gates/spell-end-verdict-gates.test.js): the spec can only be run in a browser, where the cases that matter —
// a mob ending the spell 6 m out, a boss ending it at 2 m — are a matter of luck and frame length.
//
// A cast is { muzzle: {x, y, z}, end: { by, x, y, z } | null }: where the spell started, and the spell's own record
// of where it ended and what ended it (EnhancedMagicSystem readSpentProjectiles: 'ground' | 'age' | 'mob' | 'boss').

/** The verdict: a spell that ended within this distance of the muzzle burst there; beyond it, the spell flew. */
export const BURST_M = 4;

/** How far from the muzzle the spell ended, by its own record. */
export const flown = (cast) => Math.hypot(cast.end.x - cast.muzzle.x, cast.end.y - cast.muzzle.y, cast.end.z - cast.muzzle.z);

/**
 * Was this cast stopped by a mob or the boss BEFORE it could show whether it flies? Then it is set aside and recast;
 * it is never judged. A mob or boss end BEYOND BURST_M is judged like any other: EnhancedMagicSystem moves a spell in
 * half-metre substeps, tests the ground at every one, and tests mobs and the boss only once a frame's move has not
 * landed — so such an end means the ground test passed all the way out. A 'ground' or 'age' end is always judged:
 * that is where the defect lands (a muzzle burst trips the ground test first, so it never reads 'mob' or 'boss').
 */
export const stoppedShort = (cast) =>
  !!cast.end && (cast.end.by === 'mob' || cast.end.by === 'boss') && flown(cast) <= BURST_M;
