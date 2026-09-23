// farField.js — THE FAR HORIZON: a sunk, flat-shaded heightfield ring beyond the loaded chunks.
// Spec: docs/superpowers/specs/2026-09-22-crafty-far-horizon-design.md (EXTERNAL-BASELINE runner-up #1).
//
// Past the loaded square (72 m at high) the world used to end in fog over sky colour, while the camera sees
// 500 m. This builds land and sea out to FAR_OUTER from the SAME column sampler the game already uses
// (climate.surfaceBlockAt -> heightAt.computeHeight), so it is the real world's silhouette, not a painted one.
//
// Pure: the sampler and the tile colours are injected, so a test drives synthetic worlds. The component that
// draws it is world/FarField.jsx.
import * as THREE from 'three';
import { BIOME_TINT, BIOME_ID } from './biomeTable.js';
import { BLOCK_ID } from './blockIds.js';
import { BIOME_TINTED_BLOCKS } from './terrainTint.js';
import { SEA_LEVEL } from './oceanProfile.js';

/** How far below the real surface the ring sits, so a loaded chunk always wins the depth test. */
export const FAR_SINK = 2;
/** Outer radius, metres. The camera sees 500 m; the fog has swallowed most of it by here. */
export const FAR_OUTER = 420;
/** The centre snaps to this grid, so the ring is rebuilt only when the player crosses a cell — never swims. */
export const FAR_RECENTRE = 32;
/** Rings (radial) x sectors (angular) at the shipped density. */
export const FAR_RINGS = 40;
export const FAR_SECTORS = 160;
/** Radial spacing exponent: fine near the loaded edge, coarse toward the horizon. */
const RADIAL_POW = 1.7;

/**
 * How much of each biome's ground reads as tree canopy from a distance (0..1). The near terrain has real
 * trees; at 200 m what survives of them is a darker, higher silhouette. An impostor's approximation, stated
 * as data so it can be tuned in one place.
 */
export const FAR_CANOPY = Object.freeze({
  forest: 0.85, jungle: 0.9, taiga: 0.6, snow: 0.35, swamp: 0.25, plains: 0.15, meadow: 0.1,
  savanna: 0.1, desert: 0, mesa: 0,
});
/** Canopy height at full coverage, metres. */
export const FAR_CANOPY_HEIGHT = 5;
/** The ocean plane's own colour (render/Ocean.jsx), linear — so far sea and near sea agree. */
export const FAR_WATER_LINEAR = Object.freeze(new THREE.Color('#10BCC6').toArray());

const TINTED = new Set(BIOME_TINTED_BLOCKS.map((b) => BLOCK_ID[b]));
// The worker grows trees on grass (the flora branches testing surfaceBlock === 1) and pines on snow
// (surfaceBlock === 5); the desert's cacti are too sparse to read at distance. Stone cliffs and beaches in a
// forest stay bare.
const CANOPY_SURFACES = new Set([BLOCK_ID.grass, BLOCK_ID.snow]);

const CHUNK = 16;

/**
 * The two radii that keep the ring honest, measured from the ring's (snapped) centre.
 *
 * The loaded square is `renderDistance` chunks each way around the player's CHUNK, so it always covers the
 * disk of radius renderDistance*16 around the player and never reaches past (renderDistance+1)*16*sqrt2.
 * The ring centre sits up to `slack` = (step/2)*sqrt2 from the player (snapCentre picks the cell centre).
 *  - inner: the hole the ring leaves must lie INSIDE the always-loaded disk, or there is a gap of nothing
 *    between the real terrain and the far field. inner = renderDistance*16 - slack.
 *  - canopyFrom: the canopy lifts the ring above the real ground, so it may only start where no chunk can
 *    be loaded. canopyFrom = (renderDistance+1)*16*sqrt2 + slack.
 * Everywhere between, the ring lies FAR_SINK under the real surface, hidden by any chunk that is there.
 */
export function farRadii(renderDistance, step = FAR_RECENTRE) {
  const slack = (step / 2) * Math.SQRT2;
  return {
    inner: Math.max(0, renderDistance * CHUNK - slack),
    canopyFrom: (renderDistance + 1) * CHUNK * Math.SQRT2 + slack,
  };
}

