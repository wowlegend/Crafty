# Active Plan - Phase 12: Expanded Mechanics & Depth

*Goal: Implement the final structural depth features to reach April 2026 production-ready standards.*

### Step 1: 3x3 Crafting Logic
- [x] Research current crafting UI in `MenuSystem.jsx` and `HUD.jsx`.
- [x] Implement a pattern-matching recipe engine (e.g., [stone, stone, stone] + [null, stick, null] -> Stone Pickaxe).
- [x] Connect the UI grid to the pattern matcher and update the player's inventory upon successful craft.

### Step 2: Advanced AI Behaviors
- [x] Update `ai.worker.js` to support new mob states: `ARCHERY` (Skeletons) and `LEAP` (Spiders).
- [x] Implement skeletal projectile spawning (arrows) in `SimplifiedNPCSystem.jsx` triggered by worker state.
- [x] Implement physics-based leaping for spiders when within a 10m range.

### Step 3: Deep Cave Systems
- [x] Modify `src/world/terrain.worker.js` to include 3D Simplex Noise subtraction.
- [x] Implement "Swiss Cheese" noise at Y-levels < 30 to carve out cavern networks.
- [ ] Ensure lighting (vertex colors) correctly handles interior cave walls. (Currently handled by default vertex colors, but could use ambient occlusion).

### Step 4: Biomes & Foliage Decorators
- [x] Implement a `BiomeSystem` in the terrain worker based on 2D moisture/temperature noise.
- [x] Add 3D "Structure" generation (Trees, Cacti) that spawns on top of suitable surface voxels.
- [x] Add biome-specific surface layers (Sand for Deserts, Snow for Mountains).

### Step 5: Final Polish & Hand-off
- [ ] Final build verification.
- [ ] Update documentation and mark project as "Production-Ready".
