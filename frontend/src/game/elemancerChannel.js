/**
 * elemancerChannel.js — S2-B4-M3: the single-slot zone-request transient (the hurlChannel
 * twin). The M5 apply-site produces a request when an IMBUED cast impacts a surface; the
 * M4 bridge consumes it into the live zone registry. Zero store writes (Game-Loop-Isolation);
 * single slot — a second request before consumption overwrites (last-cast-wins, the family
 * convention). No voxel or chunk seams (gated from birth).
 */
let _request = null;

/** requestZone({ kind, pos, chain?, radiusMult? }) — the imbued impact's ask, with the imbue's verb numbers (verbMods). */
export function requestZone(spec) {
  _request = {
    kind: spec.kind,
    pos: { x: spec.pos.x, y: spec.pos.y, z: spec.pos.z },
    chain: Number.isFinite(spec.chain) ? spec.chain : 0,
    radiusMult: Number.isFinite(spec.radiusMult) ? spec.radiusMult : 1,
  };
}

/** consumeZoneRequest() -> the pending request or null (single-shot). */
export function consumeZoneRequest() {
  const r = _request;
  _request = null;
  return r;
}

// S2-B4-M5: the CAST-ARM slot — the latch's 'consume' (Components) hands the armed element
// kind to the projectile spawn (EnhancedMagicSystem) through this second single-slot.
let _castArm = null;
export function armImbueCast(kind) { _castArm = kind; }
export function consumeImbueCast() { const k = _castArm; _castArm = null; return k; }
