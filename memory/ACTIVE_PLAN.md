# Active Plan: Dynamic Infinite Mob Spawning & Terrain Chunk Memory Leak Resolution

## Goal
Deeply investigate and resolve the issue where mobs stop spawning in farther regions of the map once the player travels beyond the initial spawn area. Fix the chunk culling memory leak in `Terrain.jsx` and re-engineer the spawner in `SimplifiedNPCSystem.jsx` to dynamically populate loaded chunks surrounding the player with zero performance spikes.

## Current Task: None
All planned phases are completed. The dynamic spawner and chunk lifecycle mount/unmount memory safety have been fully implemented, optimized, and validated for production builds.
