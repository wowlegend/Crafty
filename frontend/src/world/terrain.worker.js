import { createNoise3D, createNoise2D } from 'simplex-noise';

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
    
    // Transfer buffers back to main thread
    self.postMessage({
      type: 'chunk_mesh',
      payload: {
        cx, cz,
        positions: meshData.positions,
        normals: meshData.normals,
        colors: meshData.colors,
        indices: meshData.indices
      }
    }, [
      meshData.positions.buffer, 
      meshData.normals.buffer, 
      meshData.colors.buffer, 
      meshData.indices.buffer
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
      self.postMessage({
        type: 'chunk_mesh',
        payload: {
          cx, cz,
          positions: meshData.positions,
          normals: meshData.normals,
          colors: meshData.colors,
          indices: meshData.indices
        }
      }, [
        meshData.positions.buffer, 
        meshData.normals.buffer, 
        meshData.colors.buffer, 
        meshData.indices.buffer
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

function generateChunkData(cx, cz) {
  const blocks = new Uint8Array(VOLUME);
  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;

  // 1. Biome & Height Generation
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const worldX = startX + x;
      const worldZ = startZ + z;
      
      // Moisture & Temperature for Biomes
      const moisture = noise2D(worldX * 0.005, worldZ * 0.005) * 0.5 + 0.5;
      const temperature = noise2D((worldX + 500) * 0.005, (worldZ + 500) * 0.005) * 0.5 + 0.5;
      
      // Base height
      let n = noise2D(worldX * 0.01, worldZ * 0.01) * 0.5 + 0.5;
      n += noise2D(worldX * 0.05, worldZ * 0.05) * 0.1;
      
      const surfaceY = Math.floor(30 + n * 40);

      // Determine Biome
      let surfaceBlock = 1; // Grass
      let secondaryBlock = 2; // Dirt
      if (temperature > 0.7 && moisture < 0.3) {
          surfaceBlock = 4; // Desert (Sand)
          secondaryBlock = 4;
      } else if (temperature < 0.3) {
          surfaceBlock = 5; // Snow
          secondaryBlock = 3; // Stone underneath snow
      }

      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        const index = getIndex(x, y, z);
        
        if (y > surfaceY) {
          blocks[index] = 0; // Air
        } else {
          // 2. Deep Caves Logic (Swiss Cheese)
          const caveNoise = noise3D(worldX * 0.04, y * 0.08, worldZ * 0.04);
          const caveThreshold = y < 20 ? 0.3 : 0.45; // More caves lower down

          if (y < surfaceY - 4 && caveNoise > caveThreshold) {
            blocks[index] = 0;
          } else {
            if (y === surfaceY) {
              blocks[index] = surfaceBlock;
            } else if (y >= surfaceY - 3) {
              blocks[index] = secondaryBlock;
            } else {
              blocks[index] = 3; // Stone
            }
          }
        }
      }

      // 3. Foliage Decorators (Only on surface)
      if (blocks[getIndex(x, surfaceY, z)] !== 0 && Math.random() < 0.02) {
          if (surfaceBlock === 1) { // Trees in Forest/Grass
              const treeHeight = 4 + Math.floor(Math.random() * 3);
              for (let ty = 1; ty <= treeHeight; ty++) {
                  if (surfaceY + ty < CHUNK_HEIGHT) blocks[getIndex(x, surfaceY + ty, z)] = 6;
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
          } else if (surfaceBlock === 4) { // Cacti in Desert
              const cactusHeight = 2 + Math.floor(Math.random() * 2);
              for (let ty = 1; ty <= cactusHeight; ty++) {
                  if (surfaceY + ty < CHUNK_HEIGHT) blocks[getIndex(x, surfaceY + ty, z)] = 8;
              }
          }
      }
    }
  }
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
  255: [1, 1, 1] 
};

// Face definitions
const FACES = [
  { dir: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] }, // Top
  { dir: [0, -1, 0], corners: [[1, 0, 0], [1, 0, 1], [0, 0, 1], [0, 0, 0]] }, // Bottom
  { dir: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] }, // Right
  { dir: [-1, 0, 0], corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] }, // Left
  { dir: [0, 0, 1], corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] }, // Front
  { dir: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] } // Back
];

function generateMesh(cx, cz, blocks) {
  const positions = [];
  const normals = [];
  const colors = [];
  const indices = [];
  let indexOffset = 0;

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const index = getIndex(x, y, z);
        const blockType = blocks[index];
        if (blockType === 0) continue; // Skip air

        const color = BLOCK_COLORS[blockType] || [1, 1, 1];

        // Check all 6 faces
        for (const { dir, corners } of FACES) {
          const nx = x + dir[0];
          const ny = y + dir[1];
          const nz = z + dir[2];
          
          let drawFace = false;
          // If neighbor is outside this chunk, we draw it for now.
          if (nx < 0 || nx >= CHUNK_SIZE || ny < 0 || ny >= CHUNK_HEIGHT || nz < 0 || nz >= CHUNK_SIZE) {
            drawFace = true;
          } else {
            const neighborIndex = getIndex(nx, ny, nz);
            if (blocks[neighborIndex] === 0) {
              drawFace = true; // Air neighbor = visible face
            }
          }

          if (drawFace) {
            for (const pos of corners) {
              // Local chunk coordinates
              const px = x + pos[0];
              const py = y + pos[1];
              const pz = z + pos[2];
              
              positions.push(px, py, pz);
              normals.push(...dir);

              // Mathematically correct face-aligned Ambient Occlusion corner checks (Minecraft formula)
              let s1 = [0, 0, 0];
              let s2 = [0, 0, 0];

              if (dir[0] !== 0) { // X-aligned face (Right/Left)
                s1 = [0, pos[1] === 0 ? -1 : 1, 0];
                s2 = [0, 0, pos[2] === 0 ? -1 : 1];
              } else if (dir[1] !== 0) { // Y-aligned face (Top/Bottom)
                s1 = [pos[0] === 0 ? -1 : 1, 0, 0];
                s2 = [0, 0, pos[2] === 0 ? -1 : 1];
              } else if (dir[2] !== 0) { // Z-aligned face (Front/Back)
                s1 = [pos[0] === 0 ? -1 : 1, 0, 0];
                s2 = [0, pos[1] === 0 ? -1 : 1, 0];
              }

              const checkNeighbor = (ox, oy, oz) => {
                const nx = x + ox;
                const ny = y + oy;
                const nz = z + oz;
                if (nx < 0 || nx >= CHUNK_SIZE || ny < 0 || ny >= CHUNK_HEIGHT || nz < 0 || nz >= CHUNK_SIZE) return 0;
                return blocks[getIndex(nx, ny, nz)] !== 0 ? 1 : 0;
              };

              const side1 = checkNeighbor(dir[0] + s1[0], dir[1] + s1[1], dir[2] + s1[2]);
              const side2 = checkNeighbor(dir[0] + s2[0], dir[1] + s2[1], dir[2] + s2[2]);
              const corner = checkNeighbor(dir[0] + s1[0] + s2[0], dir[1] + s1[1] + s2[1], dir[2] + s1[2] + s2[2]);

              let aoValue;
              if (side1 === 1 && side2 === 1) {
                aoValue = 3;
              } else {
                aoValue = side1 + side2 + corner;
              }

              const aoMult = 1.0 - (aoValue * 0.18);
              colors.push(color[0] * aoMult, color[1] * aoMult, color[2] * aoMult);
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
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices)
  };
}
