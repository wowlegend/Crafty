// Guard for the "world coordinates under a moving parent" defect class.
//
// THE BUG IT DETECTS (2026-08-09 audit, two confirmed instances). HurlSystem and SnareTetherSystem were
// both mounted inside the player's <RigidBody>, which rapier drives to the player's world translation
// every physics step. Both then assigned mesh positions from WORLD-space data — the hurl origin from
// `camera.position` (the camera is a sibling of the body, so its position is world), the tether midpoint
// from an ECS mob's world vector. A child of a body at world position P, given world coordinate W,
// renders at P + W. The player spawns at y=100, so the effects drew a hundred metres off.
//
// WHY IT SURVIVED REVIEW, which is the part worth engineering against: the tether's LENGTH and ANGLE were
// correct. `scale.y` comes from `_from.distanceTo(_to)` and the quaternion from a normalized delta — both
// translation-invariant. So the ribbon had exactly the right shape in the wrong place, and the source read
// as correct. Nothing in the code says "my parent must be untransformed"; that assumption lived only in
// the author's head. This module makes it something the running app can check.
//
// Dev-only by construction: the caller wraps it in `import.meta.env.DEV`, so it costs a production build
// nothing.

const EPS = 1e-6;
const _warned = new Set();

/**
 * PURE. Is this matrix the identity — i.e. is the parent at the world origin, unrotated and unscaled, so
 * that a child assigned world coordinates lands where those coordinates say?
 *
 * Tolerant of float noise rather than exact: `matrixWorld` is recomposed from floats every frame, and an
 * exact comparison would fire constantly and train everyone to ignore the warning. A gate that cries wolf
 * protects nothing.
 *
 * A missing or malformed matrix returns FALSE, never true. Failing open is precisely how an instrument
 * reports a clean pass over input it never examined.
 *
 * @param {number[]} elements  THREE.Matrix4.elements (column-major, length 16)
 * @returns {boolean}
 */
export function isWorldSpaceParent(elements) {
  if (!Array.isArray(elements) && !ArrayBuffer.isView(elements)) return false;
  if (elements.length !== 16) return false;
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (let i = 0; i < 16; i++) {
    if (Math.abs(elements[i] - I[i]) > EPS) return false;
  }
  return true;
}

/**
 * Dev-time check: warn if `obj`'s parent is transformed, which means any world-space coordinate this
 * component writes will be offset by the parent's transform.
 *
 * Warns at most ONCE per label. Callers sit in `useFrame`, so an unthrottled warning would emit sixty
 * times a second and bury itself.
 *
 * @param {{parent?: {matrixWorld?: {elements?: number[]}}}|null} obj
 * @param {string} label  the component name, so the message names the culprit rather than the symptom
 */
export function warnIfNotWorldSpace(obj, label) {
  if (_warned.has(label)) return;
  const parent = obj && obj.parent;
  if (!parent) return; // not mounted yet — say nothing rather than guess
  const elements = parent.matrixWorld && parent.matrixWorld.elements;
  if (isWorldSpaceParent(elements)) return;
  _warned.add(label);
  console.warn(
    `[sceneSpace] ${label} writes WORLD coordinates but its parent is transformed. ` +
      'Its meshes will render at parent-transform + world-position. Mount it at the scene root, or ' +
      'convert with parent.worldToLocal(). This is the 2026-08-09 HurlSystem / SnareTetherSystem defect.'
  );
}
