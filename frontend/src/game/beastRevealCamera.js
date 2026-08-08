/**
 * beastRevealCamera.js — the per-element framing for the WILDHEART beast reveal (pure).
 *
 * Extracted from the `spawnBeastTransform` test hook in `App.jsx` so the invariant that broke can be
 * TESTED: **the reveal camera must frame the point where the avatar actually renders.** Inline in the hook
 * it was unreachable from any test, and it was wrong for weeks — framed off `rb.translation()` while the
 * avatar rendered at the RigidBody's declared transform, leaving the beast ~20 units below the frame and
 * four `beast-*` baselines showing an empty mountain (see `playerSpawn.js` for the measurement).
 *
 * The offsets themselves are Kevin's art direction and are carried over UNCHANGED — this extraction moved
 * the code, it did not retune the shot.
 */

/** Beast overall heights (from `beastAvatarParts` FORM_PARTS), used to bound how far the shot may sit. */
export const BEAST_HEIGHT = Object.freeze({ fire: 2.45, ice: 1.9, lightning: 2.2, arcane: 2.3 });

/**
 * Per-element 3/4-side reveal framing, as offsets FROM the avatar's rendered origin (feet at origin.y).
 * The big DRAGON (fire) gets a closer, looming angle; the others are wider and lower.
 */
export const REVEAL_OFFSETS = Object.freeze({
  fire: { pos: [1.7, 1.45, 2.8], look: [0, 0.55, 0] },
  ice: { pos: [2.1, 0.8, 3.0], look: [0, -0.15, 0] },
  lightning: { pos: [2.1, 1.1, 3.2], look: [0, 0.2, 0] },
  arcane: { pos: [2.1, 1.2, 3.2], look: [0, 0.3, 0] },
});

/**
 * Build the reveal camera for `element` around `origin` — the point where the avatar RENDERS.
 *
 * @param {string} element  one of fire|ice|lightning|arcane; anything else falls back to fire's framing
 * @param {{x:number,y:number,z:number}|number[]} origin  the avatar's rendered origin
 * @returns {{position:number[], lookAt:number[]}}
 */
export function beastRevealCamera(element, origin) {
  const o = Array.isArray(origin)
    ? { x: origin[0], y: origin[1], z: origin[2] }
    : { x: origin?.x ?? 0, y: origin?.y ?? 0, z: origin?.z ?? 0 };
  const off = REVEAL_OFFSETS[element] || REVEAL_OFFSETS.fire;
  return {
    position: [o.x + off.pos[0], o.y + off.pos[1], o.z + off.pos[2]],
    lookAt: [o.x + off.look[0], o.y + off.look[1], o.z + off.look[2]],
  };
}
