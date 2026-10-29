// The right fist's swing and heavy-charge poses in view space, for the viewmodel camera (render/viewmodel.js).
//
// Their offsets are authored in metres for a world camera at 75 degrees vertical on a 16:10 window (AUTHORED_CAMERA). The viewmodel draws at 60 degrees, and the window can be anything from a phone in portrait to 32:9, so here
// each offset is first turned into the same share of the visible half-width (x) or half-height (y) at the viewmodel's
// FOV and the window's aspect. That alone still carries the fist out of frame where the anchor leaves little room (step
// 2 sweeps right from an anchor already right of centre; the charge pulls the fist toward the camera, where the frame
// is narrower), so each gesture is then shrunk, as a whole, until the fist stays inside the frame at every step of it.
// No JSX: tests/gates/hand-pose-gates.test.jsx projects the fist at every step of each sweep and at full charge.
import * as THREE from 'three';
import { VIEWMODEL, GAUNTLET_PARTS } from './viewmodel.js';

export const AUTHORED_CAMERA = Object.freeze({ fov: 75, aspect: 1.6 });

/** The light string's sweep, in metres at AUTHORED_CAMERA: a side arc, the sweep across, the lift and the push away. */
export const SWING = Object.freeze({ arcX: 0.16, sweepX: 0.72, liftY: 0.42, pushZ: 0.42 });

/** The heavy charge at full level: the fist drawn back toward the camera and up (metres at AUTHORED_CAMERA), and turned. */
export const CHARGE = Object.freeze({ offset: Object.freeze([0.1, 0.12, 0.3]), turn: Object.freeze([-0.8, 0.25, 0.35]) });

const FIST = GAUNTLET_PARTS.find((p) => p.name === 'fist');
const FIST_CORNERS = [];
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
  FIST_CORNERS.push(new THREE.Vector3(FIST.pos[0] + (sx * FIST.size[0]) / 2, FIST.pos[1] + (sy * FIST.size[1]) / 2, FIST.pos[2] + (sz * FIST.size[2]) / 2));
}
/** The share of the fist's projected extent a fitted gesture keeps inside the frame at every step. */
export const FIST_SHARE_MIN = 0.95;
const FIT_SAMPLES = 32;
const FIT_STEPS = 14;

const tanHalf = (fovDeg) => Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2);

/** How much an authored metre of offset moves at this aspect and FOV so it crosses the same share of the frame. */
export function frameScale(aspect, fov = VIEWMODEL.fov) {
  const y = tanHalf(fov) / tanHalf(AUTHORED_CAMERA.fov);
  return { x: (y * aspect) / AUTHORED_CAMERA.aspect, y };
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _c = new THREE.Vector3();

/**
 * The share of the fist's projected extent (its box's eight corners, through the viewmodel's projection) that lies
 * inside the frame, for a hand at `position` turned by `rotation` (Euler XYZ array). 0 when a corner is behind the near
 * plane.
 */
export function fistShareInFrame(position, rotation, aspect, fov = VIEWMODEL.fov) {
  _q.setFromEuler(_e.set(rotation[0], rotation[1], rotation[2]));
  const t = tanHalf(fov);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const corner of FIST_CORNERS) {
    _c.copy(corner).applyQuaternion(_q).add(position);
    const depth = -_c.z;
    if (depth <= VIEWMODEL.near) return 0;
    const nx = _c.x / (depth * t * aspect);
    const ny = _c.y / (depth * t);
    if (nx < x0) x0 = nx; if (nx > x1) x1 = nx;
    if (ny < y0) y0 = ny; if (ny > y1) y1 = ny;
  }
  const inX = Math.max(0, Math.min(x1, 1) - Math.max(x0, -1));
  const inY = Math.max(0, Math.min(y1, 1) - Math.max(y0, -1));
  return (inX * inY) / ((x1 - x0) * (y1 - y0));
}

/** The step-`t` pose of a sweep { dir, widthMult } from `anchor`, with its offset scaled by `fit`. */
export function swingPose(t, sweep, anchor, aspect, fit = 1, out = { position: new THREE.Vector3(), rotation: [0, 0, 0] }, rest = [0, 0, 0]) {
  const k = frameScale(aspect);
  const arc = Math.sin(t * Math.PI);
  const ease = Math.sin(t * Math.PI * 0.5);
  out.position.set(
    anchor.x + fit * k.x * (arc * SWING.arcX - ease * SWING.sweepX * sweep.dir * sweep.widthMult),
    anchor.y + fit * k.y * arc * SWING.liftY,
    anchor.z - fit * arc * SWING.pushZ,
  );
  out.rotation[0] = rest[0] - 0.45 + arc * 1.45;
  out.rotation[1] = rest[1] - arc * 0.9 * sweep.dir;
  out.rotation[2] = rest[2] + (arc * 1.15 - t * 2.15) * sweep.dir;
  return out;
}

/** The pose at charge `level` (0 to 1) from `anchor`, with its offset scaled by `fit`. */
export function chargePose(level, anchor, aspect, fit = 1, out = { position: new THREE.Vector3(), rotation: [0, 0, 0] }, rest = [0, 0, 0]) {
  const k = frameScale(aspect);
  const [ox, oy, oz] = CHARGE.offset;
  out.position.set(anchor.x + fit * level * k.x * ox, anchor.y + fit * level * k.y * oy, anchor.z + fit * level * oz);
  out.rotation[0] = rest[0] + CHARGE.turn[0] * level;
  out.rotation[1] = rest[1] + CHARGE.turn[1] * level;
  out.rotation[2] = rest[2] + CHARGE.turn[2] * level;
  return out;
}

const _pose = { position: new THREE.Vector3(), rotation: [0, 0, 0] };

/**
 * The largest fit in [0, 1] at which `shareAt(fit, i)`, the fist's share in frame at sample i, stays at or above
 * FIST_SHARE_MIN at every sample, or at the share the rest of the gesture already has where that is lower (a phone in
 * portrait leaves the resting fist under 0.95 inside), so a gesture never carries the fist further out than its rest.
 */
function largestFit(shareAt) {
  const floor = [];
  for (let i = 0; i <= FIT_SAMPLES; i++) floor.push(Math.min(FIST_SHARE_MIN, shareAt(0, i)));
  const inside = (fit) => {
    for (let i = 0; i <= FIT_SAMPLES; i++) if (shareAt(fit, i) < floor[i]) return false;
    return true;
  };
  if (inside(1)) return 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < FIT_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (inside(mid)) lo = mid; else hi = mid;
  }
  return lo;
}

/** The share of the authored sweep that keeps the fist in frame at every step, at this aspect. */
export function swingFit(sweep, anchor, aspect, rest = [0, 0, 0]) {
  return largestFit((fit, i) => {
    swingPose(i / FIT_SAMPLES, sweep, anchor, aspect, fit, _pose, rest);
    return fistShareInFrame(_pose.position, _pose.rotation, aspect);
  });
}

/** The share of the authored charge that keeps the fist in frame at every level, at this aspect. */
export function chargeFit(anchor, aspect, rest = [0, 0, 0]) {
  return largestFit((fit, i) => {
    chargePose(i / FIT_SAMPLES, anchor, aspect, fit, _pose, rest);
    return fistShareInFrame(_pose.position, _pose.rotation, aspect);
  });
}
