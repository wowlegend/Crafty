// ============ ULTRA-OPTIMIZED TERRAIN GENERATION ============
// Fixes lag and freezing issues with advanced chunk management

export class TerrainOptimizer {
  constructor() {
    this.chunkCache = new Map();
    this.generationQueue = [];
    this.isGenerating = false;
    this.maxChunksPerFrame = 2; // Reduced for ultra-smooth performance
    this.lastFrameTime = 0;
    this.frameTimeTarget = 16; // Target 60fps (16ms per frame)
    this.backgroundWorker = null;
    
    // Performance monitoring
    this.performanceStats = {
      chunksGenerated: 0,
      averageGenerationTime: 0,
      frameDrops: 0
    };
    
    this.initializeBackgroundGeneration();
  }
  
  initializeBackgroundGeneration() {
    // Use Web Workers if available for background generation
    if (typeof Worker !== 'undefined') {
      try {
        const workerCode = `
          self.onmessage = function(e) {
            const { chunkX, chunkZ, chunkSize } = e.data;
            const blocks = generateChunkData(chunkX, chunkZ, chunkSize);
            self.postMessage({ chunkX, chunkZ, blocks });
          };
          
          function generateChunkData(chunkX, chunkZ, chunkSize) {
            const blocks = new Map();
            const startX = chunkX * chunkSize;
            const startZ = chunkZ * chunkSize;
            
            for (let x = startX; x < startX + chunkSize; x += 2) {
              for (let z = startZ; z < startZ + chunkSize; z += 2) {
                const height = generateTerrain(x, z);
                
                // Surface block
                const key = x + ',' + height + ',' + z;
                blocks.set(key, {
                  position: [x, height, z],
                  type: Math.random() < 0.95 ? 'grass' : 'sand',
                  cached: true
                });
                
                // Ground block
                const groundKey = x + ',' + (height - 1) + ',' + z;
                blocks.set(groundKey, {
                  position: [x, height - 1, z],
                  type: 'dirt',
                  cached: true
                });
              }
            }
            
            return Array.from(blocks.entries());
          }
          
          function generateTerrain(x, z) {
            const noise = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 2 + 
                         Math.sin(x * 0.04) * Math.cos(z * 0.04) * 4;
            return Math.floor(Math.max(12, Math.min(16, noise + 15)));
          }
        `;
        
        const blob = new Blob([workerCode], { type: 'application/javascript' });
        this.backgroundWorker = new Worker(URL.createObjectURL(blob));
        
        this.backgroundWorker.onmessage = (e) => {
          const { chunkX, chunkZ, blocks } = e.data;
          this.onWorkerChunkComplete(chunkX, chunkZ, blocks);
        };
        
        console.log('🚀 Background terrain generation worker initialized');
      } catch (error) {
        console.warn('Web Worker not available, using main thread generation:', error);
      }
    }
  }
  
  onWorkerChunkComplete(chunkX, chunkZ, blocksArray) {
    const chunkKey = `${chunkX}_${chunkZ}`;
    const blocks = new Map(blocksArray);
    
    this.chunkCache.set(chunkKey, {
      blocks,
      generated: true,
      lastAccessed: Date.now(),
      generationTime: Date.now() - this.generationStartTime
    });
    
    // Update performance stats
    this.performanceStats.chunksGenerated++;
    const genTime = Date.now() - this.generationStartTime;
    this.performanceStats.averageGenerationTime = 
      (this.performanceStats.averageGenerationTime + genTime) / 2;
    
    // Trigger update callback if set
    if (this.onChunkCompleted) {
      this.onChunkCompleted(chunkKey, blocks);
    }
  }
  
  generateChunkAsync(chunkX, chunkZ, chunkSize = 16) {
    const chunkKey = `${chunkX}_${chunkZ}`;
    
    // Check if already generated or in progress
    if (this.chunkCache.has(chunkKey)) {
      return Promise.resolve(this.chunkCache.get(chunkKey).blocks);
    }
    
    // Add to generation queue
    return new Promise((resolve) => {
      this.generationQueue.push({
        chunkX,
        chunkZ,
        chunkSize,
        resolve,
        priority: this.calculatePriority(chunkX, chunkZ),
        addedAt: Date.now()
      });
      
      this.processGenerationQueue();
    });
  }
  
  processGenerationQueue() {
    if (this.isGenerating || this.generationQueue.length === 0) return;
    
    // Sort by priority (distance from player)
    this.generationQueue.sort((a, b) => a.priority - b.priority);
    
    this.isGenerating = true;
    this.processNextChunk();
  }
  
  processNextChunk() {
    const currentTime = performance.now();
    const frameTime = currentTime - this.lastFrameTime;
    
    // If frame time is too high, delay generation to maintain smooth gameplay
    if (frameTime > this.frameTimeTarget * 1.5) {
      this.performanceStats.frameDrops++;
      setTimeout(() => this.processNextChunk(), 16); // Wait one frame
      return;
    }
    
    const nextJob = this.generationQueue.shift();
    if (!nextJob) {
      this.isGenerating = false;
      return;
    }
    
    this.generationStartTime = Date.now();
    
    if (this.backgroundWorker) {
      // Use background worker for generation
      this.backgroundWorker.postMessage({
        chunkX: nextJob.chunkX,
        chunkZ: nextJob.chunkZ,
        chunkSize: nextJob.chunkSize
      });
    } else {
      // Fallback to main thread with time slicing
      this.generateChunkMainThread(nextJob);
    }
    
    this.lastFrameTime = currentTime;
  }
  
