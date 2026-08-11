import { createNoise3D, createNoise2D } from 'simplex-noise';
import { stampHomeAnchor, stampHub } from './homeAnchor.js';
import { SEA_LEVEL, BEACH_BAND_TOP, OCEAN_CONTINENT_THRESHOLD, oceanSurfaceY } from './oceanProfile.js';
import { pickBiome } from './biomeTable.js';
import { applyCaveCA } from './caveCA.js';
// How many y layers the cave CA covers. Caves are a below-y20 feature; smoothing above that would chew
// at the surface silhouette.
const CAVE_CA_RANGE_HEIGHT = 20;
import { pineShape, acaciaShape, swampShape, jungleShape } from './foliage.js';
import { computeHeight } from './heightAt.js';
import { oreCodeFor } from './oreGen.js';
import { linearRgbToHex } from '../game/colorHex.js';
import { grassTops } from './grassField.js';
import { generateMesh } from './mesher.js';

// Constants
const CHUNK_SIZE = 16;
const CHUNK_HEIGHT = 256;
const VOLUME = CHUNK_SIZE * CHUNK_SIZE * CHUNK_HEIGHT;

let noise2D;
let noise3D;

// In-memory chunk storage (so we can re-mesh on block updates)
// Map of chunkKey ("cx_cz") to Uint8Array
const chunks = new Map();
const chunkModifications = new Map();

