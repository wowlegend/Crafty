// pointerLook.js — DESKTOP mouse-look (replaces drei <PointerLockControls>). drei/three's PLC only
// rotated while its EXACT canvas was document.pointerLockElement (element-match-fragile, version-drift
// prone across drei/three bumps) AND is untestable in our headless harness (capture mode suppresses
// pointer lock) — that combination silently broke mouse-look with no gate to catch it. This is the same
// look MATH the touch path already uses (applyLook; its LOOK_BASE_SENSITIVITY is verbatim three PLC, so
// identical feel), driven by raw mouse movementX/Y while ANY pointer lock is held (lenient — robust to
// whether the canvas or the body holds the lock).
import { applyLook } from './touchMath.js';

/**
 * Apply ONE mouse-move delta to a camera (mutates camera.rotation; no DOM access -> unit-testable with a
 * plain {rotation:{x,y}} stub). movementX/Y are the pointer-lock raw deltas (px). Reuses applyLook's pitch
 * clamp + sensitivity scaling so desktop + touch look identically.
 */
export function applyMouseLook(camera, movementX, movementY, sensitivity = 1) {
  if (!camera || !camera.rotation) return;
  const { yaw, pitch } = applyLook(camera.rotation.y, camera.rotation.x, movementX || 0, movementY || 0, sensitivity);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
}

/**
 * Attach a document `mousemove` listener that rotates `camera` while a pointer lock is active. Lenient gate
 * (`document.pointerLockElement` truthy) so it works regardless of which element holds the lock — the free
 * cursor (menus/UI, no lock) never rotates the view. getSensitivity() pulls the live setting each move.
 * Returns a cleanup fn. (Game-Loop-Isolation: raw event -> camera mutation, never React state.)
 */
export function attachPointerLook({ camera, getSensitivity } = {}) {
  if (typeof document === 'undefined' || !camera) return () => {};
  const onMove = (e) => {
    if (!document.pointerLockElement) return; // only while locked
    const s = (getSensitivity && getSensitivity()) || 1;
    applyMouseLook(camera, e.movementX, e.movementY, s);
  };
  document.addEventListener('mousemove', onMove);
  return () => document.removeEventListener('mousemove', onMove);
}
