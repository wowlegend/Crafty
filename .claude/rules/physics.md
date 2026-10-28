---
paths:
  - "frontend/src/GameScene.jsx"
  - "frontend/src/Components.jsx"
  - "frontend/src/world/Terrain.jsx"
  - "frontend/src/game/spawnPlacement.js"
---
# Physics and movement: what the code does not say at a glance

Replaces the deleted `.agent/workflows` debug-physics and fix-movement guides, which named `App.jsx` and gravity -25.

- Physics is PAUSED in capture mode: `<Physics gravity={[0, -30, 0]} paused={isCaptureMode}>` in `frontend/src/GameScene.jsx`. A capture frame or visual baseline proves nothing about physics.
- The Rapier kinematic character controller owns grounding: `computedGrounded()` in `frontend/src/Components.jsx`.
- For collider work, add `debug` to that `<Physics>` (`@react-three/rapier` 2.2 draws every collider), and take it out before committing.
- Movement is `moveVector` (`frontend/src/game/locomotion.js`), fed the x/z of `camera.getWorldDirection` in `Components.jsx`, never Euler angles. Its direction math is unit-tested in `frontend/src/game/locomotion.test.js`.
- `npm run test:look` (from `frontend/`) is the real-browser check that mouse movement under pointer lock turns the camera. It does not exercise WASD.
- Touch play enters through `enterPlay()` in `frontend/src/MenuSystem.jsx`.