// Deterministic per-coordinate PRNG for vegetation placement. Trees/cacti previously used
// raw Math.random(), which made the world layout DIFFERENT on every load (non-deterministic
// silhouette) — that broke visual-regression baselines and meant a given seed never produced
// the same world twice. Hashing the world coordinates yields a stable [0,1) value per column,
// independent of chunk-generation order, so the same seed regenerates the identical world.
const WORLD_SEED = 12345;
function vegRandom(worldX, worldZ, salt) {
  let h = (WORLD_SEED ^ Math.imul(worldX | 0, 0x27d4eb2d) ^ Math.imul(worldZ | 0, 0x165667b1) ^ Math.imul(salt | 0, 0x9e3779b9)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

self.onmessage = function(e) {
  const { type, payload } = e.data;

  if (type === 'init') {
    // Simple PRNG for seeding
    const lcg = (seed) => () => (seed = Math.imul(1664525, seed) + 1013904223 | 0) / 4294967296 + 0.5;
    const rng = lcg(payload.seed || 12345);
    noise2D = createNoise2D(rng);
    noise3D = createNoise3D(rng);
    self.postMessage({ type: 'init_done' });
  } 
  else if (type === 'generate') {
    const { cx, cz } = payload;
    const key = `${cx}_${cz}`;
    
    let blocks;
    if (chunks.has(key)) {
      blocks = chunks.get(key);
    } else {
      blocks = generateChunkData(cx, cz);
      chunks.set(key, blocks);
    }
    
    // Generate mesh from blocks
    const meshData = generateMesh(cx, cz, blocks);

    // M4 #5: scan each column's TOP block (highest non-air) -> a sparse list of grass-top world
    // positions for the wind-grass overlay (OptimizedGrassSystem). Gen-time read of `blocks` only --
    // NO extra mesh work, NO re-mesh. The plain array is structured-cloned (not transferred).
    const topCodes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
    const topYs = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
          const b = blocks[getIndex(x, y, z)];
          if (b !== 0) { topCodes[x + z * CHUNK_SIZE] = b; topYs[x + z * CHUNK_SIZE] = y; break; }
        }
      }
    }
    const gTops = grassTops(topCodes, topYs, CHUNK_SIZE, cx * CHUNK_SIZE, cz * CHUNK_SIZE, { stride: 2, cap: 50 });

    // Transfer buffers back to main thread
    self.postMessage({
      type: 'chunk_mesh',
      payload: {
        cx, cz,
        positions: meshData.positions,
        normals: meshData.normals,
        colors: meshData.colors,
        uvs: meshData.uvs,
        indices: meshData.indices,
        ao: meshData.ao,
        grassTops: gTops
      }
    }, [
      meshData.positions.buffer,
      meshData.normals.buffer,
      meshData.colors.buffer,
      meshData.uvs.buffer,
      meshData.indices.buffer,
      meshData.ao.buffer
    ]);
  }
  else if (type === 'update_block') {
    const { cx, cz, x, y, z, blockType } = payload;
    const key = `${cx}_${cz}`;
    let blocks = chunks.get(key);
    if (!blocks) {
      blocks = generateChunkData(cx, cz);
      chunks.set(key, blocks);
    }
    
    const index = getIndex(x, y, z);
    if (index >= 0 && index < VOLUME) {
      const prevBlock = blocks[index];
      blocks[index] = blockType;
      
      const modKey = `${cx}_${cz}`;
      if (!chunkModifications.has(modKey)) {
        chunkModifications.set(modKey, new Map());
      }
      chunkModifications.get(modKey).set(index, blockType);

      if (blockType === 0 && prevBlock !== 0) {
        const colorArray = BLOCK_COLORS[prevBlock] || [1, 1, 1];
        self.postMessage({
          type: 'block_broken',
          payload: {
            x: cx * CHUNK_SIZE + x,
            y,
            z: cz * CHUNK_SIZE + z,
            color: linearRgbToHex(colorArray), // BLOCK_COLORS are LINEAR; encode to sRGB so debris isn't double-darkened

            blockType: prevBlock
          }
        });
      }
      
      // Re-mesh
      const meshData = generateMesh(cx, cz, blocks);
      // M4 #5 parity (review HIGH): refresh the wind-grass overlay on edit too — the generate path emits
      // grassTops but update_block dropped it, so editing ANY block killed the chunk's wind-grass until
      // reload. shortcut: inlined to mirror the generate-path scan (the grass-revival gate locks those
      // literal tokens); a shared computeGrassTops helper is the upgrade path.
      const topCodes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
      const topYs = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
            const b = blocks[getIndex(x, y, z)];
            if (b !== 0) { topCodes[x + z * CHUNK_SIZE] = b; topYs[x + z * CHUNK_SIZE] = y; break; }
          }
        }
      }
      const gTops = grassTops(topCodes, topYs, CHUNK_SIZE, cx * CHUNK_SIZE, cz * CHUNK_SIZE, { stride: 2, cap: 50 });
      self.postMessage({
        type: 'chunk_mesh',
        payload: {
          cx, cz,
          positions: meshData.positions,
          normals: meshData.normals,
          colors: meshData.colors,
          uvs: meshData.uvs,
          indices: meshData.indices,
          ao: meshData.ao,
          grassTops: gTops
        }
      }, [
        meshData.positions.buffer,
        meshData.normals.buffer,
        meshData.colors.buffer,
        meshData.uvs.buffer,
        meshData.indices.buffer,
        meshData.ao.buffer
      ]);
    }
  }
  else if (type === 'unload') {
    const { cx, cz } = payload;
    chunks.delete(`${cx}_${cz}`);
  }
  else if (type === 'load_modifications') {
    const { modifications } = payload;
    chunkModifications.clear();
    chunks.clear();
    
    if (Array.isArray(modifications)) {
      for (const [cx, cz, index, blockType] of modifications) {
        const modKey = `${cx}_${cz}`;
        if (!chunkModifications.has(modKey)) {
          chunkModifications.set(modKey, new Map());
        }
        chunkModifications.get(modKey).set(index, blockType);
      }
    }
    self.postMessage({ type: 'load_modifications_done' });
  }
};

function getIndex(x, y, z) {
  return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
}

const DUNGEON_BLUEPRINT = [];

