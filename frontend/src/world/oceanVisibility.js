// oceanVisibility.js — B8 (18-domain review): should the stylized ocean plane render this frame?
//
// render/Ocean.jsx pins a 220m water plane at SEA_LEVEL, re-centres it under the camera every frame, and
// CPU-recomputes ~9.4k Gerstner vertices (height + normal + foam) each frame — UNCONDITIONALLY. So ~1.1km
// inland the plane is buried under the terrain (invisible) yet still burns ~14% of the frame budget, and
// inside an inland cave it renders THROUGH the cave walls. The plane only COVERS ~PLANE/2 (~110m) around the
// camera, so it can only be visible where some column within that radius sits at/below SEA_LEVEL (actual
// water/coast). Everywhere else it is entirely below the terrain surface — invisible — so skipping both its
// render and its wave recompute is a visual no-op that reclaims the frame budget.
//
// Pure: the caller injects the surface-height sampler (world/climate.surfaceBlockAt), so this is
// node-testable and cannot drift from the terrain formula.
import { SEA_LEVEL } from './oceanProfile.js';

// Samples sit inside the plane's coverage (~110m radius); 90m keeps a margin from the plane edge so a
// coast at the horizon of the plane still counts.
export const OCEAN_SAMPLE_RADIUS = 90;

// centre + an 8-point ring (unit offsets, scaled by the radius).
const RING = [
  [0, 0],
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7],
];

/**
 * True if the ocean surface can be visible near the camera — i.e. any sampled column within `radius` of
 * (camX, camZ) has its surface at/below sea level (water/coast the plane covers). False when every sample
 * is dry land above sea level (deep inland OR inside an inland cave), where the plane is fully buried.
 * @param {number} camX
 * @param {number} camZ
 * @param {(x:number,z:number)=>number} sampleSurfaceY  surface world-Y at a column (e.g. climate.surfaceBlockAt().surfaceY)
 * @param {number} [radius]
 * @param {number} [seaLevel]
 * @returns {boolean}
 */
export function oceanVisibleNear(camX, camZ, sampleSurfaceY, radius = OCEAN_SAMPLE_RADIUS, seaLevel = SEA_LEVEL) {
  for (const [dx, dz] of RING) {
    if (sampleSurfaceY(camX + dx * radius, camZ + dz * radius) <= seaLevel) return true;
  }
  return false;
}
