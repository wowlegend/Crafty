// spellGeometry.js — pure, module-load STATIC silhouette builders for the spell VFX (v7-S3.4+).
// Deterministic (no clock, no Math.random — any jitter is a seeded sin-hash), so the geometry is
// byte-stable and the capture frame stays reproducible. Built ONCE at import; zero per-frame cost.
import * as THREE from 'three';
import { ENERGY_PROFILE } from '../game/spellVisualProfiles';

// Deterministic unit hash (same family as spellVfx BOLT_SEGMENTS / spellMotion strobe) -> [-1,1).
const seededUnit = (seed) => {
  const v = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return (v - Math.floor(v)) * 2 - 1;
};

// Blackbody-ish fire ramp by t in [0,1] (0 = orange base, 1 = white-hot tip), from the fireball palette
// (glowColor orange -> midColor gold -> coreColor white-hot). THREE.Color clones so callers can't mutate.
function fireRamp(t) {
  const base = new THREE.Color(ENERGY_PROFILE.fireball.glowColor); // orange
  const mid = new THREE.Color(ENERGY_PROFILE.fireball.midColor);  // gold
  const tip = new THREE.Color(ENERGY_PROFILE.fireball.coreColor); // white-hot
  return t < 0.5 ? base.clone().lerp(mid, t / 0.5) : mid.clone().lerp(tip, (t - 0.5) / 0.5);
}

// buildFireTeardrop — an upward asymmetric teardrop (a rounded bulb tapering to a pointed tip), TALLER
// than wide, with a slight seeded surface wobble (flame-licked, breaks the perfect surface of revolution)
// and a baked blackbody vertexColor ramp along local-Y. Replaces the symmetric icosahedron fireball read.
// Reference radius ~0.5 so it drops into the existing `size` scale (the icosahedron was size*0.5).
export function buildFireTeardrop() {
  // Lathe profile (Vector2 x=radius, y=height) from base -> tip. Bulb low, taper to ~0 at the tip.
  const BASE_Y = -0.5, TIP_Y = 0.85, N = 12;
  const profile = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;                              // 0 base -> 1 tip
    const y = BASE_Y + (TIP_Y - BASE_Y) * t;
    // radius: a bulb that peaks ~1/4 up then tapers to a point at the tip (teardrop).
    const r = 0.46 * Math.sin(Math.PI * Math.min(1, t * 1.12)) * (1 - t * 0.18);
    profile.push(new THREE.Vector2(Math.max(0.001, r), y));
  }
  const geo = new THREE.LatheGeometry(profile, 18);

  const pos = geo.attributes.position;
  // y-range for the ramp normalization (pre-displacement is fine; displacement is tiny).
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const range = maxY - minY || 1;

  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // small seeded asymmetric wobble so it reads as a living flame, not a lathe-perfect drop.
    pos.setXYZ(i, x + 0.045 * seededUnit(i + 1), y + 0.03 * seededUnit(i + 50), z + 0.045 * seededUnit(i + 99));
    const c = fireRamp((y - minY) / range);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

// Desaturated ice ramp by t in [0,1] (0 = deep teal base, 1 = near-white frost tip). Cold reads
// DESATURATED (the identity vs fire's high saturation).
function iceRamp(t) {
  const base = new THREE.Color('#5A93A8');                       // deep desaturated teal
  const mid = new THREE.Color(ENERGY_PROFILE.iceball.glowColor); // #9FD4E8 ice-cyan
  const tip = new THREE.Color('#EAF6FB');                        // near-white frost edge
  return t < 0.5 ? base.clone().lerp(mid, t / 0.5) : mid.clone().lerp(tip, (t - 0.5) / 0.5);
}

// buildIceShards — a CLUSTER of 3 elongated sharp octahedra (bipyramids) at hand-authored angles/sizes
// (+ a tiny seeded jitter), merged into ONE geometry with a baked desaturated-cyan vertexColor ramp by
// local-Y. Sharp + angular + taller-than-wide ("cold/dangerous" shape language) -- the deliberate
// opposite of the round additive glow-ball. Merged manually (toNonIndexed + position concat) to avoid a
// BufferGeometryUtils import. Flat-shaded (non-indexed -> per-face normals) for crisp crystal facets.
export function buildIceShards() {
  const SHARDS = [
    { t: [0.00, 0.05, 0.00], r: [0.18, 0.0, 0.12], s: [0.42, 1.55, 0.42] },  // tall central spike
    { t: [0.22, -0.12, 0.06], r: [0.50, 0.7, -0.55], s: [0.26, 1.00, 0.26] }, // side shard
    { t: [-0.20, -0.06, -0.10], r: [-0.45, -0.6, 0.65], s: [0.22, 0.85, 0.22] }, // back shard
  ];
  const JIT = 0.05;
  const parts = SHARDS.map((sh, idx) => {
    const g = new THREE.OctahedronGeometry(0.5, 0).toNonIndexed();
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(sh.t[0] + JIT * seededUnit(idx + 1), sh.t[1] + JIT * seededUnit(idx + 10), sh.t[2] + JIT * seededUnit(idx + 20)),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(sh.r[0], sh.r[1], sh.r[2])),
      new THREE.Vector3(sh.s[0], sh.s[1], sh.s[2]),
    );
    g.applyMatrix4(m);
    return g;
  });
  let total = 0;
  for (const g of parts) total += g.attributes.position.count;
  const positions = new Float32Array(total * 3);
  let off = 0;
  for (const g of parts) { positions.set(g.attributes.position.array, off); off += g.attributes.position.array.length; }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const pc = geo.attributes.position;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < pc.count; i++) { const y = pc.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
  const range = maxY - minY || 1;
  const colors = new Float32Array(pc.count * 3);
  for (let i = 0; i < pc.count; i++) {
    const c = iceRamp((pc.getY(i) - minY) / range);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}
