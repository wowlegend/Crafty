# Active Plan — Voxel Engine Control & Graphics Polish

This plan addresses all player navigation/controls/spawning failures and modernizes the graphics/landscape aesthetics to SOTA voxel standards (Minecraft-level and beyond).

## Objective
1. **Butter-Smooth Player WASD & Slide Physics:** Solve player self-collision on Knee/Head raycasts by passing a custom Rapier filter callback that ignores the player's own rigid body.
2. **Accurate Ground Spawning & Zero-Gravity Spawn Illusion:** Remove camera "skyfall lerp" effect by instantly setting camera coordinates on spawn, and optimize top-down spawning raycast using the player filter callback.
3. **Infinite Jump Fix:** Correct grounded check raycast by adding the player filter callback, ensuring spacebar cannot be pressed in mid-air.
4. **Perfect Corner Shading (Next-Gen Voxel Shading):** Fix the buggy vertex-level Ambient Occlusion in `terrain.worker.js` to use correct coordinate offsets per face alignment.
5. **Interactive Block Placing/Breaking Polish:** Pass the player filter callback to target outline and click raycasts so that the player's own body never blocks block interactions.

## Proposed Changes

### 1. Store Hardening
- **[MODIFY] [useGameStore.jsx](file:///Users/kz/Code/Crafty/frontend/src/store/useGameStore.jsx)**: Add `playerRigidBodyRef` and its setter to Zustand state.

### 2. Player Component Polish
- **[MODIFY] [Components.jsx](file:///Users/kz/Code/Crafty/frontend/src/Components.jsx)**:
  - Register `playerRigidBodyRef` to Zustand on mount.
  - Apply `filterSelf` to the grounded check raycast and horizontal (Head/Knee) raycasts.
  - Instantly sync camera position to player position on spawn chunk loaded to prevent skyfall lerp transition.

### 3. Terrain Raycasts & Interactions
- **[MODIFY] [Terrain.jsx](file:///Users/kz/Code/Crafty/frontend/src/world/Terrain.jsx)**:
  - Expose the player's rigid body reference and filter it out in `getMobGroundLevel` top-down raycast.
  - Apply `filterSelf` to `TargetOutline` raycast and `handleClick` place/break raycasts.
  - Clean up `blockIdMap` to map all placed blocks correctly.

### 4. Next-Gen Shader & Geometry Shading
- **[MODIFY] [terrain.worker.js](file:///Users/kz/Code/Crafty/frontend/src/world/terrain.worker.js)**:
  - Implement mathematically correct Ambient Occlusion (AO) corner neighbor checks on Y, X, and Z-aligned voxel faces.
  - Apply authentic Minecraft-style AO shading formula (`1.0 - (aoValue * 0.18)` with both-sides occlusion lock).

## Verification Plan
1. Confirm local dev server builds successfully.
2. Verify player lands instantly on spawn without skyfall lerp or terrain clipping.
3. Test WASD movement, ensuring butter-smooth sliding against solid block walls.
4. Test spacebar jumping, verifying single jumps are physics-accurate with zero infinite flight.
5. Verify block targeting outline and left/right click block breaking/placing is fully responsive.
6. Walk around and observe beautiful, smooth, dark shadows in block corners and edges.
