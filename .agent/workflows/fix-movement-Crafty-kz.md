---
description: "[CRAFTY] debug WASD, camera, and pointer lock movement issues"
---

# Player Movement Debugging (Crafty-Specific)

Use when WASD directions are wrong, camera flips, strafing is inverted, or controls feel laggy.

**Tech context**: Crafty uses `PointerLockControls` from drei, `RigidBody` from rapier, and `miniplex` ECS / `Zustand` for state management.

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

## 3. Check Keyboard Input Method (Local keysRef or Zustand/ECS Standard)

**MUST use transient reads** inside `useFrame` — never local `useState` or reactive state subscriptions which cause massive re-renders. Crafty supports two acceptable high-performance patterns:

### Pattern A: Local Component-Level `keysRef` (Used in `Player` Component)
Define a local, non-reactive reference containing active keyboard states, updating it via raw window event listeners inside `useEffect`:

```jsx
// ✅ CORRECT — Used in Components.jsx Player
const keysRef = useRef({});
useEffect(() => {
  const down = (e) => { keysRef.current[e.code] = true; };
  const up = (e) => { keysRef.current[e.code] = false; };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
  };
}, []);

useFrame(() => {
  const keys = keysRef.current;
  const moveW = keys['KeyW'] ? 1 : 0; // High-frequency non-reactive read
});
```

### Pattern B: Centralized Zustand/ECS Transient Inputs
Alternatively, centralize inputs into a global store or ECS components, reading it transiently:

```jsx
// ✅ CORRECT — Alternative decoupled standard
useFrame(() => {
  const { forward, backward, left, right } = useStore.getState().inputs;
  const moveW = forward ? 1 : 0;
});
```

```jsx
// ❌ WRONG — useState inside frame updates
const [keys, setKeys] = useState({});
useFrame(() => {
  const moveW = keys['KeyW'] ? 1 : 0; // Stale closure or extreme rendering lag!
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