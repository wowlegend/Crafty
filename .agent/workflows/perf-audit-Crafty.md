---
description: "[CRAFTY] audit React and Three.js performance — frame rate, re-renders, physics body count"
---

# Performance Audit (Crafty-Specific)

Use when the game feels laggy, frame rate drops, or movement is jittery.

**Tech context**: Crafty uses React 19 + Three.js R172 + Rapier physics WASM + InstancedMesh rendering.

## 1. Check useState in useFrame

`useState` inside `useFrame` causes stale closures AND triggers 60+ re-renders/sec:

// turbo

```bash
cd frontend/src
# Find files that use both useFrame and useState
for f in *.jsx **/*.jsx; do
  if grep -q "useFrame" "$f" 2>/dev/null && grep -q "useState" "$f" 2>/dev/null; then
    echo "CHECK: $f uses both useFrame and useState"
  fi
done
```

Any state read inside `useFrame` should be a `useRef` instead.

## 2. Check React.memo Usage

Heavy child components should be memoized:

```bash
cd frontend/src
grep -l "React.memo\|memo(" *.jsx **/*.jsx 2>/dev/null
```

Candidates for `React.memo`: `ChunkMesh`, `MobEntity`, `SpellProjectile`, any component rendered per-chunk or per-mob.

## 3. Check useCallback / useMemo

```bash
cd frontend/src
echo "=== useCallback ===" && grep -c "useCallback" *.jsx **/*.jsx 2>/dev/null | grep -v ":0$"
echo "=== useMemo ===" && grep -c "useMemo" *.jsx **/*.jsx 2>/dev/null | grep -v ":0$"
```

Functions passed as props should use `useCallback`. Expensive calculations (chunk generation, noise functions) should use `useMemo`.

## 4. Physics Body Count

Too many Rapier bodies tanks FPS:

```bash
cd frontend/src
grep -n "RigidBody\|Collider\|InstancedRigidBodies" *.jsx **/*.jsx 2>/dev/null
```

Target:

- ~50 TrimeshColliders (one per terrain chunk)
- 1 player CapsuleCollider
- ~20 mob colliders (spawned dynamically)
- **NOT** 80,000 individual block colliders

## 5. Render Distance vs Performance

Current settings in `Terrain.jsx`:

```text
RENDER_DISTANCE = 4 (load chunks within 4 of player)
Keep radius = RENDER_DISTANCE + 3 (keep chunks within 7)
```

If FPS is low, try reducing `RENDER_DISTANCE` to 3. If terrain disappears, increase keep radius.

## 6. InstancedMesh Optimization

Terrain uses `InstancedMesh` for rendering (one draw call per block type per chunk). Verify:

- No individual `<mesh>` per block (should all be instanced)
- `instanceMatrix` is set once per chunk, not per frame
- `frustumCulled={false}` with manual `computeBoundingSphere()`

## 7. Bundle Size Check

// turbo

```bash
cd frontend && npx vite build 2>&1 | grep -E "\.js|\.css"
```

If JS gzip > 1.3MB, consider:

- `React.lazy()` for UI panel components (Inventory, Crafting, Magic, etc.)
- `manualChunks` in `vite.config.js` to split vendor deps
- Dynamic import for `three` sub-modules not used at startup

## 8. Frame Rate Profiling

Add temporary FPS counter in `useFrame`:

```jsx
const frameCount = useRef(0);
const lastTime = useRef(performance.now());
useFrame(() => {
  frameCount.current++;
  const now = performance.now();
  if (now - lastTime.current > 1000) {
    console.log(`FPS: ${frameCount.current}`);
    frameCount.current = 0;
    lastTime.current = now;
  }
});
```

Target: 60 FPS stable. Below 30 FPS = investigate.
