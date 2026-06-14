# S2-B2-pre-M2 — Perf Remediation Bundle (task #68) Implementation Plan

> **✅ SHIPPED.** S2-B2-pre-M2 perf remediation (#68) — the desktop perf gate passed (see `memory/S2B2-M2-PERF.md` + KEVIN-REVIEW #2). See CHANGELOG.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the confirmed pre-existing main-thread frame costs (STATE-REVIEW-2026-06-10 §3 findings 1–5) so the VOIDHAND M2 iPad FPS gate measures signal, not NPC-layer noise — restoring the Game-Loop-Isolation invariant (1 BLOCKING breach) and cutting the raycast/clone/shadow storms, with strict behavior parity and the visual gate held at 13/13.

**Architecture:** Extract-pure where stepping logic exists (enemy projectiles → `src/game/enemyProjectiles.js`; weather probe gate → `src/game/particleProbe.js`), transient-refs where React state was abused (projectile meshes), throttle-with-accumulated-delta where work ran at render rate for no gameplay reason (AI worker bridge → 15Hz + render-side damp in MobModel), allocation hoisting in the hottest physics call (`getMobGroundLevel` single Ray + single filter closure), and one new static gate (no shadow-casting pointLights) so the fixed pattern can't return.

**Tech Stack:** React 19 + R3F 9.5 useFrame, @react-three/rapier 2.2 (`rapier.Ray` reuse), zustand transient `getState()`, miniplex entities, vitest (node env for pure modules; static-gate pattern from `tests/gates/`).

**Verification gates (every task):** `cd /Users/kz/Code/Crafty/frontend && npx vitest run` green · `npm run build` clean · final task re-runs `npx vitest run --config vitest.visual.config.js` (must stay 13/13 — nothing here may alter any capture state; all changed behavior is gameplay-only or capture-frozen).

**Execution decision (Kevin pre-authorized "do all as you recommend"):** inline execution in the main session — T1/T3/T6 share `SimplifiedNPCSystem.jsx` (sequential by necessity); per-task commits; ONE adversarial review workflow over the full delta at the end (project method), then 4-piece + push.

---

### Task 1 (BLOCKING fix): EnemyProjectileSystem — pure stepper + transient meshes, setState only on membership change

**Files:**
- Create: `frontend/src/game/enemyProjectiles.js`
- Create: `frontend/src/game/enemyProjectiles.test.js`
- Modify: `frontend/src/SimplifiedNPCSystem.jsx:995-1044` (the whole `EnemyProjectileSystem` component)

- [ ] **Step 1: Write the failing test**

```js
// frontend/src/game/enemyProjectiles.test.js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { stepEnemyProjectiles, ENEMY_PROJECTILE_SPEED_SCALE, ENEMY_PROJECTILE_HIT_RADIUS, ENEMY_PROJECTILE_TTL_SEC } from './enemyProjectiles.js';

const mk = (pos, vel, age = 0) => ({ id: 1, position: new THREE.Vector3(...pos), velocity: new THREE.Vector3(...vel), age });
const FAR_PLAYER = new THREE.Vector3(999, 999, 999);

describe('stepEnemyProjectiles (pure)', () => {
  it('advances position by velocity * dt * 60 (legacy per-frame-at-60fps units), mutating IN PLACE (zero alloc)', () => {
    const p = mk([0, 0, 0], [0.4, 0, 0]);
    const posRef = p.position;
    const { survivors } = stepEnemyProjectiles([p], 1 / 60, FAR_PLAYER);
    expect(survivors).toHaveLength(1);
    expect(p.position).toBe(posRef);                       // same object — no clone per step
    expect(p.position.x).toBeCloseTo(0.4, 5);              // 0.4 * (1/60) * 60
    expect(ENEMY_PROJECTILE_SPEED_SCALE).toBe(60);
  });

  it('expires at TTL: age >= 3s drops out, hits stays 0', () => {
    const p = mk([0, 0, 0], [0, 0, 0], 2.99);
    const r1 = stepEnemyProjectiles([p], 0.005, FAR_PLAYER);
    expect(r1.survivors).toHaveLength(1);                  // 2.995 < 3
    const r2 = stepEnemyProjectiles(r1.survivors, 0.01, FAR_PLAYER);
    expect(r2.survivors).toHaveLength(0);                  // 3.005 >= 3
    expect(r2.hits).toBe(0);
    expect(ENEMY_PROJECTILE_TTL_SEC).toBe(3);
  });

  it('player hit inside 1.5u: removed + counted', () => {
    const player = new THREE.Vector3(1, 0, 0);
    const p = mk([0, 0, 0], [0, 0, 0]);                     // 1.0u away < 1.5
    const { survivors, hits } = stepEnemyProjectiles([p], 0.016, player);
    expect(hits).toBe(1);
    expect(survivors).toHaveLength(0);
    expect(ENEMY_PROJECTILE_HIT_RADIUS).toBe(1.5);
  });

  it('no membership change => survivors are the SAME refs in the same order (caller can detect transitions by length)', () => {
    const a = mk([0, 0, 0], [0.1, 0, 0]); const b = mk([5, 0, 0], [0, 0.1, 0], 1);
    const { survivors, hits } = stepEnemyProjectiles([a, b], 0.016, FAR_PLAYER);
    expect(hits).toBe(0);
    expect(survivors[0]).toBe(a);
    expect(survivors[1]).toBe(b);
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/game/enemyProjectiles.test.js` → FAIL (module not found).

- [ ] **Step 3: Write the pure module**

```js
// frontend/src/game/enemyProjectiles.js
// Pure stepper for enemy (skeleton) projectiles — extracted so the React system can be a thin
// transient wrapper. The old component called setState EVERY frame (fresh array even when empty),
// re-rendering at render rate forever + cloning velocity per projectile per frame
// (STATE-REVIEW-2026-06-10 BLOCKING #1 — Game-Loop-Isolation breach).
// Mutates position/age IN PLACE (hot path, zero allocation). Membership changed iff
// survivors.length !== list.length — that's the caller's only setState transition.
export const ENEMY_PROJECTILE_SPEED_SCALE = 60; // legacy tuning: velocity is per-frame-at-60fps units
export const ENEMY_PROJECTILE_HIT_RADIUS = 1.5;
export const ENEMY_PROJECTILE_TTL_SEC = 3;

export function stepEnemyProjectiles(list, dt, playerPos) {
  const survivors = [];
  let hits = 0;
  for (const p of list) {
    p.position.addScaledVector(p.velocity, dt * ENEMY_PROJECTILE_SPEED_SCALE);
    p.age += dt;
    if (p.position.distanceTo(playerPos) < ENEMY_PROJECTILE_HIT_RADIUS) { hits++; continue; }
    if (p.age < ENEMY_PROJECTILE_TTL_SEC) survivors.push(p);
  }
  return { survivors, hits };
}
```

- [ ] **Step 4: Run to verify green** — `npx vitest run src/game/enemyProjectiles.test.js` → 4 passed.

- [ ] **Step 5: Port the component** — replace `EnemyProjectileSystem` (SimplifiedNPCSystem.jsx:995-1044) with:

```jsx
const EnemyProjectileSystem = () => {
  // GLI fix (STATE-REVIEW-2026-06-10 BLOCKING #1): the live list is a REF mutated per frame by the
  // pure stepper (src/game/enemyProjectiles.js); React state mirrors MEMBERSHIP only (spawn /
  // expire / hit), so this component re-renders on transitions, never at render rate. Mesh
  // positions are written transiently each frame below (same pattern as EnhancedMagicSystem).
  const liveRef = useRef([]);
  const meshRefs = useRef(new Map());
  const [rendered, setRendered] = useState([]);
  const projectileId = useRef(0);
  const { camera } = useThree();

  useEffect(() => {
    useGameStore.setState({ spawnEnemyProjectile: (pos, target) => {
        const dir = new THREE.Vector3(target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]).normalize();
        liveRef.current.push({
            id: projectileId.current++,
            position: new THREE.Vector3(...pos).add(dir.clone().multiplyScalar(1)),
            velocity: dir.multiplyScalar(0.4),
            age: 0
        });
        setRendered([...liveRef.current]); // transition: spawn
    }});
  }, []);

  useFrame((state, delta) => {
    const list = liveRef.current;
    if (list.length === 0) return;
    const { survivors, hits } = stepEnemyProjectiles(list, delta, camera.position);
    if (hits > 0) {
      const damagePlayer = useGameStore.getState().damagePlayer;
      if (damagePlayer) for (let i = 0; i < hits; i++) damagePlayer(15, 'projectile');
    }
    if (survivors.length !== list.length) {
      liveRef.current = survivors;
      setRendered([...survivors]); // transition: expiry / hit
    }
    for (const p of liveRef.current) {
      const m = meshRefs.current.get(p.id);
      if (m) m.position.copy(p.position);
    }
  });

  return (
    <group>
        {rendered.map(p => (
            <mesh key={p.id} position={p.position}
                  ref={(m) => { if (m) meshRefs.current.set(p.id, m); else meshRefs.current.delete(p.id); }}>
                <boxGeometry args={[0.2, 0.2, 0.5]} />
                <meshStandardMaterial color="#F5F5DC" emissive="#ffffff" emissiveIntensity={0.5} />
            </mesh>
        ))}
    </group>
  );
};
```

Add the import at the top of SimplifiedNPCSystem.jsx alongside the other `./game/` imports: `import { stepEnemyProjectiles } from './game/enemyProjectiles.js';`
**Behavior parity:** same spawn offset (+1u along dir), same speed (0.4·60u/s), same 15 dmg `'projectile'`, same 1.5u hit radius, same 3s TTL. Capture-safe: spawns only come from mob attacks, which the capture-frozen AIWorkerSystem never issues; empty list → useFrame early-return (strictly less work than before, which setState'd in capture too).

- [ ] **Step 6: Full unit suite + build** — `npx vitest run` green, `npm run build` clean.

- [ ] **Step 7: Commit** — `git add frontend/src/game/enemyProjectiles.js frontend/src/game/enemyProjectiles.test.js frontend/src/SimplifiedNPCSystem.jsx && git commit` ("perf(GLI): EnemyProjectileSystem — pure stepper + transient meshes; setState only on membership change").

---

### Task 2: `getMobGroundLevel` — one reusable Ray + one persistent filter closure

**Files:**
- Modify: `frontend/src/world/Terrain.jsx:455-474`

- [ ] **Step 1: Verify the rapier compat `Ray` is a mutable plain-field class** — `sed -n '1,40p' node_modules/@dimforge/rapier3d-compat/geometry/ray.d.ts` (expect `origin: Vector; dir: Vector;` public fields). If NOT mutable, fall back to constructing one Ray per call but keep the hoisted filter closure (still removes the closure alloc).

- [ ] **Step 2: Replace the `setGetMobGroundLevel` block** (Terrain.jsx:455-474) with:

```jsx
        // S2-B2-pre-M2 perf (STATE-REVIEW-2026-06-10 #2): ONE reusable Ray + ONE persistent filter
        // closure. This is the hottest physics call in the game — AI height grids, leg IK, weather
        // particles, XP orbs and loot drops all route here; the previous per-call `new rapier.Ray`
        // + closure allocation was the dominant steady-state GC source (~2k calls/frame worst-case
        // siege-rainstorm). Probe semantics unchanged (same origin height, dir, toi, jitter).
        let probePlayerHandle;
        const probeFilter = (collider) => {
            if (probePlayerHandle === undefined) return true;
            const parent = collider.parent();
            return !parent || parent.handle !== probePlayerHandle;
        };
        const probeRay = new rapier.Ray({ x: 0, y: 255, z: 0 }, { x: 0, y: -1, z: 0 });

        useGameStore.getState().setGetMobGroundLevel((x, z) => {
            const playerRigidBody = useGameStore.getState().playerRigidBodyRef?.current;
            probePlayerHandle = playerRigidBody?.handle;
            // Jitter the coordinates slightly by +0.1 to avoid falling directly between voxel seams
            probeRay.origin.x = x + 0.1;
            probeRay.origin.y = 255;
            probeRay.origin.z = z + 0.1;
            const hit = world.castRay(probeRay, 300, true, undefined, undefined, undefined, playerRigidBody, probeFilter);
            if (hit) {
                return 255 - (hit.toi !== undefined ? hit.toi : hit.timeOfImpact);
            }
            return null;
        });
```

(Leave the adjacent `setCheckCollision` block untouched — its callers are low-frequency; noted as a future nibble, YAGNI now.)

- [ ] **Step 3: Suite + build green** (real-Rapier integration tests exercise the physics path).

- [ ] **Step 4: Commit** — "perf(raycast): hoist Ray + filter closure out of getMobGroundLevel (hottest physics call)".

---

### Task 3: AI worker bridge → 15Hz tick (accumulated delta) + render-side damp in MobModel

**Files:**
- Modify: `frontend/src/SimplifiedNPCSystem.jsx:751-814` (AIWorkerSystem useFrame) and `:133-138` (MobModel sync)

- [ ] **Step 1: Throttle the bridge.** In `AIWorkerSystem`, add next to its other refs: `const tickAccumRef = useRef(0);` and a module-level const near MOB_TYPES: `const AI_TICK_SEC = 1 / 15;`. Then in the useFrame, after the knockback loop (knockback STAYS render-rate — instant hit feel), gate everything from `const store = useGameStore.getState();` down through the `postMessage` behind the accumulator, passing the ACCUMULATED delta:

```jsx
    // S2-B2-pre-M2 perf (STATE-REVIEW-2026-06-10 #3): the AI bridge ticks at 15Hz, not render
    // rate. The mobsData rebuild (~20 fields × N mobs), the structured-clone postMessage, the
    // 81-cell aggro heightGrids and the reply ground-snap raycasts all drop from 60-120Hz to 15Hz
    // (4-8× cut; 120Hz ProMotion iPads no longer pay double). MobModel's render-side damp keeps
    // 15Hz authority updates reading as smooth motion. The worker receives the ACCUMULATED
    // seconds since the last tick (movement-speed parity), clamped vs tab-stall spikes.
    tickAccumRef.current += delta;
    if (tickAccumRef.current < AI_TICK_SEC) return;
    const tickDelta = Math.min(tickAccumRef.current, 0.25);
    tickAccumRef.current = 0;
```

…and in the `postMessage` payload change `delta,` → `delta: tickDelta,`.

- [ ] **Step 2: Damp MobModel.** Replace the two sync lines (`groupRef.current.position.copy(entity.position); groupRef.current.rotation.y = entity.rotation;` at :137-138) with (and add `const syncedOnce = useRef(false);` next to MobModel's other refs):

```jsx
    // 1. Sync position/rotation from the ECS entity (No React State!). The AI worker ticks at
    // 15Hz now (see AIWorkerSystem) — this exponential damp is what turns 15Hz authority updates
    // into smooth render-rate motion. Capture mode + first frame pin an EXACT copy (determinism:
    // a capture frame must not depend on how many settle frames the damp has seen).
    if (isCaptureMode() || !syncedOnce.current) {
      groupRef.current.position.copy(entity.position);
      groupRef.current.rotation.y = entity.rotation;
      syncedOnce.current = true;
    } else {
      const t = Math.min(1, delta * 10);
      groupRef.current.position.lerp(entity.position, t);
      const cur = groupRef.current.rotation.y;
      const dr = Math.atan2(Math.sin(entity.rotation - cur), Math.cos(entity.rotation - cur));
      groupRef.current.rotation.y = cur + dr * t;
    }
```

**Parity notes:** worker movement per wall-second is unchanged (speed × accumulated dt); attack cadence (`lastAttackTime` vs `now`) is seconds-scale — 66ms granularity is invisible; `isCaptureMode` early-return above the accumulator means capture still freezes everything; the gait-IK `speed` calc in MobModel derives from entity.position deltas — at 15Hz authority the per-frame entity delta is 0 on 3 of 4 frames, so use the GROUP's damped motion instead: in the gait block, replace `const dx = entity.position.x - prevPos.current.x;` (and the z line + the prevPos update at :174-178) to read `groupRef.current.position` instead of `entity.position` — the damped group moves every frame, keeping the leg-swing/IK `speed > 0` checks alive between ticks. (IK raycasts at :196-213 stay gated on `speed > 0` — moving mobs only, unchanged.)

- [ ] **Step 3: Suite + build green.**
- [ ] **Step 4: Commit** — "perf(ai): 15Hz worker tick w/ accumulated delta + damped MobModel sync (4-8× bridge/raycast cut)".

---

### Task 4: Weather ground-probe gate — near-ground band + frame stride

**Files:**
- Create: `frontend/src/game/particleProbe.js`
- Create: `frontend/src/game/particleProbe.test.js`
- Modify: `frontend/src/GameScene.jsx:557-621` (rain + snow loops; add a frame counter)

- [ ] **Step 1: Failing test**

```js
// frontend/src/game/particleProbe.test.js
import { describe, it, expect } from 'vitest';
import { shouldProbeGround, PROBE_NEAR_Y, PROBE_STRIDE } from './particleProbe.js';

describe('shouldProbeGround (pure)', () => {
  it('never probes above the near-ground band', () => {
    expect(shouldProbeGround(PROBE_NEAR_Y, 0, 0)).toBe(false);
    expect(shouldProbeGround(25, 3, 12)).toBe(false);
  });
  it('inside the band, probes exactly 1-in-stride particles per frame, rotating by frame', () => {
    const y = 0;
    const probedAtFrame0 = [0, 1, 2, 3, 4, 5, 6, 7].filter(i => shouldProbeGround(y, i, 0));
    expect(probedAtFrame0).toEqual([0, 4]);                       // (i+0) % 4 === 0
    const probedAtFrame1 = [0, 1, 2, 3, 4, 5, 6, 7].filter(i => shouldProbeGround(y, i, 1));
    expect(probedAtFrame1).toEqual([3, 7]);                       // (i+1) % 4 === 0
  });
  it('every particle in the band is probed at least once per stride window', () => {
    for (let i = 0; i < 16; i++) {
      const hit = [0, 1, 2, 3].some(f => shouldProbeGround(0, i, f));
      expect(hit).toBe(true);
    }
  });
  it('constants pinned', () => { expect(PROBE_NEAR_Y).toBe(12); expect(PROBE_STRIDE).toBe(4); });
});
```

- [ ] **Step 2: Run → FAIL (module not found).**
- [ ] **Step 3: The module**

```js
// frontend/src/game/particleProbe.js
// S2-B2-pre-M2 perf (STATE-REVIEW-2026-06-10 #2, weather term): gate for the weather particles'
// per-frame ground raycast. A particle falling from +25 only needs terrain testing near the
// ground band, and neighbors share temporal resolution — probe only below PROBE_NEAR_Y local
// height, striding across frames by index (each in-band particle still probes every
// PROBE_STRIDE frames ≤ 67ms@60fps). The caller's unconditional `y < -15` floor reset keeps
// correctness whenever a probe is skipped; worst case a drop visually clips elevated terrain for
// <4 frames. Cuts the worst-case rain/snow raycast term ~6×.
export const PROBE_NEAR_Y = 12;
export const PROBE_STRIDE = 4;
export function shouldProbeGround(localY, index, frame, nearY = PROBE_NEAR_Y, stride = PROBE_STRIDE) {
  if (localY >= nearY) return false;
  return ((index + frame) % stride) === 0;
}
```

- [ ] **Step 4: Run → green.**
- [ ] **Step 5: Wire GameScene.** Import `{ shouldProbeGround }` from `../game/particleProbe.js` (check GameScene's existing relative-import style: it's `./game/...` if GameScene sits in src/ root — it does, so `./game/particleProbe.js`). Add `const weatherFrameRef = useRef(0);` beside the weather refs; at the top of the weather useFrame (after the capture block): `const probeFrame = weatherFrameRef.current++;`. Then in the RAIN loop replace

```jsx
          let groundLevel = null;
          if (getMobGroundLevel) {
            groundLevel = getMobGroundLevel(px + r.x, pz + r.z);
          }
```
with
```jsx
          let groundLevel = null;
          if (getMobGroundLevel && shouldProbeGround(r.y, i, probeFrame)) {
            groundLevel = getMobGroundLevel(px + r.x, pz + r.z);
          }
```
and the SNOW loop's identical block with `shouldProbeGround(s.y, i, probeFrame)`. The reset conditions (`r.y < -15 || (groundLevel !== null && worldY < groundLevel)`) stay byte-identical.

- [ ] **Step 6: Suite + build green.** (Weather never runs in capture — `delta=0` and weather is tier-gated; visual unaffected.)
- [ ] **Step 7: Commit** — "perf(weather): near-ground band + frame-stride gate on rain/snow ground probes (~6× cut)".

---

### Task 5: Static gate — no shadow-casting pointLights (RED first), then remove `castShadow` from the spell-hand light

**Files:**
- Create: `frontend/tests/gates/dynamic-light-gates.test.js`
- Modify: `frontend/src/Components.jsx:1438`

- [ ] **Step 1: Write the gate (it must FAIL against today's src)**

```js
// frontend/tests/gates/dynamic-light-gates.test.js
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../src');
const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.jsx?$/.test(name)) out.push(p);
  }
  return out;
};

// Perf gate (STATE-REVIEW-2026-06-10 #5): a shadow-casting POINT light renders SIX cube-map
// shadow passes of the scene per frame while mounted — catastrophic for transient combat lights
// on the iPad envelope, and each mount/unmount also changes the light count (full lit-material
// program re-link hitch). The directional sun owns shadows; point lights must never cast.
describe('dynamic-light gate', () => {
  it('no pointLight in src/ casts shadows', () => {
    const offenders = [];
    for (const file of walk(SRC)) {
      const m = readFileSync(file, 'utf8').match(/<pointLight[^>]*castShadow/s);
      if (m) offenders.push(file.replace(SRC, 'src'));
    }
    expect(offenders, `shadow-casting pointLight(s) in: ${offenders.join(', ')}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → must be RED** — `npx vitest run tests/gates/dynamic-light-gates.test.js` → FAIL listing `src/Components.jsx`.
- [ ] **Step 3: Fix** — Components.jsx:1438: remove ` castShadow` from the spell-hand pointLight (leave position/distance/intensity/color untouched).
- [ ] **Step 4: Run → GREEN.** Visual note: the 13 capture states include no mid-cast frame (attackType='spell' is transient gameplay), so no re-baseline.
- [ ] **Step 5: Commit** — "perf(light): spell-hand pointLight no longer casts shadows + gate locking all pointLights shadowless".

---

### Task 6: Memoize the per-entity renderers

**Files:**
- Modify: `frontend/src/SimplifiedNPCSystem.jsx` — `MobModel` (:80), `XPOrbRender`, `LootDropRender` (locate: `grep -n "const XPOrbRender\|const LootDropRender" src/SimplifiedNPCSystem.jsx`)

- [ ] **Step 1: Wrap all three in `React.memo`** — `const MobModel = ({ entity }) => {` → `const MobModel = React.memo(({ entity }) => {` and the component's closing `};` → `});` (same mechanical wrap for XPOrbRender + LootDropRender). Entity objects are stable miniplex refs, so memo'd children skip reconciliation when the `useEntities` bridge re-renders NPCSystem on add/remove — a kill burst now reconciles only the changed keys instead of every mounted mob/orb/loot. Add above MobModel:

```jsx
// React.memo on the per-entity renderers (STATE-REVIEW-2026-06-10 #4 mitigation): the useEntities
// bridge re-renders NPCSystem on every entity add/remove; memo + stable entity refs confine that
// to the changed children. The full DEEPEN (transient query reads in useFrame, no bridge) stays
// tracked in the PRE-S2B audit / #68 follow-up — this is the cheap 80% for the M2 gate.
```

- [ ] **Step 2: Suite + build green.** (Internal `useState` (dialogue) + zustand selectors inside memo'd components still re-render themselves — memo only blocks parent-driven reconciliation. Correct.)
- [ ] **Step 3: Commit** — "perf(react): memoize MobModel/XPOrbRender/LootDropRender (kill-burst reconciliation confined)".

---

### Task 7: Lock `Components.jsx` into the voidhand no-re-mesh gate (passes today)

**Files:**
- Modify: `frontend/tests/gates/voidhand-noremesh-gates.test.js:17-21`

- [ ] **Step 1: Extend GATED** (quick-win slice of #69; the full repo-wide inversion stays #69):

```js
  const GATED = [
    'game/voidhand.js',           // the pure grab SM
    'game/kinetic.js',            // the kinetic economy
    'world/PhantomBlockSystem.jsx', // the held-phantom render proxy
    'Components.jsx',             // the SM WIRING surface — where M3 HURL/SLAM lands; verified
                                  // clean today (STATE-REVIEW-2026-06-10 #9: it was un-gated)
  ];
```

- [ ] **Step 2: Run the gate → green (4 files).** `npx vitest run tests/gates/voidhand-noremesh-gates.test.js`
- [ ] **Step 3: Commit** — "gate(voidhand): Components.jsx joins the no-re-mesh GATED list (the M3 wiring surface)".

---

### Task 8: Final verification + adversarial review + docs

- [ ] **Step 1:** `npx vitest run` (expect ~667+: 657 + 4 projectile + 4 probe + 1 light gate + 1 gate row) · `npm run build` · `npx vitest run --config vitest.visual.config.js` → **13/13, no re-baseline**.
- [ ] **Step 2:** Adversarial review workflow over `git diff` of the bundle (lenses: GLI/transient discipline, behavior parity incl. worker-delta math + damp determinism in capture, perf claim validity, gate quality). Fix confirmed findings, re-verify.
- [ ] **Step 3:** 4-piece update (CHANGELOG entry + ACTIVE_PLAN resume → M2 plan authoring) + commit + push + mark task #68 completed (and note the #69 quick-win slice).
