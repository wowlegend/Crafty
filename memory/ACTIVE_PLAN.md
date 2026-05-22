# Active Plan: Phase 17 SOTA 3D Greedy Voxel Mesher

## Goal
Implement a mathematical 3D Greedy Voxel Meshing algorithm in the background Web Worker (`terrain.worker.js`) to slice-and-sweep visible faces, reducing vertex counts and physics trimesh triangles by 80-90%.

## Current Task: Coding Phase 17
1. Write 3-axis slice-and-sweep greedy mesher in `terrain.worker.js`.
2. Map winding-order corners for all 6 voxel faces.
3. Validate through Vite production compiler to ensure zero compilation stutters or build debt.
