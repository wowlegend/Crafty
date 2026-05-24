# Active Plan: Diagnostic Pivot for See-Through Terrain

## Goal
Resolve production see-through terrain visual anomalies by migrating custom attributes to standard natively-bound `color` attributes.

## Checklist
- [x] Migrate `Terrain.jsx` geometry buffers to set standard `color` attribute instead of custom `blockType`.
- [x] Re-map vertex and fragment shaders to read the packed `blockType` index from `color.r`.
- [x] Compile and verify production build locally.
- [x] Run playtest swarm tests to ensure stability.
