# Active Plan: AI Behavior Trees Cover Systems & Dynamic Boss Voxel Destruction (Phase 24)

## Goal
Implement Phase 24: AI Behavior Trees with dynamic cover-seeking tactical logic, intermediate 2D height-map line-of-sight raycasting inside the AI worker, shadow dragon dynamic voxel terrain destruction, and global Zustand terrain worker binding.

## Proposed Checklist
- [x] Research & obtain user approval on the detailed implementation plan.
- [x] Expose the active terrain worker instance to Zustand store (`terrainWorker`) inside `Terrain.jsx`.
- [x] Implement `destroyVoxelsInRadius` in `AdvancedGameFeatures.jsx` and hook it into Shadow Dragon Phase 2 roar and Phase 3 lava zone spawning.
- [x] Update NPC health and maxHealth serialization inside `SimplifiedNPCSystem.jsx` TICK data.
- [x] Parse worker result `isCoverSeeking` status in `SimplifiedNPCSystem.jsx` and apply 20% speed boost + cyan particle effects.
- [x] Implement 2D Line-of-Sight height raycasting `hasLineOfSight(heightGrid, x1, z1, x2, z2)` in `ai.worker.js`.
- [x] Build Behavior Tree logic in `ai.worker.js` for Skeleton, Zombie, and Spider mobs to seek tactical cover when health < 25% max health.
- [x] Verify build compilation (`npm run build`) and run automated Puppeteer playtest swarm (`npm run test`).
- [ ] Execute Git commit and push all Phase 24 updates to GitHub.