function initDungeonBlueprint() {
  const h = 6;
  const halfW = 6;
  const halfD = 6;

  for (let dy = 0; dy < h; dy++) {
    for (let dz = -halfD; dz <= halfD; dz++) {
      for (let dx = -halfW; dx <= halfW; dx++) {
        let blockType = 0; // Air to carve out center

        const isWall = dx === -halfW || dx === halfW || dz === -halfD || dz === halfD;
        const isFloor = dy === 0;
        const isCeiling = dy === h - 1;

        if (isFloor || isCeiling) {
          blockType = 3; // Stone floor/ceiling
        } else if (isWall) {
          blockType = 3; // Stone walls
        }

        // Corner Pillars inside the room
        const isCorner = (Math.abs(dx) === halfW - 1) && (Math.abs(dz) === halfD - 1);
        if (isCorner && !isFloor && !isCeiling) {
          blockType = 6; // Wood pillars
        }

        // Central Altar Pedestal (dy = 1)
        if (dy === 1 && Math.abs(dx) <= 1 && Math.abs(dz) <= 1) {
          if (dx === 0 && dz === 0) {
            blockType = 4; // Treasure block (Sand)
          } else {
            blockType = 5; // Marble border (Snow)
          }
        }

        // Entries
        const isDoorway = (dz === -halfD || dz === halfD) && Math.abs(dx) <= 1 && dy >= 1 && dy <= 3;
        if (isDoorway) {
          blockType = 0;
        }

        DUNGEON_BLUEPRINT.push([dx, dy, dz, blockType]);
      }
    }
  }
}

function isDungeonChunk(dcx, dcz) {
  const hash = Math.sin(dcx * 12.9898 + dcz * 78.233) * 43758.5453;
  return (hash - Math.floor(hash)) < 0.025; // 2.5% chance per chunk
}

function stampStructures(blocks, cx, cz) {
  if (DUNGEON_BLUEPRINT.length === 0) {
    initDungeonBlueprint();
  }

  for (let dcx = cx - 1; dcx <= cx + 1; dcx++) {
    for (let dcz = cz - 1; dcz <= cz + 1; dcz++) {
      if (isDungeonChunk(dcx, dcz)) {
        const dCenterX = dcx * CHUNK_SIZE + 8;
        const dCenterY = 12; // deep level Y = 12
        const dCenterZ = dcz * CHUNK_SIZE + 8;

        for (const [dx, dy, dz, blockType] of DUNGEON_BLUEPRINT) {
          const ax = dCenterX + dx;
          const ay = dCenterY + dy;
          const az = dCenterZ + dz;

          const lx = ax - cx * CHUNK_SIZE;
          const lz = az - cz * CHUNK_SIZE;

          if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE && ay >= 0 && ay < CHUNK_HEIGHT) {
            blocks[getIndex(lx, ay, lz)] = blockType;
          }
        }
      }
    }
  }
}

function applyCellularAutomata(blocks) {
  // The CA itself lives in world/caveCA.js. It used to be inline here, and this file assigns
  // self.onmessage at module scope so it cannot be imported under vitest -- which is why nobody had ever
  // run it: its neighbour lookup answered SOLID for everything outside the chunk, giving every border
  // column nine phantom solid neighbours and walling caves off at every 16-block seam below y=20.
  applyCaveCA(blocks, CHUNK_SIZE, CAVE_CA_RANGE_HEIGHT);
}

