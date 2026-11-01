// grounding.js — whether the player stands on ground (Components.jsx's isGrounded, which arms the jump, the coyote time
// and the glue; the chaos harness's Player frame reads it too).
//
// THE CONTROLLER'S GROUNDED FLAG COUNTS A WALL. rapier3d-compat 0.19.2's character controller reads grounded from any
// contact whose normal points up by more than 1e-3, a hair short of horizontal, and a capsule within its offset of a
// trimesh wall gets such contacts on some frames. Each one re-armed the jump, so a held Space climbed a sheer face and a
// one-column shaft, and set the fall to the glue's speed, so a fall down a shaft or along a wall slowed to a slide
// (tests/gates/player-wall-ground-gates.test.jsx). So the flag stands only when something walkable bears the capsule:
//  - a contact of the last sweep on a face within the climb angle of up (the collision's normal1 is the hit face's
//    world normal: a floor reads +1), which is how nearly every grounded frame is borne;
//  - or, on a grounded frame whose sweep met no such face, a cast of the capsule straight down from where the sweep left
//    it that meets one within twice the controller's offset. The controller's snap to ground moves the body with no
//    contact: on flat ground 4 of 240 grounded frames at 60 Hz and 13 of 480 at 120 Hz had none (measured 2026-11-01).
// The cast's hit reads its normal the same way up (measured against rapier3d-compat 0.19.2: a floor under the capsule
// gives normal1.y = +1). A frame the controller calls airborne stays airborne: this removes grounds, never adds one.
//
// Cost: the scan reads the sweep's few collisions; the cast runs only on a grounded frame whose sweep met no floor, and
// allocates in Rapier's binding then (its hit object).

/** The steepest face the player walks up (the controller's setMaxSlopeClimbAngle): a face steeper than this is a wall. */
export const MAX_SLOPE_CLIMB_RAD = Math.PI / 4;
const WALKABLE_Y = Math.cos(MAX_SLOPE_CLIMB_RAD);
const UPRIGHT = Object.freeze({ x: 0, y: 0, z: 0, w: 1 });
const DOWN = Object.freeze({ x: 0, y: -1, z: 0 });

/**
 * Whether the body stands on walkable ground after the controller's last sweep.
 *   kcc       the KinematicCharacterController, after computeColliderMovement
 *   world     the Rapier world
 *   body      the player's kinematic body; nextTranslation() is where the sweep left it
 *   collider  the collider the controller sweeps
 *   filter    the sweep's filterPredicate (the player's own body excluded)
 *   flags     the sweep's filterFlags (Rapier QueryFilterFlags): the debris the sweep passes through is no ground either
 */
export function supportedGround(kcc, world, body, collider, filter = undefined, flags = undefined) {
  if (!kcc.computedGrounded()) return false;
  for (let i = 0; i < kcc.numComputedCollisions(); i++) {
    const c = kcc.computedCollision(i);
    if (c && c.normal1.y >= WALKABLE_Y) return true;
  }
  const hit = world.castShape(body.nextTranslation(), UPRIGHT, DOWN, collider.shape, 0, 2 * kcc.offset(), false, flags, undefined, undefined, body, filter);
  return !!hit && hit.normal1.y >= WALKABLE_Y;
}
