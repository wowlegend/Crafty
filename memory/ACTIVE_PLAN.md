# Active Plan: Dynamic Infinite Mob Spawning & Terrain Chunk Memory Leak Resolution

## Goal
Deeply investigate and resolve the issue where mobs stop spawning in farther regions of the map once the player travels beyond the initial spawn area. Fix the chunk culling memory leak in `Terrain.jsx` and re-engineer the spawner in `SimplifiedNPCSystem.jsx` to dynamically populate loaded chunks surrounding the player with zero performance spikes.

## Active Tasks
1. [x] **Phase 1: Chunk Memory Leak Resolution**
    - Modify `world/Terrain.jsx` to delete key from `chunksRef.current` when culling chunks.
    - Ensure `getGeneratedChunks` returns only keys of active, loaded chunks.
2. [x] **Phase 2: Dynamic Infinite Mob Spawning Engine**
    - Audit spawner ticks in `SimplifiedNPCSystem.jsx`.
    - Replace player-chunk spawned Set checking with an active mob population check.
    - Select random loaded chunk keys from `store.getGeneratedChunks()` and spawn mobs inside those chunks within the distance range `[28, 85]` blocks.
    - Cap the maximum simultaneous spawn rate to 3 per tick to prevent CPU micro-stuttering.
3. [x] **Phase 3: Production Verification & Build Validation**
    - Run the production compiler inside `frontend/` using `npm run build`.
    - Ensure zero type warnings, bundler errors, or runtime exceptions.
4. [ ] **Phase 4: Sweet Spot Spawner Filtering & Physics-Readiness Gate**
    - Modify `spawnMob` in `SimplifiedNPCSystem.jsx` to return boolean: `false` if `gy === null || isNaN(gy)`, and `true` at the end.
    - Re-engineer Spawner useFrame Loop in `SimplifiedNPCSystem.jsx` to check every 1000ms, filter chunks to center distance `[20, 90]`, and run a `while` spawn retry loop up to 6 attempts.
    - Audit all `getMobGroundLevel` checks in `SimplifiedNPCSystem.jsx`, `EnhancedMagicSystem.jsx`, `AdvancedGameFeatures.jsx`, and `Components.jsx` to check `!== null && !isNaN`.
    - Run production build `npm run build` in `frontend/` and verify compilation.


