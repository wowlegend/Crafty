import * as THREE from 'three';

// Shared per-frame SCRATCH objects for GameScene's render drivers (audio-occlusion ray walk +
// weather instancing useFrames). Hoisted VERBATIM from GameScene.jsx (v6 de-monolith A2.0) so
// SpatialAudioController + WeatherSystem can each be extracted while still reusing the SAME
// module-singleton scratch (zero per-frame allocation in the hot loops). Behavior unchanged.
export const _audioDir = new THREE.Vector3();
export const _rayStart = new THREE.Vector3(); // audio-occlusion ray walk scratch (was new'd up to 5x/call/frame)
export const _weatherDummy = new THREE.Object3D();
