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
// De-island (Kevin "seemingly on an island") EXECUTED in W2-T7 (2026-06-17): the threshold dropped
// -0.15 -> -0.35 to push every coastline outward, paired with a lower continent-noise frequency in
// heightAt.js (0.002 -> 0.0011, bigger landmasses). Measured (seed 12345): nearest deep water moved
// from 27m to 98m (8-cardinal). The ocean-depth/ocean-coast/hearth capture cameras were re-posed to
// the new coast in the same slice. OCEAN_FULL_SPAN (the shore->deep RAMP width) is unchanged — it's a
// separate concern from WHERE the shore sits; the ramp now runs continent [-0.50, -0.35].
export const OCEAN_CONTINENT_THRESHOLD = -0.35;
export const OCEAN_FULL_SPAN = 0.15; // continent in [thr - SPAN, thr] = shore -> full-ocean (ramp width)

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
// --- REAL-OCEAN SURFACE (true Gerstner, deep-water dispersion) ---
//
// Kevin, 2026-08-08: "make it more tropical and dynamic looking, its waves should be moving like real
// ocean." Two things were wrong, and the second one is why it never read as water.
//
// (1) IT WAS NOT GERSTNER. It was a sum of four sines with the name attached. A sine sum gives round
// symmetric swell; real water piles up toward the crest, so crests are SHARP and troughs are BROAD.
// That asymmetry is the single strongest "that is the sea" cue and it comes from HORIZONTAL
// displacement, which a height-only field cannot express at any amplitude.
//
// (2) THE DISPERSION WAS INVERTED. Deep-water waves travel at c = sqrt(g/k), so a long swell OUTRUNS
// short chop. The old table ran the other way -- 6.5m chop at 0.55, a 27m swell at 0.40 -- so the
// small stuff raced across the big stuff. Real seas never look like that, and no amount of colour
// tuning fixes it, because the eye reads relative motion before it reads hue. Speed is now DERIVED
// from wavelength rather than typed, so the relation cannot be broken by editing one row.
//
// Six components on a spread of headings: a dominant swell plus wind chop at an angle to it, which is
// what stops the surface reading as a repeating corduroy. World-space phase keeps it cross-chunk
// coherent so the plane can slide under the camera without a seam, and `time` is frozen by Ocean.jsx
// in capture mode, so every frame stays byte-stable.
export const GRAVITY = 9.81;
/** Scales real m/s into game-plausible motion. The DISPERSION RATIO between waves is preserved. */
export const WAVE_TIME_SCALE = 0.14;
/** Gerstner steepness Q. Sum of Q*k*A must stay <= 1 or the surface folds through itself. */
export const STEEPNESS = 1.0;

const _dispersion = (wl) => Math.sqrt(GRAVITY / ((Math.PI * 2) / wl)) * WAVE_TIME_SCALE;

// [dirX, dirZ, wavelength, amplitude] -- speed is DERIVED, never typed.
const _SPEC = [
  [1.0, 0.18, 34.0, 0.75],
  [0.82, -0.55, 21.0, 0.5],
  [0.45, 0.95, 13.0, 0.32],
  [-0.35, 0.9, 8.5, 0.2],
  [0.95, -0.3, 5.5, 0.12],
  [-0.7, -0.65, 3.5, 0.07]
];

/** [dirX, dirZ, wavelength, amplitude, speed] -- speed derived from the deep-water relation. */
export const WAVES = _SPEC.map(([dx, dz, wl, amp]) => [dx, dz, wl, amp, _dispersion(wl)]);

const _norm = (x, z) => {
  const l = Math.hypot(x, z) || 1;
  return [x / l, z / l];
};

// Per-wave derived constants, precomputed ONCE. gerstnerHeight/Normal/Displace run per-vertex per-frame
// over the whole plane, so a fresh array or a re-derived wave number in that loop is pure garbage.
const _WAVES_D = WAVES.map(([dx, dz, wl, amp, spd]) => {
  const [nx, nz] = _norm(dx, dz);
  const k = (Math.PI * 2) / wl;
  return { nx, nz, k, amp, spd, wa: k * amp };
});

/**
 * Full Gerstner vertex: where this parcel of water actually sits, horizontal displacement included.
 * Returns world (x, y, z). The x/z shift is what sharpens the crests -- see note (1) above.
 */
