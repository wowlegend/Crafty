// mesher.js — the greedy voxel mesher, extracted VERBATIM from terrain.worker.js (2026-08-05).
//
// WHY IT MOVED. The worker has zero exports and assigns `self.onmessage` at module scope
// (`terrain.worker.js:38`), so under vitest's `environment: 'node'` importing it throws before any test
// can run — `self` is undefined. The mesher was therefore UNREACHABLE from a test, and every claim about
// its geometry (quad counts, winding, UV mapping, AO) rested on reading it. Four queued items depend on
// measuring exactly those things.
//
// This is a PURE MOVE. `generateMesh` was verified to touch nothing in the worker's module scope except
// the reusable `mask` buffer (moved with it) and the imported `cornerAO` — no noise fields, no biome
// table, no height function, no `self`, no postMessage. The worker now imports it and calls it at the
// same two sites.
//
// The mesher merges coplanar faces on a KEY that carries everything a face's appearance depends on —
// `blockType | dir << 8 | cornerAO << 10 | biome << 18` (built inline in the mask pass) — and emits 4
// unindexed verts + 2 tris per merged quad, returning transferable typed arrays. Winding is
// CCW-from-outside on all six faces because `Terrain.jsx` renders `FrontSide` — a CW face is invisible,
// which is how the terrain once went see-through (see .claude/rules/voxel-mesher.md).
import { cornerAO } from './vertexAO.js';

// 32-bit: the key needs 26 bits (8 type + 2 dir + 8 AO + 8 biome). It was 16-bit while the key was only
// type + dir, which is exactly why AO and biome could not be in it.
const mask = new Uint32Array(4096);

// A 1x1 face cell's four corners in (u, v) order (lo,lo) (hi,lo) (hi,hi) (lo,hi), as outward steps.
const CORNER_SU = [-1, 1, 1, -1];
const CORNER_SV = [-1, -1, 1, 1];

