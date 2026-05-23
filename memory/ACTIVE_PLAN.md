# Active Plan: Phase 27 - SOTA Voxel Face Winding Correction & Robust Canvas-Bound Pointer Lock Sync

## Goal
Resolve see-through terrain rendering cracks and camera rotation desynchronization freezes on closing menus by correcting the remaining 4 cyclic voxel face windings to perfect Counter-Clockwise (CCW) culling, and introducing robust canvas-bound pointer locking.

## Proposed Checklist
- [ ] Surgically correct the remaining 4 cyclic voxel face windings (Top, Bottom, Front, Back) in `terrain.worker.js` to perfect Counter-Clockwise (CCW) winding.
- [ ] Update fallback pointer lock requesters in `App.jsx` to request lock on the canvas element before falling back to `document.body`.
- [ ] Update fallback pointer lock requesters in `InputManager.jsx` to query and target the canvas element.
- [ ] Verify the build compilation (`npm run build`) and run playtest suite (`npm run test`) to confirm zero rendering cracks and perfect locomotion recovery.
