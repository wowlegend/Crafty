# Active Plan - Phase 4: SOTA 3D Pathfinding & 3-Phase Boss Events

## Current Goals
We are executing Phase 4 of the approved SOTA RPG comprehensive plan. This phase includes:
1. **Worker-Thread 3D AI Pathfinding (`ai.worker.js`):**
   - Upgrade A* pathfinder to understand voxel height grids (1-block height step traversal, jump-across-gap mechanics).
   - Implement packaged/linked alert mechanics where hitting or alerting a mob signals nearby packs.
2. **3-Phase Epic Shadow Dragon Boss Event (`AdvancedGameFeatures.jsx`):**
   - Phase 1 (Air Strike Mode): Flight movement pattern, casting fireballs from above.
   - Phase 2 (Grounded Rage Mode): Tail sweeps, high-impact physical knockback roars on landing.
   - Phase 3 (Enraged Fire Mode): Spawns active lava damage zones on the ground, summoning skeleton cohorts.
3. **Pet Orders Interface:**
   - Command pets using keys (Follow, Stay, Attack) with real-time UI indicator overlay updates.

## Technical Execution Flow
1. **A* Pathfinding Refactoring:** Read `frontend/src/workers/ai.worker.js` to understand the current grid traversal and thread message protocols. Modify the worker to compute height-aware steps and dynamic slope climbs.
2. **Boss Event Implementation:** Locate `frontend/src/AdvancedGameFeatures.jsx` (or similar files under `src/`) and construct the Shadow Dragon states, transitions, fireballs, and area-of-effect lava zones.
3. **Pet Commands:** Build the pet input listeners and visual feedback overlays, wiring them to the global game store or appropriate refs.
4. **Verification:** Confirm build compilation (`npm run build`) and perform functional checks.
