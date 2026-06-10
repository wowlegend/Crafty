/**
 * snareChannel.js — S2-B3-M4: the TRANSIENT channel-state bridge (the hurlChannel pattern).
 * Components writes {channeling, targetId, progress, from, to} per frame; SnareTetherSystem
 * reads it in useFrame. Zero store writes per frame (Game-Loop-Isolation). Single slot.
 */
const _snare = { channeling: false, targetId: null, progress: 0, from: { x: 0, y: 0, z: 0 }, to: { x: 0, y: 0, z: 0 } };
export function writeSnareState(s) { Object.assign(_snare, s); }
export function readSnareState() { return _snare; }
export function clearSnareState() { _snare.channeling = false; _snare.targetId = null; _snare.progress = 0; }

// S2-B3 feel pass: the BIND CEREMONY one-shot (the hurl/slam consume pattern) — fired on
// bind AND on fusion; SnareTetherSystem consumes it into the expanding jade ring.
let _ceremony = null;
export function fireBindCeremony(pos) { _ceremony = { x: pos.x, y: pos.y, z: pos.z }; }
export function consumeBindCeremony() { const c = _ceremony; _ceremony = null; return c; }
