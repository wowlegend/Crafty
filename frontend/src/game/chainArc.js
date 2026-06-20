// chainArc.js — PURE jagged-polyline geometry for the chain-lightning inter-target ARC (the signature
// visual that was missing: applyChainLightning dealt damage per hop but drew no bolt between targets).
// Given two world points, returns SEG+1 points zig-zagging from `from` to `to` with DETERMINISTIC
// perpendicular jitter (seeded sin-hash, no Math.random -> capture-stable). Endpoints are EXACT. No THREE
// import (plain number arrays) so it unit-tests in node; the render (spellVfx ChainArc) feeds the flat
// coords into a line bufferGeometry. Style twin of spellVfx's BOLT sin-hash doctrine.

export const ARC_SEGMENTS = 6; // -> ARC_SEGMENTS+1 points per arc

// deterministic pseudo-random in [-1, 1] (sin-hash; no Math.random so capture frames stay byte-stable).
function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

// Accept either {x,y,z} or [x,y,z].
const cx = (p) => (p.x ?? p[0]); const cy = (p) => (p.y ?? p[1]); const cz = (p) => (p.z ?? p[2]);

// Returns a FLAT number[] of (segments+1)*3 coords forming a jagged bolt from `from` to `to`. Interior
// points are offset along two axis-perpendicular directions by up to `jitter`; the two endpoints are exact.
export function chainArcPoints(from, to, { segments = ARC_SEGMENTS, jitter = 0.5, seed = 0 } = {}) {
  const fx = cx(from), fy = cy(from), fz = cz(from);
  const tx = cx(to), ty = cy(to), tz = cz(to);

  // unit axis from -> to
  let ax = tx - fx, ay = ty - fy, az = tz - fz;
  const len = Math.hypot(ax, ay, az) || 1;
  ax /= len; ay /= len; az /= len;

  // a perpendicular basis (perp1 = axis x up; up = +Y, or +X if axis is ~parallel to Y)
  let ux = 0, uy = 1, uz = 0;
  if (Math.abs(ay) > 0.99) { ux = 1; uy = 0; uz = 0; }
  let px = ay * uz - az * uy, py = az * ux - ax * uz, pz = ax * uy - ay * ux;
  const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
  // perp2 = axis x perp1 (for a 3D zig, not just a planar one)
  const qx = ay * pz - az * py, qy = az * px - ax * pz, qz = ax * py - ay * px;

  const out = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    let x = fx + (tx - fx) * t, y = fy + (ty - fy) * t, z = fz + (tz - fz) * t;
    if (i > 0 && i < segments) { // jitter interior points only; endpoints stay exact
      const j1 = hash(seed + i) * jitter;
      const j2 = hash(seed + i + 97) * jitter;
      x += px * j1 + qx * j2; y += py * j1 + qy * j2; z += pz * j1 + qz * j2;
    }
    out.push(x, y, z);
  }
  return out;
}
