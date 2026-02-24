---
description: "[CRAFTY] debug physics collision issues — player falling through terrain, collider misalignment"
---

# Physics Collision Debugging (Crafty-Specific)

Use when the player falls through terrain, colliders don't match visuals, or physics bodies behave unexpectedly.

**Tech context**: Crafty uses `@react-three/rapier` with `TrimeshCollider` for terrain and `CapsuleCollider` for the player.

## 1. Enable Debug Renderer

In `App.jsx`, temporarily add `debug` prop to Physics:

```jsx
<Physics gravity={[0, -25, 0]} debug>
```

This renders wireframe outlines of all colliders. Compare against visual meshes.

## 2. Check Collider-Mesh Alignment

Common causes of fall-through:

- Collider vertices in **local space** but mesh in **world space** (or vice versa)
- Height offset missing (terrain block tops need `+1` to match visual surface)
- Scale mismatch between collider and mesh

For `TrimeshCollider`, verify vertices are in correct world-space positions:

```jsx
// Vertices MUST include world position offset
const vx = (localX + chunkWorldX);
const vy = height + 1;  // +1 to match block top surface
const vz = (localZ + chunkWorldZ);
```

## 3. Check Chunk Loading/Unloading

Terrain disappears if chunks unload too aggressively:

```text
RENDER_DISTANCE = 4  (how far to LOAD)
Keep radius = RENDER_DISTANCE + 3  (how far to KEEP — must be larger)
```

If terrain vanishes underfoot, increase keep radius.

## 4. Check Void Catch

Player should be teleported back if falling below terrain:

```jsx
if (pos.y < -10) {
  rigidBodyRef.current.setTranslation({ x: pos.x, y: 40, z: pos.z }, true);
  rigidBodyRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
  return;  // IMPORTANT: return guard prevents further physics processing
}
```

## 5. Physics Body Count

Too many physics bodies = lag + instability. Check count:

```bash
# Search for collider components
grep -c "Collider\|RigidBody\|InstancedRigidBodies" frontend/src/**/*.jsx frontend/src/*.jsx
```

- Good: ~50 TrimeshColliders (one per chunk) + 1 player + ~20 mobs
- Bad: 80,000 individual CuboidColliders (one per terrain block)

## 6. CCD (Continuous Collision Detection)

For fast-moving bodies (spell projectiles), enable CCD:

```jsx
<RigidBody ccd={true}>
```

Without CCD, fast objects can tunnel through thin colliders.
