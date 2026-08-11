import * as THREE from 'three';

// Shared per-frame SCRATCH objects for GameScene's render drivers (audio-occlusion ray walk +
// weather instancing useFrames). Hoisted VERBATIM from GameScene.jsx (v6 de-monolith A2.0) so
// SpatialAudioController + WeatherSystem can each be extracted while still reusing the SAME
// module-singleton scratch (zero per-frame allocation in the hot loops). Behavior unchanged.
export const _audioDir = new THREE.Vector3();
export const _rayStart = new THREE.Vector3(); // audio-occlusion ray walk scratch (was new'd up to 5x/call/frame)
// DELIBERATELY NOT EXPORTED. Reachable only through weatherDummy() below, so a consumer cannot obtain
// the scratch in an inherited state — the export is what made the rotation leak possible.
const _weatherDummy = new THREE.Object3D();

/**
 * The weather scratch, HANDED BACK IN A DECLARED STATE.
 *
 * Three instancing loops share `_weatherDummy` and only ONE of them (snow) ever writes `rotation`, so
 * rain and firefly instances silently inherited whatever Euler the last snowflake left — permanently,
 * since nothing reset it. Because Object3D.updateMatrix composes from the quaternion and three keeps it
 * synced on `rotation.set`, that leaked straight into every instance matrix. The firefly loop runs after
 * snow in the SAME frame, so low-poly firefly spheres tumbled the instant it started snowing at night.
 *
 * Taking the scratch through this function makes the reset structural instead of remembered: a fourth
 * loop added later cannot inherit state it never set. Reset once per loop, not per instance — the
 * per-instance writes below overwrite position and scale anyway.
 */
export function weatherDummy() {
  _weatherDummy.position.set(0, 0, 0);
  _weatherDummy.rotation.set(0, 0, 0);
  _weatherDummy.scale.set(1, 1, 1);
  return _weatherDummy;
}