function spawnSupportBeams(blocks, cx, cz) {
  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;

  for (let z = 0; z < CHUNK_SIZE; z++) {
    const worldZ = startZ + z;
    if (worldZ % 10 !== 0) continue;

    for (let x = 0; x < CHUNK_SIZE; x++) {
      const worldX = startX + x;
      if (worldX % 10 !== 0) continue;

      for (let y = 1; y < 18; y++) {
        const floorIdx = getIndex(x, y - 1, z);
        const cellIdx = getIndex(x, y, z);
        
        if (blocks[cellIdx] === 0 && blocks[floorIdx] === 3) {
          let ceilingY = -1;
          for (let cy = y + 1; cy < 22; cy++) {
            const ceilingIdx = getIndex(x, cy, z);
            if (blocks[ceilingIdx] === 3) {
              ceilingY = cy;
              break;
            }
            if (blocks[ceilingIdx] !== 0) {
              break;
            }
          }

          if (ceilingY !== -1) {
            const tunnelHeight = ceilingY - y;
            if (tunnelHeight >= 3 && tunnelHeight <= 6) {
              const isAlignX = (worldX % 20 === 0);
              
              const offsetL = isAlignX ? { dx: 0, dz: -1 } : { dx: -1, dz: 0 };
              const offsetR = isAlignX ? { dx: 0, dz: 1 } : { dx: 1, dz: 0 };

              const lxL = x + offsetL.dx;
              const lzL = z + offsetL.dz;
              const lxR = x + offsetR.dx;
              const lzR = z + offsetR.dz;

              // Left Post
              if (lxL >= 0 && lxL < CHUNK_SIZE && lzL >= 0 && lzL < CHUNK_SIZE) {
                for (let py = y; py < ceilingY; py++) {
                  blocks[getIndex(lxL, py, lzL)] = 6;
                }
              }

              // Right Post
              if (lxR >= 0 && lxR < CHUNK_SIZE && lzR >= 0 && lzR < CHUNK_SIZE) {
                for (let py = y; py < ceilingY; py++) {
                  blocks[getIndex(lxR, py, lzR)] = 6;
                }
              }

              // Top horizontal support arch crossbar
              const topY = ceilingY - 1;
              for (let step = -1; step <= 1; step++) {
                const cxVal = x + (isAlignX ? 0 : step);
                const czVal = z + (isAlignX ? step : 0);
                if (cxVal >= 0 && cxVal < CHUNK_SIZE && czVal >= 0 && czVal < CHUNK_SIZE) {
                  blocks[getIndex(cxVal, topY, czVal)] = 6;
                }
              }
              
              y = ceilingY;
            }
          }
        }
      }
    }
  }
}

