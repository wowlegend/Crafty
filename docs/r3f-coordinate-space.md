# Three.js / R3F — Local Coordinate Space Alignment

> Origin: Crafty Phase 20 (sword trails + GPU instanced sparks), 2026-05-23.
> Relocated here 2026-05-31 from the sovereign Agentic-Brain `KNOWLEDGE.md` §13 —
> it's a project/domain rendering technique, not an agent-governance pattern.
> Applies to any R3F project (Crafty, Neondrop).

## Rule

In WebGL / Three.js / React Three Fiber (R3F) apps with **camera-locked or
viewport-relative groups** (first-person hands, HUD groups, attached weapon
meshes), compute dynamic attachments / coordinate paths (trails, sparks,
ribbons, spell beams) from **local transformation matrices**:

- **Local-space formula** — apply the child's local matrix relative to its
  parent group inside the frame loop:
  ```js
  tipCoord = localOffset.clone().applyMatrix4(childObject.matrix)
  ```
- **Anti-pattern (lagging world matrix)** — NEVER use
  `.applyMatrix4(childObject.matrixWorld)` in viewport-parented groups.
  `.matrixWorld` updates lag one frame in the Three.js renderer cycle, so
  dynamic meshes visually drift / jitter / disconnect from fast-moving parents.

## Empirical basis

Crafty first-person diagonal Bézier sword swings + dynamic ribbon trails
(2026-05-23). Switching to `.applyMatrix4(rightHandRef.current.matrix)` in
camera-parented space eliminated 100% of spatial trailing gaps and visual
disconnects — trails locked to the blade tip at 60+ FPS with zero delay.
