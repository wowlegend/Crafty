// Ocean + coastline profile (World-Design M2). The worldgen shoreline used three magic literals
// (28 the water line, 30 the beach band, 12+n*12 the seabed). This names them + deepens the
// seabed so oceans become a DIVABLE place. Pure math (no state) -> the worker imports + uses it.
//
// SEA_LEVEL (28) and BEACH_BAND_TOP (30) are TWO SEPARATE consts on purpose: water fills up to
// SEA_LEVEL, and sand renders up to BEACH_BAND_TOP, so the 28->30 gap IS the visible shoreline
// (a thin sand beach above the waterline). Do NOT unify them.
export const SEA_LEVEL = 28;        // water fills y <= SEA_LEVEL; foliage only at surfaceY > SEA_LEVEL
export const BEACH_BAND_TOP = 30;   // surfaceY < BEACH_BAND_TOP renders as sand (the beach band)
export const DEEP_FLOOR = 6;        // deepest seabed -> max divable depth = SEA_LEVEL - DEEP_FLOOR = 22

// The ocean blend: as `continent` falls below the threshold, the surface lerps from the land
// baseHeight down toward the deep seabed over a transition band (the shore -> deep ramp).
// De-island (Kevin "seemingly on an island") is DEFERRED to S4b: lowering this pushes every coastline
// outward, which requires relocating the ocean-depth/ocean-coast capture cameras (pinned to the old
// -0.15 shore) to the new ocean + is a "how far from spawn should sea be" taste call — handled as its
// own slice. S4 ships the mountain-taming only; this threshold stays at -0.15 until S4b.
export const OCEAN_CONTINENT_THRESHOLD = -0.15;
export const OCEAN_FULL_SPAN = 0.15; // continent in [-0.30, -0.15] = shore -> full-ocean

export function oceanBlend(continent) {
  return Math.min(1, Math.max(0, (OCEAN_CONTINENT_THRESHOLD - continent) / OCEAN_FULL_SPAN));
}

// Surface height in the OCEAN branch only (the worker keeps `floor(baseHeight)` for land). At
// full ocean the seabed = DEEP_FLOOR + n*4 (∈ [6,10]) -> depth = SEA_LEVEL - seabed ∈ [18,22].
// At the threshold (blend 0) it returns floor(baseHeight), continuous with the land branch.
export function oceanSurfaceY(baseHeight, n, continent) {
  const t = oceanBlend(continent);
  // Clamp n to [0,1] for the seabed: the worldgen `n` overshoots to ~[-0.1,1.1] (the +noise*0.1
  // octave), which would otherwise push the deepest seabed to y5 (depth 23). Clamping keeps the
  // divable depth STRICTLY 18-22 (seabed ∈ [6,10]) — a predictable, bounded basin.
  const seabed = DEEP_FLOOR + Math.min(1, Math.max(0, n)) * 4;
  return Math.floor(baseHeight * (1 - t) + seabed * t);
}

// --- W2 stylized-toon ocean SURFACE (summed Gerstner) ---
// World-space (x,z) in, height around SEA_LEVEL out. 4 summed Gerstner components with world-space
// phase (k.x*x + k.z*z) so the surface is CROSS-CHUNK coherent (no per-chunk reset) and the Ocean.jsx
// plane can be re-positioned under the camera without seams. `time` is the wave clock; the Ocean
// component FREEZES it to a fixed phase in capture mode for byte-stable frames. Pure (no THREE/state)
// -> unit-testable without GL. REPLACES the old voxel-water foam/depth bake (the mesher no longer
// emits water faces; this animated plane owns the whole ocean surface read).
export const WAVES = [
  // [dirX, dirZ, wavelength, amplitude, speed]
  [1.0, 0.35, 18.0, 0.85, 0.55],
  [-0.6, 1.0, 11.0, 0.45, 0.80],
  [0.3, -1.0, 6.5, 0.28, 1.15],
  [1.0, -0.2, 27.0, 0.55, 0.40],
];
const _norm = (x, z) => { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; };

export function gerstnerHeight(x, z, time) {
  let h = 0;
  for (const [dx, dz, wl, amp, spd] of WAVES) {
    const [nx, nz] = _norm(dx, dz);
    const k = (Math.PI * 2) / wl;            // wave number
    const phase = k * (nx * x + nz * z) + time * spd * k;
    h += amp * Math.sin(phase);
  }
  return SEA_LEVEL + h;
}

// Analytic normal from the partial derivatives of the summed height field (recomputed, not the flat
// plane normal -- this is what makes Fresnel + glossy bands read off the REAL surface).
export function gerstnerNormal(x, z, time) {
  let dHdx = 0, dHdz = 0;
  for (const [dx, dz, wl, amp, spd] of WAVES) {
    const [nx, nz] = _norm(dx, dz);
    const k = (Math.PI * 2) / wl;
    const phase = k * (nx * x + nz * z) + time * spd * k;
    const c = amp * k * Math.cos(phase);
    dHdx += c * nx;
    dHdz += c * nz;
  }
  const len = Math.hypot(-dHdx, 1, -dHdz) || 1;
  return [-dHdx / len, 1 / len, -dHdz / len];
}