function generateChunkData(cx, cz) {
  const blocks = new Uint8Array(VOLUME);
  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;

  // 1. Raw Biome & Height Grid Generation
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const worldX = startX + x;
      const worldZ = startZ + z;
      
      // Surface formula lives in the shared world/heightAt.js (single source — see that file +
      // the heightat-single-source gate; climate.js imports the SAME computeHeight so they can't drift).
      const { continent, moisture, temperature, n, baseHeight } = computeHeight(noise2D, worldX, worldZ);
      
      let surfaceY;
      if (continent < OCEAN_CONTINENT_THRESHOLD) {
        surfaceY = oceanSurfaceY(baseHeight, n, continent);
      } else {
        surfaceY = Math.floor(baseHeight);
      }

      // M3: biome selection is data-driven (world/biomeTable.js) — byte-identical to the old
      // inline 3-branch. `let` so the beach override below can still reassign to sand.
      let { surfaceBlock, secondaryBlock } = pickBiome(temperature, moisture, continent);

      if (surfaceY < BEACH_BAND_TOP) {
          surfaceBlock = 4; // Sand beach
          secondaryBlock = 4;
      }

      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        const index = getIndex(x, y, z);
        
        if (y > surfaceY) {
          if (y <= SEA_LEVEL) {
            blocks[index] = 9; // Water
          } else {
            blocks[index] = 0; // Air
          }
        } else {
          // Swiss Cheese 3D Caves Noise carving
          const caveNoise = noise3D(worldX * 0.04, y * 0.08, worldZ * 0.04);
          const caveThreshold = y < 20 ? 0.3 : 0.45;

          if (y < surfaceY - 4 && caveNoise > caveThreshold) {
            blocks[index] = 0; // Cave hollow
          } else {
            if (y === surfaceY) {
              blocks[index] = surfaceBlock;
            } else if (y >= surfaceY - 3) {
              blocks[index] = secondaryBlock;
            } else {
              // S6: deep solid voxels are mostly Stone (3) but deterministically seeded with depth-banded
              // ores (10 coal .. 13 diamond) so mining has a payoff. Capture-safe (deep, position-hashed).
              blocks[index] = oreCodeFor(worldX, y, worldZ, surfaceY);
            }
          }
        }
      }
    }
  }

  // 2. Smooth Deep Caves via 3D Cellular Automata (below Y < 20)
  applyCellularAutomata(blocks);

  // 3. Stamp Asynchronous Blueprint Structures (Cobblestone Dungeon chambers)
  stampStructures(blocks, cx, cz);

  // 4. Spawn Cavern Wooden Support Arch Beams (inside tunnels)
  spawnSupportBeams(blocks, cx, cz);

  // 5. Foliage Decorators Pass (Trees / Cacti, on top surface solid blocks)
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const worldX = startX + x;
      const worldZ = startZ + z;
      
      let surfaceY = -1;
      for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
        const type = blocks[x + z * CHUNK_SIZE + y * 256];
        if (type > 0 && type !== 9) {
          surfaceY = y;
          break;
        }
      }

      if (surfaceY > SEA_LEVEL && vegRandom(worldX, worldZ, 1) < 0.02) {
        const surfaceBlock = blocks[x + z * CHUNK_SIZE + surfaceY * 256];
        // M4b biome-flora wiring: branch foliage on the biome's flora KIND (biomeTable), not just the
        // surface block, so grass biomes diverge (taiga pines vs forest oaks) + mesa stays bare.
        // pickBiome + computeHeight are PURE -> capture-deterministic, gen-time only (NO-RE-MESH).
        const { continent: fCont, moisture: fMoist, temperature: fTemp } = computeHeight(noise2D, worldX, worldZ);
        const flora = pickBiome(fTemp, fMoist, fCont).flora;
        if (surfaceBlock === 1 && flora === 'pine') { // taiga: boreal pines on cool grass (not broadleaf)
          const pineH = 5 + Math.floor(vegRandom(worldX, worldZ, 4) * 4);
          const { trunk, leaves } = pineShape(pineH);
          for (const [, dy] of trunk) {
            const ny = surfaceY + dy;
            if (ny >= CHUNK_HEIGHT) break;
            const idx = getIndex(x, ny, z);
            if (blocks[idx] !== 0) break;
            blocks[idx] = 6;
          }
          for (const [dx, dy, dz] of leaves) {
            const nx = x + dx, nz = z + dz, ny = surfaceY + dy;
            if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny < CHUNK_HEIGHT) {
              const leafIdx = getIndex(nx, ny, nz);
              if (blocks[leafIdx] === 0) blocks[leafIdx] = 7;
            }
          }
        } else if (surfaceBlock === 1 && flora === 'savanna') { // savanna: sparse flat-canopy acacias dotting the veld
          if (vegRandom(worldX, worldZ, 5) < 0.5) {
            const aH = 5 + Math.floor(vegRandom(worldX, worldZ, 2) * 3);
            const { trunk, leaves } = acaciaShape(aH);
            for (const [, dy] of trunk) {
              const ny = surfaceY + dy;
              if (ny >= CHUNK_HEIGHT) break;
              const idx = getIndex(x, ny, z);
              if (blocks[idx] !== 0) break;
              blocks[idx] = 6;
            }
            for (const [dx, dy, dz] of leaves) {
              const nx = x + dx, nz = z + dz, ny = surfaceY + dy;
              if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny < CHUNK_HEIGHT) {
                const leafIdx = getIndex(nx, ny, nz);
                if (blocks[leafIdx] === 0) blocks[leafIdx] = 7;
              }
            }
          }
        } else if (surfaceBlock === 1 && flora === 'jungle') { // jungle: a tall trunk + a BROAD layered VINE-CANOPY (B1 slice 5 — distinct from temperate oak)
          const jH = 8 + Math.floor(vegRandom(worldX, worldZ, 2) * 3); // tall tropical trunk
          const { trunk, leaves } = jungleShape(jH);
          for (const [, dy] of trunk) {
            const ny = surfaceY + dy;
            if (ny >= CHUNK_HEIGHT) break;
            const idx = getIndex(x, ny, z);
            if (blocks[idx] !== 0) break;
            blocks[idx] = 6;
          }
          for (const [dx, dy, dz] of leaves) {
            const nx = x + dx, nz = z + dz, ny = surfaceY + dy;
            if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny >= 0 && ny < CHUNK_HEIGHT) {
              const leafIdx = getIndex(nx, ny, nz);
              if (blocks[leafIdx] === 0) blocks[leafIdx] = 7;
            }
          }
        } else if (surfaceBlock === 1) { // grass broadleaf oak — forest/plains/meadow per-biome density (slice 2)
          // forest reads DENSE (every rolled column); plains/meadow read OPEN (an extra thinning
          // roll ~halves them). jungle now has its own vine-canopy branch above. Deterministic (vegRandom only).
          const sparse = flora === 'plains_tree' || flora === 'flowers';
          if (!sparse || vegRandom(worldX, worldZ, 5) < 0.5) {
            const treeHeight = 4 + Math.floor(vegRandom(worldX, worldZ, 2) * 3);
            for (let ty = 1; ty <= treeHeight; ty++) {
              const ny = surfaceY + ty;
              if (ny >= CHUNK_HEIGHT) break;
              const idx = getIndex(x, ny, z);
              if (blocks[idx] !== 0) break; // don't grow the trunk through rock/overhangs
              blocks[idx] = 6;
            }
            // Leaves
            for (let lx = -1; lx <= 1; lx++) {
              for (let lz = -1; lz <= 1; lz++) {
                for (let ly = 0; ly <= 2; ly++) {
                  const nx = x + lx;
                  const nz = z + lz;
                  const ny = surfaceY + treeHeight + ly;
                  if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny < CHUNK_HEIGHT) {
                    const leafIdx = getIndex(nx, ny, nz);
                    if (blocks[leafIdx] === 0) blocks[leafIdx] = 7;
                  }
                }
              }
            }
          }
        } else if (surfaceBlock === 4 && flora === 'cactus') { // Desert cacti only — mesa (flora 'none') stays bare badlands; beaches near non-desert biomes too
          const cactusHeight = 2 + Math.floor(vegRandom(worldX, worldZ, 3) * 2);
          for (let ty = 1; ty <= cactusHeight; ty++) {
            const ny = surfaceY + ty;
            if (ny >= CHUNK_HEIGHT) break;
            const idx = getIndex(x, ny, z);
            if (blocks[idx] !== 0) break; // don't grow the cactus through rock
            blocks[idx] = 8;
          }
        } else if (surfaceBlock === 5) { // Snow Pines (M4a — the snow biome's signature flora)
          const pineH = 5 + Math.floor(vegRandom(worldX, worldZ, 4) * 4); // 5-8, deterministic
          const { trunk, leaves } = pineShape(pineH);
          for (const [, dy] of trunk) {
            const ny = surfaceY + dy;
            if (ny >= CHUNK_HEIGHT) break;
            const idx = getIndex(x, ny, z);
            if (blocks[idx] !== 0) break; // don't grow the trunk through rock/overhangs
            blocks[idx] = 6; // trunk (in this column)
          }
          for (const [dx, dy, dz] of leaves) {
            const nx = x + dx, nz = z + dz, ny = surfaceY + dy;
            if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny < CHUNK_HEIGHT) {
              const leafIdx = getIndex(nx, ny, nz);
              if (blocks[leafIdx] === 0) blocks[leafIdx] = 7; // needles, air-only (like the tree)
            }
          }
        } else if (surfaceBlock === 2 && flora === 'swamp') { // swamp: short droopy trees on the murky dirt flats (was barren)
          const swH = 3 + Math.floor(vegRandom(worldX, worldZ, 4) * 2); // 3-4 short trunk
          const { trunk, leaves } = swampShape(swH);
          for (const [, dy] of trunk) {
            const ny = surfaceY + dy;
            if (ny >= CHUNK_HEIGHT) break;
            const idx = getIndex(x, ny, z);
            if (blocks[idx] !== 0) break;
            blocks[idx] = 6;
          }
          for (const [dx, dy, dz] of leaves) {
            const nx = x + dx, nz = z + dz, ny = surfaceY + dy;
            if (nx >= 0 && nx < CHUNK_SIZE && nz >= 0 && nz < CHUNK_SIZE && ny < CHUNK_HEIGHT) {
              const leafIdx = getIndex(nx, ny, nz);
              if (blocks[leafIdx] === 0) blocks[leafIdx] = 7;
            }
          }
        }
      }
    }
  }

  // 5b. Stamp the crafted HOME ANCHOR plinth (origin chunks only). AFTER foliage so it clears any
  //     tree in its footprint; BEFORE the player-mod replay so player edits still win. NO-RE-MESH
  //     (baked into the chunk array here, meshed once like all gen output).
  stampHomeAnchor(blocks, cx, cz);
  // 5c. Flatten a small terrace under each frontier-outpost building so they sit flush (M-HUB). Same
  //     timing/constraints as stampHomeAnchor (after foliage, before player-mod replay). NO-RE-MESH.
  stampHub(blocks, cx, cz);

  // 6. Apply late player in-game block modifications over the chunk data
  const modKey = `${cx}_${cz}`;
  if (chunkModifications.has(modKey)) {
    const mods = chunkModifications.get(modKey);
    for (const [idx, type] of mods.entries()) {
      blocks[idx] = type;
    }
  }

  return blocks;
}

