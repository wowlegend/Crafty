import { addTrauma, traumaFromWeight, decayTrauma } from './trauma.js';

/**
 * cameraShakeChannel.js — the live screenshake trauma, OUT of the store.
 *
 * WHY IT MOVED. Trauma decays every frame while a shake is running, and it lived in zustand, so the decay
 * ran a `set()` once per frame from inside useFrame: ~30 store notifications per hit, each one re-running
 * every subscriber's selector across the whole app. That is exactly the binding this project's
 * Game-Loop-Isolation rule forbids — a high-frequency imperative value driven through reactive state.
 *
 * And it bought nothing. The ONLY reader is the player controller's useFrame, which already read it
 * transiently via `getState()`; no component ever subscribed, and it was never persisted. So the value has
 * no business being in the store at all. This is the same single-slot transient shape as hurlChannel and
 * elemancerChannel — no React, no store, no per-frame allocation.
 *
 * The store still exposes `triggerCameraShake` / `decayCameraShake` as thin delegates, so the eight
 * producers keep calling exactly what they called before. What changed is that neither one writes state.
 */

let _trauma = 0;
let _dirX = 0;
let _dirZ = 0;

/**
 * Add an impact. `weight` is HOW HARD THE HIT WAS (0.4 for a spell that missed, 1.8 for the boss roar),
 * mapped into the model's declared [0,1] and ACCUMULATED — see trauma.js for why both of those matter.
 * Omitting the direction preserves the one already set, so the bias survives the multi-frame falloff.
 */
export function addShake(weight = 1.0, dirX, dirZ) {
  _trauma = addTrauma(_trauma, traumaFromWeight(weight));
  if (dirX !== undefined) {
    _dirX = dirX;
    _dirZ = dirZ;
  }
}

/** Frame-rate-independent falloff. Snaps to 0 at the floor so the shake ends cleanly. */
export function decayShake(dt) {
  _trauma = decayTrauma(_trauma, dt);
}

/** Current trauma in [0,1]. */
export function shakeTrauma() {
  return _trauma;
}

/** Current bias direction as [x, z]. Returned as a fresh pair only on read, which is not a hot path. */
export function shakeDir() {
  return [_dirX, _dirZ];
}

/** Test/teardown only — a module singleton would otherwise leak trauma between cases. */
export function _resetShake() {
  _trauma = 0;
  _dirX = 0;
  _dirZ = 0;
}