export function gerstnerDisplace(x, z, time) {
  let dx = 0;
  let dz = 0;
  let h = 0;
  for (let i = 0; i < _WAVES_D.length; i++) {
    const w = _WAVES_D[i];
    const phase = w.k * (w.nx * x + w.nz * z) + time * w.spd * w.k;
    const c = Math.cos(phase);
    dx += STEEPNESS * w.amp * w.nx * c;
    dz += STEEPNESS * w.amp * w.nz * c;
    h += w.amp * Math.sin(phase);
  }
  return { x: x + dx, y: SEA_LEVEL + h, z: z + dz };
}

export function gerstnerHeight(x, z, time) {
  let h = 0;
  for (let i = 0; i < _WAVES_D.length; i++) {
    const w = _WAVES_D[i];
    const phase = w.k * (w.nx * x + w.nz * z) + time * w.spd * w.k;
    h += w.amp * Math.sin(phase);
  }
  return SEA_LEVEL + h;
}

/**
 * Analytic normal of the DISPLACED surface -- this is what Fresnel, the glossy bands and the foam all
 * read off, so it has to describe the surface that is actually drawn.
 *
 * It is NOT the height-field gradient. That form is only correct when the sample point does not move,
 * and Gerstner moves it: the y term picks up a `1 - sum(Q*k*A*sin)` factor because the parcel is being
 * dragged toward the crest as it rises. Keeping the old gradient here would have left the lighting
 * reading a rounder surface than the one on screen -- subtly wrong everywhere and hardest to spot
 * exactly where the new crests are sharpest.
 */
export function gerstnerNormal(x, z, time) {
  let nx = 0;
  let nz = 0;
  let ny = 1;
  for (let i = 0; i < _WAVES_D.length; i++) {
    const w = _WAVES_D[i];
    const phase = w.k * (w.nx * x + w.nz * z) + time * w.spd * w.k;
    nx -= w.nx * w.wa * Math.cos(phase);
    nz -= w.nz * w.wa * Math.cos(phase);
    ny -= STEEPNESS * w.wa * Math.sin(phase);
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

// ALLOCATION-FREE VARIANTS, for the per-vertex loop.
//
// Ocean's useFrame calls gerstnerDisplace and gerstnerNormal once per vertex per frame. On a 96x96 plane
// that is ~9,400 object literals and ~9,400 arrays EVERY FRAME -- roughly 18,800 short-lived allocations
// at display refresh, which is a GC sawtooth in the one loop that must not stutter. The object-returning
// forms stay, because they read better at the dozen call sites that run once; these exist for the loop.
//
// The caller owns the target, so there is no shared module scratch to leak between callers.

/** @param {{x:number,y:number,z:number}} out */
export function gerstnerDisplaceInto(out, x, z, time) {
  let dx = 0;
  let dz = 0;
  let h = 0;
  for (let i = 0; i < _WAVES_D.length; i++) {
    const w = _WAVES_D[i];
    const phase = w.k * (w.nx * x + w.nz * z) + time * w.spd * w.k;
    const c = Math.cos(phase);
    dx += STEEPNESS * w.amp * w.nx * c;
    dz += STEEPNESS * w.amp * w.nz * c;
    h += w.amp * Math.sin(phase);
  }
  out.x = x + dx;
  out.y = SEA_LEVEL + h;
  out.z = z + dz;
  return out;
}

/** @param {{x:number,y:number,z:number}} out — the normal, normalised, in the same convention as gerstnerNormal */
export function gerstnerNormalInto(out, x, z, time) {
  let nx = 0;
  let nz = 0;
  let ny = 1;
  for (let i = 0; i < _WAVES_D.length; i++) {
    const w = _WAVES_D[i];
    const phase = w.k * (w.nx * x + w.nz * z) + time * w.spd * w.k;
    nx -= w.nx * w.wa * Math.cos(phase);
    nz -= w.nz * w.wa * Math.cos(phase);
    ny -= STEEPNESS * w.wa * Math.sin(phase);
  }
  const len = Math.hypot(nx, ny, nz) || 1;
  out.x = nx / len;
  out.y = ny / len;
  out.z = nz / len;
  return out;
}
