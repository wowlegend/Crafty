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
// The mesher merges coplanar faces on `blockType | (dirFlag << 8)` and emits 4 unindexed verts + 2 tris
// per merged quad, returning transferable typed arrays. Winding is CCW-from-outside on all six faces
// because `Terrain.jsx` renders `FrontSide` — a CW face is invisible, which is how the terrain once went
// see-through (see .claude/rules/r3f-pointer-lock-voxel-meshing.md).
import { cornerAO } from './vertexAO.js';

const mask = new Uint16Array(4096);

export function generateMesh(cx, cz, blocks) {
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

          if (blockA > 0 && blockA !== 9 && blockB === 0) {
            // Positive face of SOLID block A (facing +d) against air
            mask[cu + cv * sizeU] = blockA | (1 << 8);
          } else if (blockA === 0 && blockB > 0 && blockB !== 9) {
            // Negative face of SOLID block B (facing -d) against air
            mask[cu + cv * sizeU] = blockB | (2 << 8);
          } else if (aIsSolid && bIsWater) {
            // Solid block next to water -> still draw the solid face (the seabed/shore wall)
            mask[cu + cv * sizeU] = blockA | (1 << 8);
          } else if (bIsSolid && aIsWater) {
            mask[cu + cv * sizeU] = blockB | (2 << 8);
          }
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
          const dirFlag = val >> 8;

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
          const aoSolid = (uc, vc) => {
            let b;
            if (d === 0) b = getBlock(aoAd, uc, vc);
            else if (d === 1) b = getBlock(vc, aoAd, uc);
            else b = getBlock(uc, vc, aoAd);
            return b > 0 && b !== 9 ? 1 : 0;
          };
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

          positions.push(...c0, ...c1, ...c2, ...c3);
          normals.push(...normalVector, ...normalVector, ...normalVector, ...normalVector);

          // color.r = blockType (vertexColor read by the terrain shader); color.g/color.b are now unused
          // (the old shore-foam/seabed-depth bake moved to the Ocean.jsx plane) but the attribute stays
          // 3-wide so the shader's `attribute vec3 color` read is unchanged.
          colors.push(
            blockType, 0, 0,
            blockType, 0, 0,
            blockType, 0, 0,
            blockType, 0, 0
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

          indices.push(
            indexOffset, indexOffset + 1, indexOffset + 2,
            indexOffset, indexOffset + 2, indexOffset + 3
          );
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

