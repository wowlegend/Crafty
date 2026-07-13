# R3F Pointer Lock & Voxel Meshing (relocated from Agentic-Brain KNOWLEDGE.md §3.7f, 2026-07-13 — Crafty-specific, project layer owns it)

### 3.7f R3F Pointer Lock & Voxel meshing (added 2026-05-24)

**[HIGH] [Execution Protocol] [prov:self]** SOTA R3F Pointer Lock Persistence & Voxel Greedy Meshing:
1. **The Voxel Winding Problem**: When implementing voxel greedy meshing under strict `FrontSide` culling (which culls back-facing geometries to minimize fragment overdraw), all six coordinate permutations (Top, Bottom, Left, Right, Front, Back) must wind in perfect **Counter-Clockwise (CCW)** order when viewed from the outside of the voxel. Clockwise (CW) windings are completely culled by WebGL, making the terrain see-through. Falling back to `DoubleSide` culling is a performance anti-pattern that triggers depth buffer precision fights (z-fighting) and chunk boundary cracks/horizon slits.
   - *SOTA CCW Winding Coordinates*:
     - **Top (+Y)**: `c0 = [x, y+1, z+w]`, `c1 = [x+h, y+1, z+w]`, `c2 = [x+h, y+1, z]`, `c3 = [x, y+1, z]`.
     - **Bottom (-Y)**: `c0 = [x, y, z+w]`, `c1 = [x+h, y, z+w]`, `c2 = [x+h, y, z]`, `c3 = [x, y, z]`.
     - **Front (+Z)**: `c0 = [x, y, z+1]`, `c1 = [x, y+h, z+1]`, `c2 = [x+w, y+h, z+1]`, `c3 = [x+w, y, z+1]`.
     - **Back (-Z)**: `c0 = [x+w, y, z]`, `c1 = [x+w, y+h, z]`, `c2 = [x, y+h, z]`, `c3 = [x, y, z]`.
2. **The Pointer Lock Mismatch Problem**: In React Three Fiber, Drei's `PointerLockControls` binds to the `<canvas>` DOM element (`gl.domElement`). When a user gesture closes a menu, calling `document.body.requestPointerLock()` locks the pointer on `document.body` instead of the canvas container. Drei detects `document.pointerLockElement !== gl.domElement` and stops listening to mouse events, completely freezing camera look-rotations.
   - *The Solution*: Direct all fallback locking requests to a unified pointer lock wrapper checking `state.requestPointerLock` first, then querying and locking on the `<canvas>` DOM element before falling back to `document.body`. This maintains Drei synchrony and prevents camera rotation freezes.

**Companion artifacts:**
- `frontend/src/world/terrain.worker.js` (Greedy Mesher coordinates correction)
- `frontend/src/App.jsx` & `frontend/src/InputManager.jsx` (canvas-bound locking redirects)
- `~/Code/Agentic-Brain/memory/episodes.jsonl` 2026-05-24 entry

### 3.8 Coding Domain (Overlay Demotions)

> Rules demoted from `domains/coding.md` when overlay reaches 150-line cap.
> Promote back to overlay if repeatedly needed during coding sessions.

No demotions yet.

### 3.9 Investing Domain (Overlay Demotions)

> Rules demoted from `domains/investing.md` when overlay reaches 150-line cap.

No demotions yet.

### 3.10 Insurance Domain (Overlay Demotions)

> Rules demoted from `domains/insurance.md` when overlay reaches 150-line cap.

No demotions yet.

---