export function generateMesh(cx, cz, blocks, biomeIds) {
  const positions = [];
  const normals = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const ao = []; // S1 vertex AO: per-corner 0..3 occlusion baked here, read as the `aAO` attribute in Terrain.jsx
  let indexOffset = 0;

  // Helper to read blocks safely with boundary culling
  function getBlock(bx, by, bz) {
    if (bx < 0 || bx >= 16 || by < 0 || by >= 256 || bz < 0 || bz >= 16) return 0;
    return blocks[bx + bz * 16 + by * 256];
  }

  // Is the voxel at in-plane (uc, vc) of the AIR layer `ad` on sweep axis `d` an AO occluder (opaque,
  // non-water)? The ONE implementation both the merge key and the emitted corners read, so the key can
  // never disagree with what is drawn.
  function occluderAt(d, ad, uc, vc) {
    let b;
    if (d === 0) b = getBlock(ad, uc, vc);
    else if (d === 1) b = getBlock(vc, ad, uc);
    else b = getBlock(uc, vc, ad);
    return b > 0 && b !== 9 ? 1 : 0;
  }

  // The greedy-merge KEY of one 1x1 face cell: `face` (blockType | dir << 8) plus the four corner AO
  // levels and the biome of the face's OWN column. Everything that changes how a face looks has to be in
  // the key, or the merge smears it:
  //  - AO: with only type+dir in the key, a floor strip merged 16 cells deep beside a wall got one wall-side
  //    and one open-side AO value, interpolated across all 16 — a crease became a 16-block gradient.
  //    Merging only cells with IDENTICAL corner AO is exact, not an approximation: two neighbouring cells
  //    share a vertex, and a vertex has one AO value, so identical cells force the merged edges uniform.
  //  - biome: one merged quad spanning a biome border took ONE tint, so borders snapped to quad rectangles
  //    and disagreed with the per-column grass blades on top (QUEUE R1.1). The old read took the column off
  //    corner c0, which for four of six directions lies OUTSIDE the quad.
  // The face's column is the SOLID block's, which is inside the chunk by construction (getBlock returns 0
  // outside it, and a face needs a solid side).
  function faceKey(d, q, cu, cv, face) {
    const dirFlag = face >> 8;
    const ad = dirFlag === 1 ? q + 1 : q;
    let aoKey = 0;
    for (let k = 0; k < 4; k++) {
      const su = CORNER_SU[k], sv = CORNER_SV[k];
      aoKey |= cornerAO(occluderAt(d, ad, cu + su, cv), occluderAt(d, ad, cu, cv + sv), occluderAt(d, ad, cu + su, cv + sv)) << (k * 2);
    }
    let bx, bz;
    if (d === 1) { bx = cv; bz = cu; }
    else if (d === 0) { bx = dirFlag === 1 ? q : q + 1; bz = cv; }
    else { bx = cu; bz = dirFlag === 1 ? q : q + 1; }
    const biome = biomeIds ? (biomeIds[bz * 16 + bx] & 0xFF) : 0;
    return face | (aoKey << 10) | (biome << 18);
  }

  // Sweep along the 3 primary axes: d = 0 (X), 1 (Y), 2 (Z)
  for (let d = 0; d < 3; d++) {
    // Perpendicular plane axes cyclic permutation: u = (d+1)%3, v = (d+2)%3
    const u = (d + 1) % 3;
    const v = (d + 2) % 3;

    const sizeD = d === 1 ? 256 : 16;
    const sizeU = u === 1 ? 256 : 16;
    const sizeV = v === 1 ? 256 : 16;

    // Slice boundary q between voxel coordinate q and q+1 along axis d
    for (let q = -1; q < sizeD; q++) {
      // 1. Reset our reusable mask — only the part this axis actually uses.
      // The buffer is sized for the worst axis (4096 = 256*16) but every access is
      // mask[cu + cv*sizeU] with cu < sizeU and cv < sizeV, so the live region is exactly
      // sizeU*sizeV. On the Y sweep that is 16*16 = 256 of 4096, repeated over 257 slices:
      // clearing the whole buffer there costs ~987k redundant writes per chunk, per mesh.
      // X and Z already use the full 4096, where this is a no-op.
      mask.fill(0, 0, sizeU * sizeV);

      // Populate mask for this slice boundary
      for (let cv = 0; cv < sizeV; cv++) {
        for (let cu = 0; cu < sizeU; cu++) {
          // Resolve A (voxels at q) and B (voxels at q+1) along direction d
          let blockA = 0;
          let blockB = 0;

          if (d === 0) {
            // d = X, u = Y, v = Z
            blockA = getBlock(q, cu, cv);
            blockB = getBlock(q + 1, cu, cv);
          } else if (d === 1) {
            // d = Y, u = Z, v = X
            blockA = getBlock(cv, q, cu);
            blockB = getBlock(cv, q + 1, cu);
          } else {
            // d = Z, u = X, v = Y
            blockA = getBlock(cu, cv, q);
            blockB = getBlock(cu, cv, q + 1);
          }

          // Evaluate face culling rules
          const aIsSolid = blockA > 0 && blockA !== 9;
          const aIsWater = blockA === 9;
          const bIsSolid = blockB > 0 && blockB !== 9;
          const bIsWater = blockB === 9;

          let face = 0;
          if (blockA > 0 && blockA !== 9 && blockB === 0) {
            // Positive face of SOLID block A (facing +d) against air
            face = blockA | (1 << 8);
          } else if (blockA === 0 && blockB > 0 && blockB !== 9) {
            // Negative face of SOLID block B (facing -d) against air
            face = blockB | (2 << 8);
          } else if (aIsSolid && bIsWater) {
            // Solid block next to water -> still draw the solid face (the seabed/shore wall)
            face = blockA | (1 << 8);
          } else if (bIsSolid && aIsWater) {
            face = blockB | (2 << 8);
          }
          if (face !== 0) mask[cu + cv * sizeU] = faceKey(d, q, cu, cv, face);
          // Water emits NO faces (Ocean.jsx owns the water surface): water-vs-air top/bottom,
          // water-vs-water, and water-vs-solid (the solid side is drawn above) are all skipped.
        }
      }

      // 2. Greedy search inside the populated mask to combine adjacent matching faces
      for (let cv = 0; cv < sizeV; cv++) {
        for (let cu = 0; cu < sizeU; cu++) {
          const val = mask[cu + cv * sizeU];
          if (val === 0) continue;

          const blockType = val & 0xFF;
          const dirFlag = (val >> 8) & 3;
          const biomeId = (val >> 18) & 0xFF;

          // Find maximum horizontal width w along axis u
          let w = 1;
          while (cu + w < sizeU && mask[(cu + w) + cv * sizeU] === val) {
            w++;
          }

          // Find maximum vertical height h along axis v
          let h = 1;
          let hPossible = true;
          while (cv + h < sizeV) {
            for (let k = 0; k < w; k++) {
              if (mask[(cu + k) + (cv + h) * sizeU] !== val) {
                hPossible = false;
                break;
              }
            }
            if (!hPossible) break;
            h++;
          }

          // Clear masked cells covered by the greedy quad
          for (let dy = 0; dy < h; dy++) {
            for (let dx = 0; dx < w; dx++) {
              mask[(cu + dx) + (cv + dy) * sizeU] = 0;
            }
          }

          // Map quad coordinates, normals and CCW winding indices based on axis
          let c0, c1, c2, c3;
          let normalVector;

          if (d === 0) {
            // Axis X: width is along Y (u), height is along Z (v)
            const y = cu;
            const z = cv;
            normalVector = dirFlag === 1 ? [1, 0, 0] : [-1, 0, 0];

            if (dirFlag === 1) {
              // Right (+X)
              const x = q;
              c0 = [x + 1, y, z];
              c1 = [x + 1, y + w, z];
              c2 = [x + 1, y + w, z + h];
              c3 = [x + 1, y, z + h];
            } else {
              // Left (-X)
              const x = q + 1;
              c0 = [x, y, z + h];
              c1 = [x, y + w, z + h];
              c2 = [x, y + w, z];
              c3 = [x, y, z];
            }
          } else if (d === 1) {
            // Axis Y: width is along Z (u), height is along X (v)
            const x = cv;
            const z = cu;
            normalVector = dirFlag === 1 ? [0, 1, 0] : [0, -1, 0];

            if (dirFlag === 1) {
              // Top (+Y)
              const y = q;
              c0 = [x, y + 1, z + w];
              c1 = [x + h, y + 1, z + w];
              c2 = [x + h, y + 1, z];
              c3 = [x, y + 1, z];
            } else {
              // Bottom (-Y)
              const y = q + 1;
              c0 = [x, y, z + w];
              c1 = [x, y, z];
              c2 = [x + h, y, z];
              c3 = [x + h, y, z + w];
            }
          } else {
            // Axis Z: width is along X (u), height is along Y (v)
            const x = cu;
            const y = cv;
            normalVector = dirFlag === 1 ? [0, 0, 1] : [0, 0, -1];

            if (dirFlag === 1) {
              // Front (+Z)
              const z = q;
              c0 = [x, y, z + 1];
              c1 = [x + w, y, z + 1];
              c2 = [x + w, y + h, z + 1];
              c3 = [x, y + h, z + 1];
            } else {
              // Back (-Z)
              const z = q + 1;
              c0 = [x + w, y, z];
              c1 = [x, y, z];
              c2 = [x, y + h, z];
              c3 = [x + w, y + h, z];
            }
          }

          // S1 vertex AO (0fps per-corner, baked at mesh time): for each emitted corner sample the 3
          // outward-side occluders (2 edge-adjacent + the diagonal) in the AIR layer (d = aoAd) and bake
          // an AO level 0..3 into the `aAO` attribute (read in Terrain.jsx). Water faces carry AO 3 (no
          // occlusion). Generic across all 6 face dirs: each corner's (u,v) comes from its world coords
          // (u=(d+1)%3, v=(d+2)%3) so no per-winding special-casing. Capture-deterministic (static voxels).
          const aoAd = dirFlag === 1 ? q + 1 : q; // the air-side d-layer in front of the face
          const aoSolid = (uc, vc) => occluderAt(d, aoAd, uc, vc);
          // The `if (blockType === 9) { ao.push(3); continue; }` that used to open this loop was dead.
          // Every branch writing to `mask` above guards on `!== 9` (a solid's blockA/blockB), and
          // `blockType` is decoded straight out of `mask`, so 9 cannot reach here — W2 moved the water
          // surface to Ocean.jsx's Gerstner plane and the mesher stopped emitting water faces entirely.
          // The invariant is asserted in mesher.test.js rather than left to be re-derived from the mask
          // branches, because that is what makes deleting the downstream shader guards safe.
          for (const C of [c0, c1, c2, c3]) {
            const gu = C[u], gv = C[v];
            const su = gu === cu ? -1 : 1, nu = gu === cu ? cu : cu + w - 1;
            const sv = gv === cv ? -1 : 1, nv = gv === cv ? cv : cv + h - 1;
            ao.push(cornerAO(aoSolid(nu + su, nv), aoSolid(nu, nv + sv), aoSolid(nu + su, nv + sv)));
          }
          const aoBase = ao.length - 4;
          // 0fps anisotropy fix: split the quad along the diagonal whose endpoints are BRIGHTER in sum. The
          // default split c0-c2 drags a single dark corner along the diagonal into a band across half the
          // face; splitting c1-c3 instead keeps the darkening in the corner's own triangle.
          const flipDiagonal = ao[aoBase] + ao[aoBase + 2] < ao[aoBase + 1] + ao[aoBase + 3];

          positions.push(...c0, ...c1, ...c2, ...c3);
          normals.push(...normalVector, ...normalVector, ...normalVector, ...normalVector);

          // color.r = blockType (vertexColor read by the terrain shader).
          // color.g = BIOME ID (Q14) — the channel this comment used to call "now unused". The attribute
          //   was already 3-wide with two channels free, so per-vertex biome costs ZERO extra bytes and
          //   no second attribute. `biomeIds` is per COLUMN, hence indexed by x/z only. Absent (an older
          //   caller, or a chunk meshed before the ids existed) -> 0, which the tint table maps to a real
          //   biome rather than to garbage.
          // color.b = still unused, still 3-wide for the same reason as before.
          // The biome comes out of the merge KEY (`faceKey`), so every cell this quad covers has it — the
          // quad cannot straddle a border. It used to be read off corner c0, which for four of six face
          // directions is a column OUTSIDE the quad (QUEUE R1.1).
          colors.push(
            blockType, biomeId, 0,
            blockType, biomeId, 0,
            blockType, biomeId, 0,
            blockType, biomeId, 0
          );

          // Tiled UVs. The rect must match the quad's WORLD edges in the SAME orientation or the texture
          // stretches by w/h across every merged face.
          //
          // Only +Y builds its corners so that c0->c1 spans `h` (it walks x by h); the other FIVE
          // directions walk their first edge by `w`. A single shared rect therefore fed `u` the h-edge and
          // `v` the w-edge on five of six faces — invisible whenever a merge is square, and stretching up
          // to 30:1 on the 16x1 strips that side faces actually merge into.
          if (d === 1 && dirFlag === 1) {
            uvs.push(0, 0, 0, h, w, h, w, 0); // +Y: c0->c1 spans h, c0->c3 spans w
          } else {
            uvs.push(0, 0, w, 0, w, h, 0, h); // the rest: c0->c1 spans w, c0->c3 spans h
          }

          // Both splits keep the corners' cyclic order, so both stay CCW-from-outside.
          if (flipDiagonal) {
            indices.push(
              indexOffset, indexOffset + 1, indexOffset + 3,
              indexOffset + 1, indexOffset + 2, indexOffset + 3
            );
          } else {
            indices.push(
              indexOffset, indexOffset + 1, indexOffset + 2,
              indexOffset, indexOffset + 2, indexOffset + 3
            );
          }
          indexOffset += 4;
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices),
    ao: new Float32Array(ao)
  };
}

