---
paths:
  - "frontend/src/GameScene.jsx"
  - "frontend/src/Components.jsx"
  - "frontend/src/world/Terrain.jsx"
  - "frontend/src/game/spawnPlacement.js"
---
# Physics and movement: what the code does not say at a glance

Replaces the deleted Antigravity debug-physics and fix-movement workflow notes, which named `App.jsx` and gravity -25.

- Physics is PAUSED in capture mode: `<Physics gravity={[0, -30, 0]} paused={isCaptureMode}>` in `frontend/src/GameScene.jsx`. A capture frame or visual baseline proves nothing about physics.
- Grounding is `supportedGround` in `frontend/src/game/grounding.js`: the kinematic character controller's `computedGrounded()`, kept only where a face within 45 degrees of up bears the capsule, because the controller's own flag counts a wall. The jump, the coyote time, the jump buffer and the glue in `frontend/src/Components.jsx` read it; `frontend/tests/gates/player-wall-ground-gates.test.jsx` holds it on the real Player, and the chaos gate does not see it.
- `<Physics>` steps the world on a fixed 1/60 s accumulator (`@react-three/rapier` 2.2, no `timeStep` prop), so above 60 Hz some frames take no world step. The controller's one write goes through `moveKinematic` (`frontend/src/game/kinematicMove.js`), which sweeps again a move given on a frame that took no step; a bare `setNextKinematicTranslation` replaces it, and the player walked at half speed at 120 Hz. `tests/integration/kinematic-move-rapier.test.js` measures it against real Rapier.
- Every per-frame mover advances by the frame's delta capped at `MAX_FRAME_STEP_SEC` (`frontend/src/game/frameStep.js`), through `worldDelta` or `realDelta` (`frontend/src/game/worldClock.js`); the AI bridge carries what a tick does not take. A long frame slows the whole world alike, so no mover out-walks another by stalling.
- For collider work, add `debug` to that `<Physics>` (`@react-three/rapier` 2.2 draws every collider), and take it out before committing.
- Movement is `moveVector` (`frontend/src/game/locomotion.js`), fed the x/z of `camera.getWorldDirection` in `Components.jsx`, never Euler angles. Its direction math is unit-tested in `frontend/src/game/locomotion.test.js`.
- `npm run test:look` (from `frontend/`) is the real-browser check that mouse movement under pointer lock turns the camera. It does not exercise WASD.
- Touch play enters through `enterPlay()` in `frontend/src/MenuSystem.jsx`.
