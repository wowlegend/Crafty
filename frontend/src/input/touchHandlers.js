/**
 * touchHandlers.js -- the dependency-injected glue between the M0 pure math and the live game.
 * The TouchControls component owns the DOM/refs; this owns the per-event effect so it unit-tests
 * with a fake camera + spy setIntent (no DOM, no R3F). Game-Loop-Isolation preserved: callers
 * invoke these from raw touch listeners writing setIntent / camera mutation -- never React state.
 */
import { joystickToMove, applyLook } from './touchMath.js';

export const MOVE_KEYS = ['moveF', 'moveB', 'moveL', 'moveR'];

/**
 * Apply a touchmove event's changed touches: move-zone -> quantized boolean move intents;
 * look-zone -> camera.rotation yaw/pitch (reusing the M0 clamp). deps = {camera,setIntent,sensitivity}.
 */
export function handleTouchMove(router, touchList, { camera, setIntent, sensitivity = 1 }) {
  for (const t of touchList) {
    const r = router.onMove(t);
    if (!r) continue;
    if (r.zone === 'move') {
      const m = joystickToMove(r.vecX, r.vecY);
      for (const k of MOVE_KEYS) setIntent(k, m[k]); // write every key every frame (keydown/up parity)
    } else if (camera && camera.rotation) {
      const { yaw, pitch } = applyLook(camera.rotation.y, camera.rotation.x, r.dx, r.dy, sensitivity);
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
    }
  }
}

/** On touch end/cancel: if the released touch owned the MOVE zone, clear all four move intents. */
export function handleTouchEnd(router, touchList, { setIntent }) {
  for (const t of touchList) {
    const r = router.onEnd(t);
    if (r && r.zone === 'move') for (const k of MOVE_KEYS) setIntent(k, false);
  }
}
