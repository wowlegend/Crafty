/**
 * touchMath.js — PURE touch→intent math (NO React / DOM / Three imports; node-testable).
 *
 * Consumed by the M1 touch overlay, which feeds these results into the EXISTING seams:
 *   joystickToMove → setIntent('moveF'|'moveB'|'moveL'|'moveR', bool)  (the boolean intent SoT)
 *   applyLook      → camera.quaternion (the same YXZ-euler path drei <PointerLockControls> uses)
 *   makeTouchRouter→ partitions simultaneous fingers so a look-drag never moves the player
 *
 * Same purity contract as input/inputState.js — framework-free so the whole thing unit-tests in
 * node with zero GPU. Spec: docs/superpowers/specs/2026-06-13-crafty-touch-input-design.md
 */

/** Joystick deadzone in px from the (floating) origin — below this, no movement intent. */
export const DEFAULT_DEADZONE = 8;

/**
 * Map a joystick vector (screen-space: +x right, +y DOWN) to the four boolean movement
 * intents via a deadzone + 8-way dominant-octant. Forward (moveF) = up = −y.
 * GUARANTEES the result never sets an opposing pair (moveF&moveB or moveL&moveR) — the
 * eight sectors are mutually exclusive, and no single sector spans two opposite cardinals.
 * @returns {{moveF:boolean,moveB:boolean,moveL:boolean,moveR:boolean}}
 */
export function joystickToMove(vecX, vecY, deadzone = DEFAULT_DEADZONE) {
  const out = { moveF: false, moveB: false, moveL: false, moveR: false };
  if (Math.hypot(vecX, vecY) < deadzone) return out;
  // atan2(-y, x): 0=right(E), 90=up(N/forward), ±180=left(W), -90=down(S/back).
  const deg = Math.atan2(-vecY, vecX) * 180 / Math.PI;
  let s = Math.round(deg / 45);      // -4..4 (eight 45° sectors)
  if (s === -4) s = 4;               // -180° and 180° both = West
  switch (s) {
    case 0: out.moveR = true; break;                       // E
    case 1: out.moveF = true; out.moveR = true; break;     // NE
    case 2: out.moveF = true; break;                       // N
    case 3: out.moveF = true; out.moveL = true; break;     // NW
    case 4: out.moveL = true; break;                       // W
    case -3: out.moveB = true; out.moveL = true; break;    // SW
    case -2: out.moveB = true; break;                      // S
    case -1: out.moveB = true; out.moveR = true; break;    // SE
  }
  return out;
}

/** Base look sensitivity, rad/px — VERBATIM from three's PointerLockControls (onMouseMove). */
export const LOOK_BASE_SENSITIVITY = 0.002;
/** Pitch clamp — matches PLC (minPolarAngle 0.05) and the controller's defensive clamp (Components:1218). */
export const MAX_PITCH = Math.PI / 2 - 0.05;

/**
 * Accumulate a touch-drag delta into yaw/pitch, mirroring PointerLockControls' math:
 * yaw −= dx·k, pitch −= dy·k, pitch clamped to ±MAX_PITCH (yaw unclamped). k = base·sensitivity.
 * @returns {{yaw:number,pitch:number}}
 */
export function applyLook(yaw, pitch, dx, dy, sensitivity = 1) {
  const k = LOOK_BASE_SENSITIVITY * sensitivity;
  const nextPitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, pitch - dy * k));
  return { yaw: yaw - dx * k, pitch: nextPitch };
}

/**
 * A per-Touch.identifier zone router (pure factory; no DOM — feed it Touch-like
 * {identifier,clientX,clientY} objects). Left half of the viewport = 'move' (joystick,
 * vector from origin); right half = 'look' (incremental drag delta). Binding the zone at
 * touchstart for the touch's lifetime guarantees a look-drag never contaminates the move
 * vector (spec §3 trap: multi-touch identity).
 */
export function makeTouchRouter() {
  const touches = new Map(); // identifier -> {zone, originX, originY, lastX, lastY}
  return {
    onStart(touch, viewportWidth) {
      const zone = touch.clientX < viewportWidth / 2 ? 'move' : 'look';
      touches.set(touch.identifier, {
        zone, originX: touch.clientX, originY: touch.clientY,
        lastX: touch.clientX, lastY: touch.clientY,
      });
      return { zone };
    },
    onMove(touch) {
      const t = touches.get(touch.identifier);
      if (!t) return null;
      if (t.zone === 'move') {
        return { zone: 'move', vecX: touch.clientX - t.originX, vecY: touch.clientY - t.originY };
      }
      const dx = touch.clientX - t.lastX, dy = touch.clientY - t.lastY;
      t.lastX = touch.clientX; t.lastY = touch.clientY;
      return { zone: 'look', dx, dy };
    },
    onEnd(touch) {
      const t = touches.get(touch.identifier);
      if (!t) return null;
      touches.delete(touch.identifier);
      return { zone: t.zone };
    },
    get activeCount() { return touches.size; },
  };
}
