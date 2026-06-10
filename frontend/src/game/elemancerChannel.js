/**
 * elemancerChannel.js — S2-B4-M3: the single-slot zone-request transient (the hurlChannel
 * twin). The M5 apply-site produces a request when an IMBUED cast impacts a surface; the
 * M4 bridge consumes it into the live zone registry. Zero store writes (Game-Loop-Isolation);
 * single slot — a second request before consumption overwrites (last-cast-wins, the family
 * convention). No voxel or chunk seams (gated from birth).
 */
let _request = null;

/** requestZone({ kind, pos }) — the imbued impact's ask. */
export function requestZone(spec) {
  _request = { kind: spec.kind, pos: { x: spec.pos.x, y: spec.pos.y, z: spec.pos.z } };
}

/** consumeZoneRequest() -> the pending request or null (single-shot). */
export function consumeZoneRequest() {
  const r = _request;
  _request = null;
  return r;
}
