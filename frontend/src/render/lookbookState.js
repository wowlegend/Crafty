// lookbookState.js — what the game reads of the lookbook probe's seam, and nothing else.
//
// WHY THE SPLIT. The seam proper (render/lookbookSeam.js: the installer, its validators and the pure helpers behind the
// probe's readings) is for the probe alone: it installs only for `?lookbook=1`, and a player never runs it. It is its
// own chunk, which index.jsx fetches with a dynamic import() on that page only. The game's readers (the Player's
// useFrame, the sun, the post chain, the hands, the dragon, the boss system) run on every page and cannot wait for that
// chunk, so what they read lives here, in the boot chunk, and a static import of the seam from any of them puts the
// seam back there (scripts/ci/bundle-budget.mjs holds the chunk).
//
// Module state on purpose: the pose is read every frame by the Player (a transient read — Game-Loop Isolation), and it
// changes only when a script asks. Every value here is null, false or empty until the installed seam writes it, so a
// page without `?lookbook=1` reads the ordinary game from this module for as long as it lives.

const LOOKBOOK_PARAM = 'lookbook';

let _pose = null;
let _handPose = null;
const _subs = new Set();
// The post passes a script switched off (render/passesOff.js applies them in the composer; render/Sun.jsx reads 'sun').
// Replaced, never mutated, so a reader that kept the previous set keeps a consistent one.
let _passesOff = new Set();
// The pose a dragon woken by the seam holds (lookbookSeam.js DRAGON_POSES), or null: a held dragon takes no flight step
// and starts no attack, so a frame of the fight is the same frame on every run. Read per frame by render/BossEntity.jsx.
let _dragonHold = null;

/** PURE. True only for the exact `lookbook=1` parameter. */
export function parseLookbookParam(search) {
  if (typeof search !== 'string') return false;
  return new URLSearchParams(search).get(LOOKBOOK_PARAM) === '1';
}

/** The pose the seam holds the dragon in, or null (the ordinary fight). Read per frame — keep it a plain read. */
export function lookbookDragonHold() {
  return _dragonHold;
}

/** The named passes switched off, for the per-frame readers. Empty unless a lookbook script asked. */
export function lookbookPassesOff() {
  return _passesOff;
}

/** The pose the Player pins the camera to, or null (the ordinary game). Read per frame — keep it a plain read. */
export function lookbookPose() {
  return _pose;
}

/** For useSyncExternalStore: whether a pose is set. */
/** @internal No game code calls it; only its tests do (registry REVIEW:w2g:test-only-exports). */
export function lookbookPinned() {
  return _pose !== null;
}

/** For useSyncExternalStore: whether the first-person hands hide. A hero pose hides them; an eye pose (`hands: true`)
 *  keeps them, so a still at the eye shows what the player sees. */
export function lookbookHidesHands() {
  return _pose !== null && !_pose.hands;
}

/** The hand pose a script holds in place of the hand rig's clock (render/playerRender.jsx), or null. Read per frame. */
export function lookbookHandPose() {
  return _handPose;
}

/** For useSyncExternalStore: the held hand pose's kind ('swing', 'cast', 'charge') or null. */
export function lookbookHandPoseKind() {
  return _handPose === null ? null : _handPose.kind;
}

/** For useSyncExternalStore: notified on every pose and clear. Returns an unsubscribe function. */
export function subscribeLookbook(cb) {
  _subs.add(cb);
  return () => _subs.delete(cb);
}

/** Pin `camera` to `pose`: position, a level up vector, the look target, the fov, and a rebuilt projection. */
export function applyLookbookPose(camera, pose) {
  camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
  camera.up.set(0, 1, 0);
  camera.lookAt(pose.lookAt[0], pose.lookAt[1], pose.lookAt[2]);
  camera.fov = pose.fov;
  camera.updateProjectionMatrix();
}

// The writers below are called by the installed seam (render/lookbookSeam.js) and by nothing else. The seam validates
// before it writes: a refused value never reaches them.

/** Hold `pose` ({ position, lookAt, fov, hands }, already validated) or, with null, hand the camera back; tell subscribers. */
export function setLookbookPose(pose) {
  _pose = pose;
  for (const cb of _subs) cb();
}

/** Hold a validated hand pose or, with null, let the hand rig's clock drive again; tell subscribers. */
export function setLookbookHandPose(handPose) {
  _handPose = handPose;
  for (const cb of _subs) cb();
}

/** Replace the set of named post passes that are switched off. No notification: the readers poll per frame. */
export function setLookbookPassesOff(names) {
  _passesOff = names;
}

/** Hold the dragon in a pose, or release it with null. No notification: the boss entity reads it per frame. */
export function setLookbookDragonHold(pose) {
  _dragonHold = pose;
}

/** Test seam: resets module state between cases. Called by lookbookSeam.js _resetLookbookForTest, which is the test-only export. */
export function _resetLookbookStateForTest() {
  _pose = null;
  _handPose = null;
  _subs.clear();
  _passesOff = new Set();
  _dragonHold = null;
}
