// Declared REST POSES for capture, and the resets that restore them.
//
// A capture guard must RESET to a declared value, never early-`return`. Stopping an animation leaves it
// wherever it happened to get to, and capture is enabled AFTER a boot whose length varies 1.68-10.43 s
// between processes — so a freeze is itself run-dependent. The value must be DECLARED (and the markup must
// read the same constant) or the rest pose and the seam drift apart silently, which is the failure the
// mascot's `MASCOT_REST` was introduced to end.
//
// Pure functions, no React and no THREE import: they take the objects and mutate them, so a unit test can
// drive them with real `THREE.Object3D`s — or plain stubs — and assert the resulting numbers.

/**
 * The dragon's declared rest pose. `rotation` is the part that was MISSING: the old capture branch reset
 * the wings and the position and left `rotation` alone, while the flight loop writes `rotation.y` (turn)
 * and `rotation.x` (pitch) every frame. So the captured dragon held whatever heading it happened to have
 * when the flag flipped — a different one per run, which is exactly what the guard existed to prevent.
 */
export const BOSS_REST = Object.freeze({
  rotation: Object.freeze([0, 0, 0]),
  leftWingZ: 0.2,
  rightWingZ: -0.2,
});

/**
 * Put the boss into its declared rest pose. Returns the number of objects it actually reset, so a caller
 * or a test can assert it saw something — a reset that silently found every ref null is indistinguishable
 * from a reset that worked.
 *
 * @param {{mesh?: object, leftWing?: object, rightWing?: object}} refs  live THREE objects (any may be null)
 * @param {number[]|null} spawnPos  the forced spawn position, or null to leave position alone
 * @returns {number} how many objects were reset
 */
export function bossCaptureReset(refs, spawnPos) {
  let n = 0;
  const { mesh, leftWing, rightWing } = refs || {};
  if (leftWing && rightWing) {
    leftWing.rotation.z = BOSS_REST.leftWingZ;
    rightWing.rotation.z = BOSS_REST.rightWingZ;
    n += 2;
  }
  if (mesh) {
    if (spawnPos) mesh.position.set(spawnPos[0], spawnPos[1], spawnPos[2]);
    // The line the old guard did not have. Without it the frame samples a run-dependent heading.
    mesh.rotation.set(BOSS_REST.rotation[0], BOSS_REST.rotation[1], BOSS_REST.rotation[2]);
    n += 1;
  }
  return n;
}

/**
 * Drain pending knockback impulses.
 *
 * Under capture the impulse is CLEARED WITHOUT DISPLACING — that is the declared reset. The old code
 * returned before this loop entirely, so an impulse stamped in the instant before the flag flipped was
 * never cleared: this loop is its only reader, so it sat on the entity for the whole capture session and
 * then fired on the way out. Whether any entity carries one at capture time is a race, which is precisely
 * the run-dependence the guard was meant to remove.
 *
 * @param {Iterable<object>} entities
 * @param {number} delta  seconds since the last frame
 * @param {boolean} capture  true to clear without moving
 * @returns {number} eligible entities drained — the DENOMINATOR, so "nothing moved" can be told apart
 *                   from "nothing was looked at"
 */
export function drainKnockback(entities, delta, capture) {
  let drained = 0;
  for (const e of entities || []) {
    if (!e || e.health <= 0 || e.isStatic || !e.knockback) continue;
    if (!capture) {
      e.position.x += e.knockback[0] * delta * 4;
      e.position.z += e.knockback[2] * delta * 4;
      e.snapSync = true; // MobModel exact-copies this frame so the shove reads instant, not damped
    }
    e.knockback = null;
    drained++;
  }
  return drained;
}
