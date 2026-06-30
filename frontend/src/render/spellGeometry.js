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