// Helper to convert an sRGB hex to linear RGB for the BLOCK_COLORS table (which tints break-debris particles).
function toLinear(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  
  const linear = (c) => c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
  
  return [linear(r), linear(g), linear(b)];
}

// Map BlockType to RGB colors matching existing Crafty palettes (converted to Linear space)
const BLOCK_COLORS = {
  1: toLinear('#567C35'),   // Grass
  2: toLinear('#976D4D'),  // Dirt
  3: toLinear('#707070'), // Stone
  4: toLinear('#C2B280'), // Sand
  5: toLinear('#FFFFFF'), // Snow
  6: toLinear('#5D4037'), // Wood/Trunk
  7: toLinear('#2E7D32'), // Leaves
  8: toLinear('#2E7D32'), // Cactus
  9: toLinear('#3F76E4'), // Water
  10: toLinear('#2F2F2F'), // Coal ore   (S6 -- debris was shattering WHITE via the [1,1,1] fallback)
  11: toLinear('#D8AF93'), // Iron ore
  12: toLinear('#FCEE4B'), // Gold ore
  13: toLinear('#4FD0E7'), // Diamond ore
  // R4a: cobblestone + glass were offered in the HOTBAR but had NO voxel id — placing them produced STONE.
  // Ids must stay in sync with src/world/blockIds.js AND the texture-array layer index (layer == block code,
  // proceduralTextures.js numLayers). block-id-gates.test.js locks the three together.
  14: toLinear('#7F7F7F'), // Cobblestone
  15: toLinear('#F0F8FF'), // Glass (renders OPAQUE for now -- see blockIds.js; true transparency needs a
  //                          second transparent draw pass, tracked as a follow-up. Correct identity beats
  //                          a silent substitution to stone.)
  255: [1, 1, 1]
};


