import { createNoise3D, createNoise2D } from 'simplex-noise';
import { stampHomeAnchor, stampHub } from './homeAnchor.js';
import { SEA_LEVEL, BEACH_BAND_TOP, OCEAN_CONTINENT_THRESHOLD, oceanSurfaceY } from './oceanProfile.js';
import { pickBiome } from './biomeTable.js';
import { pineShape } from './foliage.js';
import { computeHeight } from './heightAt.js';
import { cornerAO } from './vertexAO.js';
import { oreCodeFor } from './oreGen.js';
import { grassTops } from './grassField.js';

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
            color: `#${Math.round(colorArray[0]*255).toString(16).padStart(2,'0')}${Math.round(colorArray[1]*255).toString(16).padStart(2,'0')}${Math.round(colorArray[2]*255).toString(16).padStart(2,'0')}`,
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
  const caRangeHeight = 20;
  const tempSlice = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * caRangeHeight);

  function getTempBlockAt(tempArr, bx, by, bz) {
    if (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE) return 3;
    if (by < 0 || by >= caRangeHeight) return 3;
    return tempArr[bx + bz * CHUNK_SIZE + by * CHUNK_SIZE * CHUNK_SIZE];
  }

  for (let pass = 0; pass < 2; pass++) {
    // Copy active slice
    for (let y = 0; y < caRangeHeight; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          tempSlice[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = blocks[x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
        }
      }
    }

    // Run local 3D neighborhood evaluation
    for (let y = 1; y < caRangeHeight - 1; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const index = x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
          const currentType = tempSlice[index];
          
          let solidCount = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dz = -1; dz <= 1; dz++) {
              for (let dx = -1; dx <= 1; dx++) {
                const neighborType = getTempBlockAt(tempSlice, x + dx, y + dy, z + dz);
                if (neighborType > 0 && neighborType !== 9) {
                  solidCount++;
                }
              }
            }
          }

          if (currentType > 0 && currentType !== 9) {
            if (solidCount <= 11) {
              blocks[index] = 0; // Carve bottlenecks
            }
          } else if (currentType === 0) {
            if (solidCount >= 16) {
              blocks[index] = 3; // Consolidate walls
            }
          }
        }
      }
    }
  }
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
        } else if (surfaceBlock === 1) { // grass broadleaf — per-biome density + height (slice 2)
          // forest/jungle read DENSE (every rolled column); plains/savanna/meadow read OPEN (an extra
          // thinning roll ~halves them). jungle canopy stands TALLER. Deterministic (vegRandom only).
          const sparse = flora === 'plains_tree' || flora === 'savanna' || flora === 'flowers';
          if (!sparse || vegRandom(worldX, worldZ, 5) < 0.5) {
            const treeHeight = (flora === 'jungle' ? 7 : 4) + Math.floor(vegRandom(worldX, worldZ, 2) * 3);
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

// Helper to convert sRGB to Linear for BufferGeometry vertex colors
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
  255: [1, 1, 1]
};

// Pre-allocated reusable buffer to prevent GC churn (max size: 16x256 = 4096 entries)
const mask = new Uint16Array(4096);

function generateMesh(cx, cz, blocks) {
  const positions = [];
  const normals = [];
  const colors = [];
  const uvs = [];
  const indices = [];
  const ao = []; // S1 vertex AO: per-corner 0..3 occlusion baked here, read as the `aAO` attribute in Terrain.jsx
  let indexOffset = 0;

  const CHUNK_SIZE = 16;
  const CHUNK_HEIGHT = 256;

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
      // 1. Reset our reusable mask
      mask.fill(0);

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
          for (const C of [c0, c1, c2, c3]) {
            if (blockType === 9) { ao.push(3); continue; } // water: no AO
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

          // Tiled repeats UV coordinates mapping matching CCW corners
          uvs.push(
            0, 0,
            0, h,
            w, h,
            w, 0
          );

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