  generateChunkMainThread(job) {
    const { chunkX, chunkZ, chunkSize, resolve } = job;
    const chunkKey = `${chunkX}_${chunkZ}`;
    
    // Time-sliced generation
    const generateWithTimeSlicing = () => {
      const startTime = performance.now();
      const maxTime = 8; // Maximum 8ms per slice
      
      const blocks = new Map();
      const startX = chunkX * chunkSize;
      const startZ = chunkZ * chunkSize;
      
      let completed = false;
      let x = startX;
      let z = startZ;
      
      const generateSlice = () => {
        const sliceStart = performance.now();
        
        while (x < startX + chunkSize && performance.now() - sliceStart < maxTime) {
          while (z < startZ + chunkSize && performance.now() - sliceStart < maxTime) {
            const height = this.generateTerrain(x, z);
            
            // Surface block
            const key = `${x},${height},${z}`;
            blocks.set(key, {
              position: [x, height, z],
              type: Math.random() < 0.95 ? 'grass' : 'sand',
              cached: true
            });
            
            // Ground block
            const groundKey = `${x},${height - 1},${z}`;
            blocks.set(groundKey, {
              position: [x, height - 1, z],
              type: 'dirt',
              cached: true
            });
            
            z += 2; // Skip blocks for performance
          }
          
          if (z >= startZ + chunkSize) {
            x += 2;
            z = startZ;
          }
        }
        
        if (x >= startX + chunkSize) {
          // Chunk complete
          this.chunkCache.set(chunkKey, {
            blocks,
            generated: true,
            lastAccessed: Date.now(),
            generationTime: Date.now() - this.generationStartTime
          });
          
          resolve(blocks);
          
          if (this.onChunkCompleted) {
            this.onChunkCompleted(chunkKey, blocks);
          }
          
          // Process next chunk
          setTimeout(() => this.processNextChunk(), 0);
        } else {
          // Continue next frame
          setTimeout(generateSlice, 0);
        }
      };
      
      generateSlice();
    };
    
    generateWithTimeSlicing();
  }
  
  generateTerrain(x, z) {
    const noise = Math.sin(x * 0.08) * Math.cos(z * 0.08) * 2 + 
                  Math.sin(x * 0.04) * Math.cos(z * 0.04) * 4;
    return Math.floor(Math.max(12, Math.min(16, noise + 15)));
  }
  
  calculatePriority(chunkX, chunkZ) {
    // Priority based on distance from player (lower = higher priority)
    if (this.playerPosition) {
      const playerChunkX = Math.floor(this.playerPosition.x / 16);
      const playerChunkZ = Math.floor(this.playerPosition.z / 16);
      
      const dx = chunkX - playerChunkX;
      const dz = chunkZ - playerChunkZ;
      
      return Math.sqrt(dx * dx + dz * dz);
    }
    
    return Math.abs(chunkX) + Math.abs(chunkZ);
  }
  
  updatePlayerPosition(position) {
    this.playerPosition = position;
  }
  
  preloadChunksAroundPlayer(renderDistance = 3) {
    if (!this.playerPosition) return;
    
    const playerChunkX = Math.floor(this.playerPosition.x / 16);
    const playerChunkZ = Math.floor(this.playerPosition.z / 16);
    
    // Generate chunks in expanding rings around player
    for (let ring = 0; ring <= renderDistance; ring++) {
      for (let dx = -ring; dx <= ring; dx++) {
        for (let dz = -ring; dz <= ring; dz++) {
          // Only generate edge chunks of current ring
          if (Math.abs(dx) !== ring && Math.abs(dz) !== ring) continue;
          
          const chunkX = playerChunkX + dx;
          const chunkZ = playerChunkZ + dz;
          const chunkKey = `${chunkX}_${chunkZ}`;
          
          if (!this.chunkCache.has(chunkKey)) {
            this.generateChunkAsync(chunkX, chunkZ);
          }
        }
      }
    }
  }
  
  cleanupDistantChunks(maxDistance = 5) {
    if (!this.playerPosition) return;
    
    const playerChunkX = Math.floor(this.playerPosition.x / 16);
    const playerChunkZ = Math.floor(this.playerPosition.z / 16);
    
    const toRemove = [];
    
    for (const [chunkKey, chunkData] of this.chunkCache.entries()) {
      const [chunkX, chunkZ] = chunkKey.split('_').map(Number);
      const dx = chunkX - playerChunkX;
      const dz = chunkZ - playerChunkZ;
      const distance = Math.sqrt(dx * dx + dz * dz);
      
      if (distance > maxDistance) {
        toRemove.push(chunkKey);
      }
    }
    
    toRemove.forEach(key => {
      this.chunkCache.delete(key);
    });
    
    if (toRemove.length > 0) {
      console.log(`🧹 Cleaned up ${toRemove.length} distant chunks`);
    }
  }
  
  getPerformanceStats() {
    return {
      ...this.performanceStats,
      cacheSize: this.chunkCache.size,
      queueLength: this.generationQueue.length,
      isGenerating: this.isGenerating
    };
  }
  
  setChunkCompletedCallback(callback) {
    this.onChunkCompleted = callback;
  }
  
  destroy() {
    if (this.backgroundWorker) {
      this.backgroundWorker.terminate();
    }
    this.chunkCache.clear();
    this.generationQueue.length = 0;
  }
}

// Export singleton instance
export const terrainOptimizer = new TerrainOptimizer();