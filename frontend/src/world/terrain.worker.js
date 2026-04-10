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

      if (blockType === 0 && prevBlock !== 0) {
        const colorArray = BLOCK_COLORS[prevBlock] || [1, 1, 1];
        self.postMessage({
          type: 'block_broken',
          payload: {
            x: cx * CHUNK_SIZE + x,
            y,
            z: cz * CHUNK_SIZE + z,
            color: `#${Math.round(colorArray[0]*255).toString(16).padStart(2,'0')}${Math.round(colorArray[1]*255).toString(16).padStart(2,'0')}${Math.round(colorArray[2]*255).toString(16).padStart(2,'0')}`
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
};

function getIndex(x, y, z) {
  return x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
}

function generateChunkData(cx, cz) {
  const blocks = new Uint8Array(VOLUME);
  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;

  // Simple generation: 2D base height + 3D caves
  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const worldX = startX + x;
      const worldZ = startZ + z;
      
      // Base height
      let n = noise2D(worldX * 0.01, worldZ * 0.01) * 0.5 + 0.5; // 0 to 1
      n += noise2D(worldX * 0.05, worldZ * 0.05) * 0.2; // details
      
      const surfaceY = Math.floor(20 + n * 30); // Surface between 20 and 50

      for (let y = 0; y < CHUNK_HEIGHT; y++) {
        const index = getIndex(x, y, z);
        
        if (y > surfaceY) {
          blocks[index] = 0; // Air
        } else {
          // Deep caves using 3D noise
          const caveNoise = noise3D(worldX * 0.05, y * 0.05, worldZ * 0.05);
          
          if (caveNoise > 0.3 && y < surfaceY - 5) {
            blocks[index] = 0; // Cave air
          } else {
            if (y === surfaceY) {
              blocks[index] = 1; // Grass
            } else if (y >= surfaceY - 3) {
              blocks[index] = 2; // Dirt
            } else {
              blocks[index] = 3; // Stone
            }
          }
        }
      }
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
  // Fallback for others currently unused by worker default gen
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
              positions.push(
                x + pos[0], 
                y + pos[1], 
                z + pos[2]
              );
              normals.push(...dir);
              colors.push(...color);
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
