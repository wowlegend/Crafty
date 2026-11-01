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
// covers the whole path.
//
// A capsule grown into the ground by a form swap is lifted out WITHOUT a sweep (`lift`), on its frame and on every frame
// until a step lands it: swept again on a frame that took no step, the lift stopped at any ceiling within it and left
// the capsule in the floor, at 120 Hz and not at 60. So the lift a pending target carries is kept per body and taken
// out of the pending move before the sweep. A step or a teleport makes nextTranslation equal translation exactly
// (measured against real Rapier), and then nothing is pending.
//
// THE SWEEP CANNOT SEE A COLLIDER MADE SINCE THE LAST STEP. The KCC queries Rapier's broad-phase BVH, which only a world
// step updates (rapier3d-compat 0.19.2 has no call that refreshes it), so a placed cell's cuboid or a chunk's rebuilt
// trimesh is passed through by the sweep until the next step (world/placedCellColliders.js). Those colliders come in as
// `unindexed`, and the swept movement is cut where the capsule would meet one, short of it by the controller's offset.

/** The gap the player's controller keeps between its capsule and every collider (Components.jsx creates it with this). */
export const CONTROLLER_OFFSET = 0.05;

const _d = { x: 0, y: 0, z: 0 };
const _still = { x: 0, y: 0, z: 0 };
const _unswept = new WeakMap(); // body -> metres of lift in its pending target

/**
 * Sweep this frame's displacement `d` (plus any move not yet stepped) and set the body's next kinematic translation.
 *   body       the raw Rapier kinematic-position rigid body
 *   kcc        the KinematicCharacterController
 *   collider   the body's collider the KCC sweeps
 *   d          this frame's displacement {x, y, z}, metres
 *   lift       metres added to the target's y without a sweep (a form swap's grow depenetration)
 *   filter     the KCC's filterPredicate
 *   unindexed  colliders created since the last world step, which the KCC's sweep does not see
 *   flags      the KCC's filterFlags (Rapier QueryFilterFlags): the player's controller passes EXCLUDE_DYNAMIC
 * Returns the movement taken (the KCC's swept path from the body's current position, cut short at an unindexed collider).
 */
export function moveKinematic(body, kcc, collider, d, lift = 0, filter = undefined, unindexed = undefined, flags = undefined) {
  const at = body.translation();
  const next = body.nextTranslation();
  const px = next.x - at.x, py = next.y - at.y, pz = next.z - at.z;
  const held = px === 0 && py === 0 && pz === 0 ? 0 : _unswept.get(body) || 0;
  _d.x = d.x + px;
  _d.y = d.y + py - held;
  _d.z = d.z + pz;
  kcc.computeColliderMovement(collider, _d, flags, undefined, filter);
  const m = kcc.computedMovement();
  if (unindexed && unindexed.length > 0) cutAtUnindexed(kcc, collider, m, unindexed);
  const up = held + lift;
  body.setNextKinematicTranslation({ x: at.x + m.x, y: at.y + m.y + up, z: at.z + m.z });
  _unswept.set(body, up);
  return m;
}

/**
 * A teleport the controller's next sweep starts from: the body put at `p` and its collider with it. Rapier moves a body's
 * colliders only at a world step (rapier3d-compat 0.19.2; @react-three/rapier 2.2.0 never propagates), so after a bare
 * setTranslation a frame that took no step swept from the collider's old spot and wrote that movement onto the new one: a
 * load fitted clear of a tunnel's wall went back 0.4 m into its ceiling, and a respawn after a fall at 50 m/s went 0.12 m
 * into the ground (tests/gates/player-placement-gates.test.jsx). A move given on a frame that took no step is dropped
 * with it (at most one 120 Hz frame of walking).
 */
export function placeBody(world, body, p) {
  body.setTranslation(p, true);
  world.propagateModifiedBodyPositionsToColliders();
}

/** Shorten the movement `m` (in place) to stop the controller's offset short of the first unindexed collider it meets. */
function cutAtUnindexed(kcc, collider, m, unindexed) {
  let toi = 1;
  for (const other of unindexed) {
    // A collider removed since it was listed (a chunk re-meshed twice between steps) has no shape left to cast against.
    if (!other.isValid()) continue;
    const hit = collider.castCollider(m, other, _still, 0, 1, false);
    if (hit && hit.time_of_impact < toi) toi = hit.time_of_impact;
  }
  if (toi >= 1) return;
  const len = Math.hypot(m.x, m.y, m.z);
  const keep = len > 0 ? Math.max(0, toi - kcc.offset() / len) : 0;
  m.x *= keep;
  m.y *= keep;
  m.z *= keep;
}
