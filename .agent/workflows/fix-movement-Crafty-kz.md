---
description: "[CRAFTY] debug WASD, camera, and pointer lock movement issues"
---

# Player Movement Debugging (Crafty-Specific)

Use when WASD directions are wrong, camera flips, strafing is inverted, or controls feel laggy.

**Tech context**: Crafty uses `PointerLockControls` from drei, `RigidBody` from rapier, and `useFrame` for movement updates.

## 1. Check Direction Extraction

**ALWAYS use `camera.getWorldDirection()`** — never extract angles from Euler:

```jsx
// ✅ CORRECT — always matches camera look direction
const dir = new THREE.Vector3();
camera.getWorldDirection(dir);
const forward = new THREE.Vector3(dir.x, 0, dir.z).normalize();
const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
```

```jsx
// ❌ WRONG — breaks at gimbal lock, wrong at 180°
const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
const forward = new THREE.Vector3(-Math.sin(euler.y), 0, -Math.cos(euler.y));
```

## 2. Check Strafing Direction

A/D strafing sign must be `(moveD - moveA)`:

```jsx
const moveVec = forward.multiplyScalar(moveW - moveS)
  .add(side.multiplyScalar(moveD - moveA));  // D is positive, A is negative
```

If strafing is inverted, the sign is wrong.

## 3. Check Keyboard Input Method

**MUST use `useRef`** inside `useFrame` — never `useState`:

```jsx
// ✅ CORRECT — useRef reads current value without closures
const keysRef = useRef({});
useEffect(() => {
  const down = (e) => { keysRef.current[e.code] = true; };
  const up = (e) => { keysRef.current[e.code] = false; };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  return () => { /* cleanup */ };
}, []);

useFrame(() => {
  const moveW = keysRef.current['KeyW'] ? 1 : 0;  // Always fresh
});
```

```jsx
// ❌ WRONG — useState creates stale closures in useFrame
const [keys, setKeys] = useState({});
useFrame(() => {
  const moveW = keys['KeyW'] ? 1 : 0;  // Stale! Reads initial value forever
});
```

## 4. Check PointerLockControls Euler Order

`PointerLockControls` uses `'YXZ'` Euler order internally. If manually composing rotations, match this order.

## 5. Test All Directions

After any movement change, test all 8 directions systematically:

- W (forward), S (backward), A (left), D (right)
- W+A (forward-left), W+D (forward-right)
- S+A (backward-left), S+D (backward-right)
- Turn 180° and repeat all 8

## 6. Check Jump and Grounded State

Jump should check velocity threshold, not just a boolean flag:

```jsx
const vel = rigidBodyRef.current.linvel();
const isGrounded = Math.abs(vel.y) < 0.5;
```
