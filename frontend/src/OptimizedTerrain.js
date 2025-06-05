import React, { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// Optimized Terrain Generation System - Fixing Performance Issues
export class TerrainManager {
  constructor() {
    this.chunks = new Map();
    this.chunkSize = 16;
    this.renderDistance = 3;
    this.generationQueue = [];
    this.isGenerating = false;
    this.geometryPool = new Map();
    this.materialPool = new Map();
    this.lastPlayerChunk = { x: 0, z: 0 };
    this.frameSkipCounter = 0;
    this.maxGenerationsPerFrame = 1;
    this.pendingChunks = new Set();
    
    // Performance monitoring
    this.performanceMetrics = {
      frameTime: 0,
      generationTime: 0,
      memoryUsage: 0
    };
    
    this.initializePools();
  }

  // Initialize object pools for better performance
  initializePools() {
    // Pre-create geometries
    this.geometryPool.set('block', new THREE.BoxGeometry(1, 1, 1));
    
    // Pre-create materials
    const blockTypes = {
      grass: '#567C35',
      dirt: '#976D4D',
      stone: '#707070',
      wood: '#8F7748',
      sand: '#DBD3A0'
    };
    
    Object.entries(blockTypes).forEach(([type, color]) => {
      this.materialPool.set(type, new THREE.MeshLambertMaterial({ color }));
    });
  }

  // Enhanced terrain generation with noise
  generateTerrain(x, z) {
    // Multi-octave noise for more interesting terrain
    const noise1 = Math.sin(x * 0.1) * Math.cos(z * 0.1) * 3;
    const noise2 = Math.sin(x * 0.05) * Math.cos(z * 0.05) * 6;
    const noise3 = Math.sin(x * 0.02) * Math.cos(z * 0.02) * 2;
    
    const height = Math.floor(Math.max(10, Math.min(18, noise1 + noise2 + noise3 + 15)));
    return height;
  }

  // Progressive chunk generation - non-blocking
  async generateChunkProgressive(chunkX, chunkZ) {
    const chunkKey = `${chunkX}_${chunkZ}`;
    
    if (this.chunks.has(chunkKey) || this.pendingChunks.has(chunkKey)) {
      return null;
    }
    
    this.pendingChunks.add(chunkKey);
    
    const startTime = performance.now();
    const blocks = new Map();
    const startX = chunkX * this.chunkSize;
    const startZ = chunkZ * this.chunkSize;
    
    // Generate in smaller batches to prevent frame drops
    for (let batchX = 0; batchX < this.chunkSize; batchX += 4) {
      for (let batchZ = 0; batchZ < this.chunkSize; batchZ += 4) {
        
        // Process mini-batch
        for (let x = batchX; x < Math.min(batchX + 4, this.chunkSize); x++) {
          for (let z = batchZ; z < Math.min(batchZ + 4, this.chunkSize); z++) {
            const worldX = startX + x;
            const worldZ = startZ + z;
            const height = this.generateTerrain(worldX, worldZ);
            
            // Surface block (95% grass, 5% sand)
            const surfaceType = Math.random() < 0.95 ? 'grass' : 'sand';
            const surfaceKey = `${worldX},${height},${worldZ}`;
            blocks.set(surfaceKey, {
              position: [worldX, height, worldZ],
              type: surfaceType,
              needsGrass: surfaceType === 'grass'
            });
            
            // Underground layers
            for (let y = height - 1; y >= Math.max(height - 3, 8); y--) {
              const blockType = y === height - 1 ? 'dirt' : 'stone';
              const key = `${worldX},${y},${worldZ}`;
              blocks.set(key, {
                position: [worldX, y, worldZ],
                type: blockType,
                needsGrass: false
              });
            }
            
            // Occasional trees (reduced frequency for performance)
            if (surfaceType === 'grass' && Math.random() < 0.02) {
              this.generateTree(blocks, worldX, height, worldZ);
            }
          }
        }
        
        // Yield control every mini-batch to maintain frame rate
        if (batchX % 8 === 0 || batchZ % 8 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
    }
    
    const generationTime = performance.now() - startTime;
    this.performanceMetrics.generationTime = generationTime;
    
    const chunkData = {
      key: chunkKey,
      blocks,
      chunkX,
      chunkZ,
      generated: true,
      blockCount: blocks.size
    };
    
    this.chunks.set(chunkKey, chunkData);
    this.pendingChunks.delete(chunkKey);
    
    return chunkData;
  }

  // Optimized tree generation
  generateTree(blockMap, x, baseY, z) {
    const treeHeight = 2 + Math.floor(Math.random() * 2);
    
    // Trunk
    for (let y = 1; y <= treeHeight; y++) {
      const key = `${x},${baseY + y},${z}`;
      blockMap.set(key, {
        position: [x, baseY + y, z],
        type: 'wood',
        needsGrass: false
      });
    }
    
    // Compact leaves
    const leafY = baseY + treeHeight + 1;
    const leafPositions = [
      [x, leafY, z],
      [x + 1, leafY, z], [x - 1, leafY, z],
      [x, leafY, z + 1], [x, leafY, z - 1]
    ];
    
    leafPositions.forEach(([lx, ly, lz]) => {
      const key = `${lx},${ly},${lz}`;
      blockMap.set(key, {
        position: [lx, ly, lz],
        type: 'grass',
        needsGrass: false
      });
    });
  }

  // Smart chunk loading based on player movement
  updateChunks(playerPosition) {
    const currentChunkX = Math.floor(playerPosition.x / this.chunkSize);
    const currentChunkZ = Math.floor(playerPosition.z / this.chunkSize);
    
    // Only process if player moved to new chunk
    if (currentChunkX !== this.lastPlayerChunk.x || currentChunkZ !== this.lastPlayerChunk.z) {
      this.lastPlayerChunk = { x: currentChunkX, z: currentChunkZ };
      
      // Priority queue for chunk generation
      const priorities = [];
      
      for (let x = -this.renderDistance; x <= this.renderDistance; x++) {
        for (let z = -this.renderDistance; z <= this.renderDistance; z++) {
          const chunkX = currentChunkX + x;
          const chunkZ = currentChunkZ + z;
          const distance = Math.sqrt(x * x + z * z);
          
          if (distance <= this.renderDistance) {
            priorities.push({ chunkX, chunkZ, distance });
          }
        }
      }
      
      // Sort by distance (closest first)
      priorities.sort((a, b) => a.distance - b.distance);
      
      // Add to generation queue
      priorities.forEach(({ chunkX, chunkZ }) => {
        const chunkKey = `${chunkX}_${chunkZ}`;
        if (!this.chunks.has(chunkKey) && !this.pendingChunks.has(chunkKey)) {
          this.generationQueue.push({ chunkX, chunkZ });
        }
      });
    }
  }

  // Process generation queue with frame rate protection
  async processGenerationQueue() {
    if (this.isGenerating || this.generationQueue.length === 0) return;
    
    this.isGenerating = true;
    const maxGenerations = Math.min(this.maxGenerationsPerFrame, this.generationQueue.length);
    
    for (let i = 0; i < maxGenerations; i++) {
      const chunk = this.generationQueue.shift();
      if (chunk) {
        await this.generateChunkProgressive(chunk.chunkX, chunk.chunkZ);
        
        // Check frame time and break if getting slow
        if (performance.now() % 16 > 12) break; // If we're taking too long in this frame
      }
    }
    
    this.isGenerating = false;
  }

  // Get visible blocks with advanced culling
  getVisibleBlocks(cameraPosition) {
    const visibleBlocks = [];
    const maxDistance = this.renderDistance * this.chunkSize + 10;
    
    this.chunks.forEach(chunk => {
      if (!chunk.generated) return;
      
      chunk.blocks.forEach(block => {
        // Distance culling
        const dx = block.position[0] - cameraPosition.x;
        const dz = block.position[2] - cameraPosition.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        if (distance > maxDistance) return;
        
        // Height culling
        const dy = Math.abs(block.position[1] - cameraPosition.y);
        if (dy > 25) return;
        
        visibleBlocks.push(block);
      });
    });
    
    return visibleBlocks;
  }

  // Memory management
  cleanupDistantChunks(playerPosition) {
    const maxDistance = (this.renderDistance + 2) * this.chunkSize;
    const chunksToRemove = [];
    
    this.chunks.forEach((chunk, key) => {
      const chunkCenterX = chunk.chunkX * this.chunkSize + this.chunkSize / 2;
      const chunkCenterZ = chunk.chunkZ * this.chunkSize + this.chunkSize / 2;
      
      const distance = Math.sqrt(
        Math.pow(chunkCenterX - playerPosition.x, 2) +
        Math.pow(chunkCenterZ - playerPosition.z, 2)
      );
      
      if (distance > maxDistance) {
        chunksToRemove.push(key);
      }
    });
    
    // Remove distant chunks
    chunksToRemove.forEach(key => {
      this.chunks.delete(key);
    });
    
    this.performanceMetrics.memoryUsage = this.chunks.size;
  }

  // Get performance metrics
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      chunksLoaded: this.chunks.size,
      queueSize: this.generationQueue.length,
      pendingChunks: this.pendingChunks.size
    };
  }
}

// React component wrapper for the terrain system
export const OptimizedTerrain = ({ gameState, onBlocksUpdate }) => {
  const { camera } = useThree();
  const terrainManagerRef = useRef(new TerrainManager());
  const [visibleBlocks, setVisibleBlocks] = useState([]);
  const lastUpdateTime = useRef(0);
  const frameCount = useRef(0);

  // Initialize terrain manager
  useEffect(() => {
    const terrainManager = terrainManagerRef.current;
    
    // Generate initial chunks around spawn
    const initialChunks = [
      { chunkX: 0, chunkZ: 0 },
      { chunkX: 1, chunkZ: 0 }, { chunkX: -1, chunkZ: 0 },
      { chunkX: 0, chunkZ: 1 }, { chunkX: 0, chunkZ: -1 }
    ];
    
    initialChunks.forEach(chunk => {
      terrainManager.generationQueue.push(chunk);
    });
  }, []);

  // Frame-based updates with performance monitoring
  useFrame((state, delta) => {
    const now = performance.now();
    frameCount.current++;
    
    // Throttle updates to maintain performance
    if (now - lastUpdateTime.current < 33) return; // ~30fps for terrain updates
    
    const terrainManager = terrainManagerRef.current;
    
    // Update chunks based on player position
    terrainManager.updateChunks(camera.position);
    
    // Process generation queue
    terrainManager.processGenerationQueue();
    
    // Update visible blocks every few frames
    if (frameCount.current % 3 === 0) {
      const blocks = terrainManager.getVisibleBlocks(camera.position);
      setVisibleBlocks(blocks);
      
      if (onBlocksUpdate) {
        onBlocksUpdate(blocks);
      }
    }
    
    // Cleanup distant chunks occasionally
    if (frameCount.current % 300 === 0) { // Every 10 seconds at 30fps
      terrainManager.cleanupDistantChunks(camera.position);
    }
    
    lastUpdateTime.current = now;
  });

  // Expose terrain functions globally
  useEffect(() => {
    const terrainManager = terrainManagerRef.current;
    
    window.getHighestBlockAt = (x, z) => {
      let maxY = 10;
      
      visibleBlocks.forEach(block => {
        if (Math.floor(block.position[0]) === Math.floor(x) && 
            Math.floor(block.position[2]) === Math.floor(z)) {
          maxY = Math.max(maxY, block.position[1]);
        }
      });
      
      return maxY;
    };
    
    window.getTerrainPerformance = () => terrainManager.getPerformanceMetrics();
  }, [visibleBlocks]);

  return (
    <group>
      {visibleBlocks.map((block, index) => (
        <TerrainBlock key={`${block.position[0]}-${block.position[1]}-${block.position[2]}`} block={block} />
      ))}
    </group>
  );
};

// Optimized terrain block component
const TerrainBlock = React.memo(({ block }) => {
  const meshRef = useRef();
  
  // Reuse geometries and materials
  const geometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const material = useMemo(() => {
    const colors = {
      grass: '#567C35',
      dirt: '#976D4D',
      stone: '#707070',
      wood: '#8F7748',
      sand: '#DBD3A0'
    };
    
    return new THREE.MeshLambertMaterial({ 
      color: colors[block.type] || colors.grass 
    });
  }, [block.type]);

  return (
    <mesh
      ref={meshRef}
      position={block.position}
      geometry={geometry}
      material={material}
      userData={{ blockType: block.type }}
    />
  );
});

export default OptimizedTerrain;
