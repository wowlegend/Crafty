/**
 * snareChannel.js — S2-B3-M4: the TRANSIENT channel-state bridge (the hurlChannel pattern).
 * Components writes {channeling, targetId, progress, from, to} per frame; SnareTetherSystem
 * reads it in useFrame. Zero store writes per frame (Game-Loop-Isolation). Single slot.
 */
const _snare = { channeling: false, targetId: null, progress: 0, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 } };
export function writeSnareState(s) { Object.assign(_snare, s); }
export function readSnareState() { return _snare; }
export function clearSnareState() { _snare.channeling = false; _snare.targetId = null; _snare.progress = 0; }