/** The ring centre for a player position: the CENTRE of its FAR_RECENTRE grid cell. */
export function snapCentre(x, z, step = FAR_RECENTRE) {
  return { x: Math.floor(x / step) * step + step / 2, z: Math.floor(z / step) * step + step / 2 };
}

/**
 * Per-layer mean colour of the voxel texture array, LINEAR: each texel decoded with pow 2.2 exactly as the
 * terrain shader decodes it, then averaged — the colour a tile converges to at distance.
 */
export function layerMeanLinear(texture) {
  const { width, height, depth, data } = texture.image;
  const n = width * height, per = n * 4, out = [];
  for (let l = 0; l < depth; l++) {
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < n; i++) {
      const o = l * per + i * 4;
      r += Math.pow(data[o] / 255, 2.2); g += Math.pow(data[o + 1] / 255, 2.2); b += Math.pow(data[o + 2] / 255, 2.2);
    }
    out.push([r / n, g / n, b / n]);
  }
  return out;
}

/**
 * One column of the far field: its (sunk) height and linear colour. `s` is a surfaceBlockAt result.
 * `canopy` scales the tree lift (0 where real terrain may be loaded — see farFieldGeometry).
 */
export function farColumn(s, means, canopy = 1) {
  if (s.isWater) {
    return { y: SEA_LEVEL - FAR_SINK, r: FAR_WATER_LINEAR[0], g: FAR_WATER_LINEAR[1], b: FAR_WATER_LINEAR[2] };
  }
  const bi = BIOME_ID[s.biome] ?? 0;
  const tint = [BIOME_TINT[bi * 3], BIOME_TINT[bi * 3 + 1], BIOME_TINT[bi * 3 + 2]];
  const ground = means[s.surfaceBlock] || means[BLOCK_ID.stone];
  const gt = TINTED.has(s.surfaceBlock) ? tint : [1, 1, 1];
  const leaves = means[BLOCK_ID.leaves];
  const cov = CANOPY_SURFACES.has(s.surfaceBlock) ? (FAR_CANOPY[s.biome] || 0) : 0;
  const c = [0, 1, 2].map((k) => ground[k] * gt[k] * (1 - cov) + leaves[k] * tint[k] * cov);
  return { y: s.surfaceY + 1 - FAR_SINK + cov * FAR_CANOPY_HEIGHT * canopy, r: c[0], g: c[1], b: c[2] };
}

/**
 * The ring's geometry around (cx, cz): `rings` radii from r0 to r1 (geometric spacing) x `sectors` angles,
 * stitched into one indexed triangle list. The canopy lift ramps in only beyond `canopyFrom` (farRadii) —
 * past anywhere a real chunk can be loaded — so wherever real terrain can exist the ring stays below it.
 */
export function farFieldGeometry({ cx, cz, r0, r1, canopyFrom, rings = FAR_RINGS, sectors = FAR_SECTORS, sample, means }) {
  const positions = new Float32Array(rings * sectors * 3);
  const colors = new Float32Array(rings * sectors * 3);
  let v = 0;
  for (let i = 0; i < rings; i++) {
    const r = r0 + (r1 - r0) * Math.pow(i / (rings - 1), RADIAL_POW);
    const canopy = THREE.MathUtils.clamp((r - canopyFrom) / 24, 0, 1);
    for (let j = 0; j < sectors; j++) {
      const a = (j / sectors) * Math.PI * 2;
      const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const col = farColumn(sample(x, z), means, canopy);
      positions[v] = x; positions[v + 1] = col.y; positions[v + 2] = z;
      colors[v] = col.r; colors[v + 1] = col.g; colors[v + 2] = col.b;
      v += 3;
    }
  }
  const index = new Uint32Array((rings - 1) * sectors * 6);
  let k = 0;
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < sectors; j++) {
      const a = i * sectors + j, b = i * sectors + ((j + 1) % sectors);
      const c = a + sectors, d = b + sectors;
      index[k++] = a; index[k++] = c; index[k++] = b; // CCW seen from above (+y)
      index[k++] = b; index[k++] = c; index[k++] = d;
    }
  }
  return { positions, colors, index };
}
