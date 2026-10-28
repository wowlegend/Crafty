// kinematicMove.js — the player controller's one write to its kinematic body per frame (Components.jsx).
//
// THE MOVE NOT YET STEPPED IS SWEPT AGAIN. @react-three/rapier 2.2.0's <Physics> steps the world on a fixed 1/60 s
// accumulator, so a frame shorter than the accumulator's remainder takes no world step at all, and
// setNextKinematicTranslation only names the position the NEXT step moves the body to. Written twice before a step, the
// second write replaced the first and that frame's move was lost: at 120 Hz every other frame takes no step and the
// player walked at half speed, while the mobs (stepped on accumulated time) walked at full speed; at 60 Hz, frame
// jitter alone lost a few percent (tests/integration/kinematic-move-rapier.test.js measures each against real Rapier).
//
// The move given but not yet stepped is nextTranslation() - translation(): Rapier makes the two equal after a step and
// after setTranslation (a teleport drops it). So the KCC sweeps that pending move plus this frame's, from where the
// collider still is, and the target is written from there: no move is lost, and the sweep that resolves collisions
// covers the whole path. A capsule grown into the ground by a form swap (`lift`, not swept, as before) is carried the
// same way, and an upward sweep leaves the penetration.

const _d = { x: 0, y: 0, z: 0 };

/**
 * Sweep this frame's displacement `d` (plus any move not yet stepped) and set the body's next kinematic translation.
 *   body      the raw Rapier kinematic-position rigid body
 *   kcc       the KinematicCharacterController
 *   collider  the body's collider the KCC sweeps
 *   d         this frame's displacement {x, y, z}, metres
 *   lift      metres added to the target's y without a sweep (a form swap's grow depenetration)
 *   filter    the KCC's filterPredicate
 * Returns the KCC's computed movement (the swept path from the body's current position).
 */
export function moveKinematic(body, kcc, collider, d, lift = 0, filter = undefined) {
  const at = body.translation();
  const next = body.nextTranslation();
  _d.x = d.x + (next.x - at.x);
  _d.y = d.y + (next.y - at.y);
  _d.z = d.z + (next.z - at.z);
  kcc.computeColliderMovement(collider, _d, undefined, undefined, filter);
  const m = kcc.computedMovement();
  body.setNextKinematicTranslation({ x: at.x + m.x, y: at.y + m.y + lift, z: at.z + m.z });
  return m;
}
