# Active Plan: WebGL Opaque/Transparent Pass Split & Synchronous Pointer Lock Recovery (Phase 25)

## Goal
Resolve the WebGL transparent-pass self-occlusion artifacts causing the see-through landscape, and eliminate the Pointer Lock desynchronization bug that causes the camera and mouse movement to freeze when returning from the Settings (ESC) or inventory/crafting menus.

## Proposed Checklist
- [x] Decompose chunk meshes into two distinct geometries: Opaque (solid terrain blocks) and Water (transparent liquid).
- [x] Implement separate materials for opaque (`opaqueMaterial`) and transparent (`waterMaterial`) passes with identical shader compiler hooks.
- [x] Update uniform setters inside `useFrame` to continuously bind clock time and night-cycle timeOfDay parameters for both materials.
- [x] Reconfigure `@react-three/drei`'s `PointerLockControls` to be persistently `enabled={true}`, ensuring its HTML5 event listeners never miss browser `pointerlockchange` transitions.
- [x] Refactor all menu close callbacks (Inventory, Crafting, Building Tools, Settings, World Manager, achievements, spell upgrades) to request pointer lock **synchronously** inside their user gesture event handlers rather than inside a `setTimeout` wrapper.
- [x] Verify build compilation (`npm run build`) and run automated Puppeteer playtests to confirm correct depth occlusion and zero pointer lock latency.
