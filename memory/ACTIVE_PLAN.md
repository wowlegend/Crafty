# Active Plan: Fix See-Through Terrain & Chest Interaction

## Goal
Resolve production see-through terrain visual anomalies and fix chests trapped underground.

## Checklist
- [x] Upgrade `vBlockType` varying to `flat varying` in `Terrain.jsx` shaders.
- [x] Lower chest altitude snapping threshold from `h > 16` to `h > 0` in `QuestSystem.jsx`.
- [x] Compile and verify production build locally.
- [x] Run playtest swarm tests to ensure stability.
